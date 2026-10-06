"""End-of-day close: what a cashier's drawer should hold, and the Z-report.

All days are Africa/Kigali calendar days. Expected cash is the opening float plus
the drawer effect of that day's cash sale-side payments:

- payments the cashier recorded count by direction ("in" adds, "out" refunds subtract);
- a reversal counts against the drawer of the payment it reverses (whoever pressed
  the button, the money goes back out of — or into — the drawer it came from).

Supplier payments are not drawer money in this model and are left out.
"""
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.services import can_approve, verify_approval
from finance.models import DailyClose, Payment
from sales.models import Sale, SaleItem, SaleReturn

ZERO = Decimal("0.00")


def day_bounds(business_date):
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(business_date, time.min), tz)
    return start, start + timedelta(days=1)


def _drawer_effect(payment):
    """+ for money into the drawer, - for money out. Reversal rows carry negative amounts."""
    return payment.amount if payment.direction == Payment.Direction.IN else -payment.amount


def drawer_payments(cashier, business_date):
    """Sale-side payments that moved money through this cashier's drawer that day."""
    start, end = day_bounds(business_date)
    return (
        Payment.objects.filter(sale__isnull=False, paid_at__gte=start, paid_at__lt=end)
        .filter(
            Q(reversal_of__isnull=True, recorded_by=cashier)
            | Q(reversal_of__isnull=False, reversal_of__recorded_by=cashier)
        )
        .select_related("sale", "reversal_of")
        .order_by("paid_at", "pk")
    )


def day_figures(cashier, business_date, opening_float=ZERO):
    opening_float = Decimal(opening_float or 0)
    start, end = day_bounds(business_date)

    by_method = {
        method: {"in": ZERO, "out": ZERO, "net": ZERO, "references": []}
        for method in Payment.Method.values
    }
    debt_collected = ZERO
    for payment in drawer_payments(cashier, business_date):
        bucket = by_method[payment.method]
        effect = _drawer_effect(payment)
        if effect >= 0:
            bucket["in"] += effect
        else:
            bucket["out"] += -effect
        bucket["net"] += effect
        if payment.method != Payment.Method.CASH and payment.reference:
            bucket["references"].append({
                "payment_id": payment.pk, "sale_id": payment.sale_id, "reference": payment.reference,
                "amount": effect,
            })
        original_sale_day = timezone.localdate(payment.sale.sale_date)
        if (
            payment.direction == Payment.Direction.IN
            and payment.reversal_of_id is None
            and original_sale_day < business_date
        ):
            debt_collected += payment.amount

    sales = Sale.objects.filter(employee=cashier, sale_date__gte=start, sale_date__lt=end)
    kept = sales.exclude(status=Sale.SaleStatus.VOIDED)
    discounts = (
        SaleItem.objects.filter(sale__in=kept, discount_amount__gt=0).aggregate(total=Sum("discount_amount"))["total"]
        or ZERO
    )
    returns = SaleReturn.objects.filter(sale__employee=cashier, created_at__gte=start, created_at__lt=end)
    returns_totals = returns.aggregate(refunded=Sum("refund_total"), paid_out=Sum("paid_out"))
    new_credit = sum((sale.balance for sale in kept if sale.balance > 0), ZERO)

    expected_cash = opening_float + by_method[Payment.Method.CASH]["net"]
    return {
        "cashier": cashier.pk,
        "cashier_name": cashier.full_name,
        "business_date": business_date,
        "opening_float": opening_float,
        "expected_cash": expected_cash,
        "by_method": by_method,
        "sales_count": kept.count(),
        "sales_total": kept.aggregate(total=Sum("total_amount"))["total"] or ZERO,
        "voided_count": sales.filter(status=Sale.SaleStatus.VOIDED).count(),
        "discounts_given": discounts,
        "returns_count": returns.count(),
        "returns_refunded": returns_totals["refunded"] or ZERO,
        "returns_paid_out": returns_totals["paid_out"] or ZERO,
        "debt_collected": debt_collected,
        "new_credit": new_credit,
        "already_closed": DailyClose.objects.filter(cashier=cashier, business_date=business_date).exists(),
    }


def _jsonable(value):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def close_day(cashier, business_date, opening_float, counted_cash, user, approval, note=""):
    """Close a cashier's day. A manager/admin confirms with their PIN; closed_by is them.

    Staff may only close their own day. One close per cashier per day, never reopened.
    """
    if user.pk != cashier.pk and not can_approve(user):
        raise PermissionDenied("You can only close your own day.")
    if business_date > timezone.localdate():
        raise ValidationError({"business_date": "A day in the future can't be closed."})
    opening_float = Decimal(opening_float or 0)
    counted_cash = Decimal(counted_cash)
    if opening_float < 0 or counted_cash < 0:
        raise ValidationError("Amounts can't be negative.")
    if not approval:
        raise ValidationError({"approval": "A manager must confirm the close with their PIN."})
    approver = verify_approval(approval.get("approver_username"), approval.get("pin"))

    with transaction.atomic():
        if DailyClose.objects.select_for_update().filter(cashier=cashier, business_date=business_date).exists():
            raise ValidationError("This day is already closed for this cashier.")
        figures = day_figures(cashier, business_date, opening_float)
        summary = {
            key: figures[key]
            for key in (
                "sales_count", "sales_total", "voided_count", "discounts_given", "returns_count",
                "returns_refunded", "returns_paid_out", "debt_collected", "new_credit",
            )
        }
        try:
            with transaction.atomic():
                close = DailyClose.objects.create(
                    cashier=cashier, business_date=business_date, opening_float=opening_float,
                    expected_cash=figures["expected_cash"],
                    expected_by_method=_jsonable(figures["by_method"]), summary=_jsonable(summary),
                    counted_cash=counted_cash, variance=counted_cash - figures["expected_cash"],
                    note=(note or "").strip(), closed_by=approver,
                )
        except IntegrityError:
            raise ValidationError("This day is already closed for this cashier.")
    return close
