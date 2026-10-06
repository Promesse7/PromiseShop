"""Payments and debt: who owes us, whom we owe, and every payment against them.

Balances are always computed from finance.Payment rows. Sale.amount_paid and
Purchase.amount_paid are caches refreshed inside the same transaction as each
payment (refresh_sale_payments / refresh_purchase_payments).
"""
import uuid
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Case, DecimalField, F, Q, Sum, When
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from finance.models import Payment
from purchasing.models import Purchase
from sales.models import Customer, Sale

ZERO = Decimal("0.00")
CREDIT_DAYS = 30
# Sales whose balance counts as money owed to the shop. Module G adds
# "partially_returned" here.
OPEN_SALE_STATUSES = (Sale.SaleStatus.COMPLETED,)
AGING_BUCKETS = ("not_due", "1_30", "31_60", "61_90", "90_plus")


def _signed_sum(payments, positive_direction):
    """Sum of amounts, counting `positive_direction` rows up and the other direction down."""
    total = payments.aggregate(
        total=Sum(
            Case(
                When(direction=positive_direction, then=F("amount")),
                default=-F("amount"),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            )
        )
    )["total"]
    return total or ZERO


def sale_payment_status(total, amount_paid):
    if amount_paid >= total:
        return Sale.PaymentStatus.PAID
    if amount_paid > 0:
        return Sale.PaymentStatus.PARTIAL
    return Sale.PaymentStatus.CREDIT


def purchase_payment_status(total, amount_paid):
    if total > 0 and amount_paid >= total:
        return Purchase.PaymentStatus.PAID
    if amount_paid > 0:
        return Purchase.PaymentStatus.PARTIAL
    return Purchase.PaymentStatus.UNPAID


def refresh_sale_payments(sale):
    """Recompute the cached amount_paid / payment_status from the sale's payments."""
    sale.amount_paid = _signed_sum(Payment.objects.filter(sale=sale), Payment.Direction.IN)
    sale.payment_status = sale_payment_status(sale.total_amount, sale.amount_paid)
    sale.save(update_fields=["amount_paid", "payment_status"])
    return sale


def refresh_purchase_payments(purchase):
    """Recompute the cached amount_paid / payment_status from the purchase's payments.

    The amount owed for a purchase is its total_paid (the agreed buying price per
    line); total_invoiced is what the supplier's paper says and stays a reporting
    figure.
    """
    purchase.amount_paid = _signed_sum(Payment.objects.filter(purchase=purchase), Payment.Direction.OUT)
    purchase.payment_status = purchase_payment_status(purchase.total_paid, purchase.amount_paid)
    purchase.save(update_fields=["amount_paid", "payment_status"])
    return purchase


def validate_method_and_reference(method, reference):
    if method not in Payment.Method.values:
        raise ValidationError({"method": f"Invalid payment method: {method}"})
    if method != Payment.Method.CASH and not (reference or "").strip():
        raise ValidationError({"reference": "A transaction reference is required for non-cash payments."})


def default_due_date(on_date=None):
    return (on_date or timezone.localdate()) + timedelta(days=CREDIT_DAYS)


def open_sales_for(customer):
    return Sale.objects.filter(
        customer=customer, status__in=OPEN_SALE_STATUSES, amount_paid__lt=F("total_amount")
    )


def customer_balance(customer):
    totals = Sale.objects.filter(customer=customer, status__in=OPEN_SALE_STATUSES).aggregate(
        total=Sum("total_amount"), paid=Sum("amount_paid")
    )
    return (totals["total"] or ZERO) - (totals["paid"] or ZERO)


def record_customer_payment(customer, amount, method, reference, user, sale_ids=None, note="", paid_at=None):
    """Take money from a customer against their open sales, oldest due first.

    Returns (receipt_group, [payments]). Refuses more than the customer owes in
    total (or on the chosen sales).
    """
    amount = Decimal(amount)
    if amount <= 0:
        raise ValidationError({"amount": "Amount must be more than zero."})
    validate_method_and_reference(method, reference)

    with transaction.atomic():
        candidates = open_sales_for(customer)
        if sale_ids:
            candidates = candidates.filter(pk__in=sale_ids)
            if candidates.count() != len(set(sale_ids)):
                raise ValidationError({"sale_ids": "Every chosen sale must be an open sale of this customer."})
        locked = list(candidates.select_for_update().order_by("pk"))
        locked.sort(key=lambda s: (s.due_date or s.sale_date.date(), s.sale_date, s.pk))
        owed = sum((s.total_amount - s.amount_paid for s in locked), ZERO)
        if owed <= 0:
            raise ValidationError("This customer has nothing to pay.")
        if amount > owed:
            raise ValidationError({"amount": f"Amount is more than the customer owes ({owed})."})

        group = uuid.uuid4()
        payments = []
        remaining = amount
        for sale in locked:
            if remaining <= 0:
                break
            portion = min(remaining, sale.total_amount - sale.amount_paid)
            payments.append(Payment.objects.create(
                direction=Payment.Direction.IN, sale=sale, amount=portion, method=method,
                reference=(reference or "").strip(), recorded_by=user, note=note or "",
                receipt_group=group, paid_at=paid_at or timezone.now(),
            ))
            refresh_sale_payments(sale)
            remaining -= portion
    return group, payments


def record_supplier_payment(purchase, amount, method, reference, user, note="", paid_at=None):
    amount = Decimal(amount)
    if amount <= 0:
        raise ValidationError({"amount": "Amount must be more than zero."})
    validate_method_and_reference(method, reference)

    with transaction.atomic():
        locked = Purchase.objects.select_for_update().get(pk=purchase.pk)
        if locked.status == Purchase.Status.CANCELLED:
            raise ValidationError("Cannot pay a cancelled purchase.")
        owed = locked.total_paid - locked.amount_paid
        if amount > owed:
            raise ValidationError({"amount": f"Amount is more than is owed on this purchase ({owed})."})
        payment = Payment.objects.create(
            direction=Payment.Direction.OUT, purchase=locked, amount=amount, method=method,
            reference=(reference or "").strip(), recorded_by=user, note=note or "",
            paid_at=paid_at or timezone.now(),
        )
        refresh_purchase_payments(locked)
        if locked.payment_needs_review:
            locked.payment_needs_review = False
            locked.save(update_fields=["payment_needs_review"])
    return payment


def confirm_purchase_payment_review(purchase):
    """The owner confirms a migrated purchase's payments are right as recorded."""
    with transaction.atomic():
        locked = Purchase.objects.select_for_update().get(pk=purchase.pk)
        locked.payment_needs_review = False
        locked.save(update_fields=["payment_needs_review"])
    return locked


def reverse_payment(payment, user, reason):
    if not (reason or "").strip():
        raise ValidationError({"reason": "A reason is required to reverse a payment."})
    with transaction.atomic():
        locked = Payment.objects.select_for_update().get(pk=payment.pk)
        if locked.reversal_of_id is not None:
            raise ValidationError("A reversal cannot itself be reversed.")
        if Payment.objects.filter(reversal_of=locked).exists():
            raise ValidationError("This payment has already been reversed.")
        if locked.sale_id:
            target = Sale.objects.select_for_update().get(pk=locked.sale_id)
        else:
            target = Purchase.objects.select_for_update().get(pk=locked.purchase_id)
        reversal = Payment.objects.create(
            direction=locked.direction, sale_id=locked.sale_id, purchase_id=locked.purchase_id,
            amount=-locked.amount, method=locked.method, reference=locked.reference,
            recorded_by=user, note=reason.strip(), reversal_of=locked,
        )
        if locked.sale_id:
            refresh_sale_payments(target)
        else:
            refresh_purchase_payments(target)
    return reversal


def _bucket_for(due_date, as_of):
    days = (as_of - due_date).days
    if days <= 0:
        return "not_due"
    if days <= 30:
        return "1_30"
    if days <= 60:
        return "31_60"
    if days <= 90:
        return "61_90"
    return "90_plus"


def _empty_buckets():
    return {key: ZERO for key in AGING_BUCKETS}


def customer_aging(as_of=None):
    """Open customer balances, per customer and in aging buckets (Kigali dates)."""
    as_of = as_of or timezone.localdate()
    totals = _empty_buckets()
    rows = {}
    sales = (
        Sale.objects.filter(status__in=OPEN_SALE_STATUSES, amount_paid__lt=F("total_amount"))
        .select_related("customer")
        .order_by("pk")
    )
    for sale in sales:
        balance = sale.total_amount - sale.amount_paid
        due = sale.due_date or timezone.localdate(sale.sale_date)
        bucket = _bucket_for(due, as_of)
        totals[bucket] += balance
        key = sale.customer_id
        row = rows.setdefault(key, {
            "customer_id": sale.customer_id,
            "name": sale.customer.name if sale.customer else "Walk-in",
            "phone": sale.customer.phone if sale.customer else None,
            "credit_limit": sale.customer.credit_limit if sale.customer else None,
            "balance": ZERO, "open_sales": 0, "oldest_due_date": due,
            "buckets": _empty_buckets(),
        })
        row["balance"] += balance
        row["open_sales"] += 1
        row["oldest_due_date"] = min(row["oldest_due_date"], due)
        row["buckets"][bucket] += balance
    result = sorted(rows.values(), key=lambda r: (r["oldest_due_date"], -r["balance"]))
    for row in result:
        row["overdue"] = row["oldest_due_date"] < as_of
    return {"as_of": as_of, "totals": totals, "total": sum(totals.values(), ZERO), "rows": result}


def supplier_aging(as_of=None):
    """What the shop owes suppliers on received purchases, plus migrated purchases to review."""
    as_of = as_of or timezone.localdate()
    totals = _empty_buckets()
    rows = {}
    purchases = (
        Purchase.objects.filter(status=Purchase.Status.RECEIVED)
        .filter(Q(amount_paid__lt=F("total_paid")) | Q(payment_needs_review=True))
        .select_related("supplier")
        .order_by("pk")
    )
    for purchase in purchases:
        balance = purchase.total_paid - purchase.amount_paid
        due = purchase.due_date or purchase.purchase_date
        bucket = _bucket_for(due, as_of)
        if balance > 0:
            totals[bucket] += balance
        row = rows.setdefault(purchase.supplier_id, {
            "supplier_id": purchase.supplier_id, "name": purchase.supplier.name,
            "balance": ZERO, "open_purchases": [], "oldest_due_date": due,
            "needs_review": False, "buckets": _empty_buckets(),
        })
        row["balance"] += max(balance, ZERO)
        row["oldest_due_date"] = min(row["oldest_due_date"], due)
        row["needs_review"] = row["needs_review"] or purchase.payment_needs_review
        if balance > 0:
            row["buckets"][bucket] += balance
        row["open_purchases"].append({
            "purchase_id": purchase.pk, "invoice_number": purchase.invoice_number,
            "purchase_date": purchase.purchase_date, "due_date": due,
            "total": purchase.total_paid, "amount_paid": purchase.amount_paid,
            "balance": balance, "needs_review": purchase.payment_needs_review,
        })
    result = sorted(rows.values(), key=lambda r: (r["oldest_due_date"], -r["balance"]))
    for row in result:
        row["overdue"] = row["balance"] > 0 and row["oldest_due_date"] < as_of
    return {"as_of": as_of, "totals": totals, "total": sum(totals.values(), ZERO), "rows": result}


def customer_statement(customer, date_from=None, date_to=None):
    """Sales (debits) and payments (credits) in a period, with a running balance.

    Only sales that still count as owed (completed) and their payments appear;
    cancelled and returned sales drop out of the account entirely.
    """
    sales = Sale.objects.filter(customer=customer, status__in=OPEN_SALE_STATUSES)
    payments = Payment.objects.filter(sale__in=sales)

    def sale_date(s):
        return timezone.localdate(s.sale_date)

    def pay_date(p):
        return timezone.localdate(p.paid_at)

    def credit_of(p):
        return p.amount if p.direction == Payment.Direction.IN else -p.amount

    opening = ZERO
    entries = []
    for s in sales:
        d = sale_date(s)
        if date_from and d < date_from:
            opening += s.total_amount
        elif not date_to or d <= date_to:
            entries.append({
                "date": d, "kind": "sale", "reference": f"Sale #{s.pk}", "sale_id": s.pk,
                "debit": s.total_amount, "credit": ZERO, "sort": (s.sale_date, 0, s.pk),
            })
    for p in payments:
        d = pay_date(p)
        if date_from and d < date_from:
            opening -= credit_of(p)
        elif not date_to or d <= date_to:
            entries.append({
                "date": d, "kind": "reversal" if p.reversal_of_id else "payment",
                "reference": f"Payment #{p.pk}" + (f" ({p.reference})" if p.reference else ""),
                "sale_id": p.sale_id, "payment_id": p.pk, "method": p.method,
                "debit": ZERO, "credit": credit_of(p), "sort": (p.paid_at, 1, p.pk),
            })
    entries.sort(key=lambda e: e.pop("sort"))
    running = opening
    for entry in entries:
        running += entry["debit"] - entry["credit"]
        entry["balance"] = running
    return {
        "customer_id": customer.pk, "name": customer.name, "phone": customer.phone,
        "from": date_from, "to": date_to, "opening_balance": opening,
        "closing_balance": running, "entries": entries,
        "current_balance": customer_balance(customer),
    }
