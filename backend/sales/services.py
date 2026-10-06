import uuid
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.models import Employee
from accounts.services import can_approve, verify_approval
from catalog.models import ProductPricing
from sales.pricing import evaluate_line, max_staff_discount_pct, price_floor
from finance.models import Payment
from finance.services import (
    customer_balance, default_due_date, refresh_sale_payments, reverse_payment,
    validate_method_and_reference,
)
from notifications.models import NotificationLog
from sales.models import Customer, Sale, SaleItem, SaleReturn, SaleReturnItem
from stock.models import Inventory, StockMovement
from stock.services import record_movement, weighted_average_cost

ZERO = Decimal("0.00")
CENT = Decimal("0.01")

TAX_RATES = {
    "A": Decimal("0.00"),
    "B": Decimal("0.18"),
}


class ApprovalRequired(ValidationError):
    """The cart needs a manager/admin approval (PIN) before it can be completed."""

    default_code = "approval_required"


class PriceNoteRequired(ValidationError):
    """A below-floor line was sent without the note explaining its price."""

    default_code = "price_note_required"


def _resolve_retail_price(product):
    try:
        pricing = ProductPricing.objects.get(product=product, is_current=True)
    except ProductPricing.DoesNotExist:
        raise ValidationError(f"Product {product.pk} has no current price set.")
    return pricing.retail_price


def _notify_admins(sale, notification_type="sale_alert"):
    admins = Employee.objects.filter(role=Employee.Role.ADMIN, status=Employee.Status.ACTIVE)
    NotificationLog.objects.bulk_create([
        NotificationLog(
            type=notification_type, recipient=admin, related_sale=sale,
            status=NotificationLog.NotificationStatus.LOGGED,
        )
        for admin in admins
    ])


def _normalise_payments(payments, payment_method, total):
    """Validate the payment lines of a sale and return (applied lines, change_due).

    Each line is {"method", "amount", "reference"?, "tendered"?}. Non-cash lines
    are applied as given and may not add up to more than the total. Cash beyond
    what is still due is change, not a payment: the cash lines are trimmed to fit
    and the excess (plus any tendered above the amount) is returned as change.
    With no `payments` at all (older clients), the sale is paid in full with
    `payment_method` (cash when blank).
    """
    if payments is None:
        return [{"method": payment_method or Payment.Method.CASH, "amount": total, "reference": ""}], ZERO

    lines = []
    for raw in payments:
        method = raw.get("method")
        amount = Decimal(raw.get("amount") or 0)
        reference = (raw.get("reference") or "").strip()
        tendered = raw.get("tendered")
        validate_method_and_reference(method, reference)
        if amount <= 0:
            raise ValidationError({"payments": "Every payment line needs an amount above zero."})
        if tendered is not None:
            if method != Payment.Method.CASH:
                raise ValidationError({"payments": "Only cash payments take an amount tendered."})
            tendered = Decimal(tendered)
            if tendered < amount:
                raise ValidationError({"payments": "Cash tendered is less than the cash amount."})
        lines.append({"method": method, "amount": amount, "reference": reference, "tendered": tendered})

    non_cash = sum((line["amount"] for line in lines if line["method"] != Payment.Method.CASH), ZERO)
    if non_cash > total:
        raise ValidationError({"payments": "Non-cash payments add up to more than the sale total."})

    change = sum(
        ((line["tendered"] - line["amount"]) for line in lines if line["tendered"] is not None), ZERO
    )
    room_for_cash = total - non_cash
    applied = []
    for line in lines:
        if line["method"] == Payment.Method.CASH:
            portion = min(line["amount"], room_for_cash)
            change += line["amount"] - portion
            room_for_cash -= portion
            if portion > 0:
                applied.append({**line, "amount": portion})
        else:
            applied.append(line)
    return applied, change


def complete_sale(customer, employee, payment_method=None, items=None, *, payments=None,
                  approval=None, due_date=None):
    """Sell `items` and take `payments`, in one transaction.

    items: list of {"product": Product, "quantity": int, "unit_price": Decimal | absent}.
    unit_price, when present, is the price agreed at the till (VAT-inclusive, like the
    catalog price) and replaces the catalog retail price for that line only. The catalog
    price is still stored as list_price so the discount/markup is auditable.

    payments: list of {"method", "amount", "reference", "tendered"} (see
    _normalise_payments). A sale not fully paid needs a customer with a phone
    number and gets a due date (default: 30 days); new credit that takes the
    customer over their credit_limit needs `approval` ({"approver_username",
    "pin"}) unless the seller is a manager or admin.

    Returns the Sale with a transient `change_due` attribute.
    """
    if not items:
        raise ValidationError("Cannot complete a sale with no line items.")

    quantities = {}
    for entry in items:
        product_id = entry["product"].pk
        quantities[product_id] = quantities.get(product_id, 0) + entry["quantity"]

    with transaction.atomic():
        locked_inventories = {}
        for product_id in sorted(quantities):
            inventory, _ = Inventory.objects.select_for_update().get_or_create(
                product_id=product_id, defaults={"quantity_in_stock": 0}
            )
            if inventory.quantity_in_stock < quantities[product_id]:
                raise ValidationError(
                    f"Insufficient stock for product {product_id}: "
                    f"requested {quantities[product_id]}, available {inventory.quantity_in_stock}."
                )
            locked_inventories[product_id] = inventory

        approver = None

        def require_approval(message):
            # One approval covers the whole sale: verified once, then reused.
            nonlocal approver
            if approver is None:
                if not approval:
                    raise ApprovalRequired(message)
                approver = verify_approval(approval.get("approver_username"), approval.get("pin"))
            return approver

        max_pct = max_staff_discount_pct()
        resolved_items = []
        total = ZERO
        for index, entry in enumerate(items, start=1):
            product = entry["product"]
            quantity = entry["quantity"]
            list_price = _resolve_retail_price(product)
            override = entry.get("unit_price")
            unit_price = override if override is not None else list_price
            if unit_price <= 0:
                raise ValidationError(f"Line {index} ({product.name}): the price must be above zero.")
            cost_at_sale = weighted_average_cost(product)
            verdict = evaluate_line(
                unit_price=unit_price, list_price=list_price,
                floor=price_floor(product, cost_at_sale), seller=employee, max_pct=max_pct,
            )
            price_note = (entry.get("price_note") or "").strip()
            if verdict.needs_note and not price_note:
                if verdict.needs_approval:
                    message = "Below the minimum price — needs manager approval and a note"
                else:
                    message = "Below the minimum price — add a note explaining the price"
                raise PriceNoteRequired(f"Line {index} ({product.name}): {message}.")
            line_approver = None
            if verdict.needs_approval:
                line_approver = require_approval(f"Line {index} ({product.name}): needs manager approval.")
            subtotal = (unit_price * quantity).quantize(CENT)
            # Retail prices are VAT-inclusive, so tax_amount is the portion of subtotal that is
            # tax, not an additional charge on top of it.
            rate = TAX_RATES[product.tax_category]
            tax_amount = (subtotal - subtotal / (1 + rate)).quantize(CENT)
            resolved_items.append({
                "product": product, "quantity": quantity, "unit_price": unit_price,
                "list_price": list_price, "subtotal": subtotal, "tax_amount": tax_amount,
                "cost_at_sale": cost_at_sale,
                "discount_amount": ((list_price - unit_price) * quantity).quantize(CENT),
                "approved_by": line_approver, "price_note": price_note,
            })
            total += subtotal

        applied, change_due = _normalise_payments(payments, payment_method, total)
        paid = sum((line["amount"] for line in applied), ZERO)
        on_credit = total - paid

        if on_credit > 0:
            if customer is None:
                raise ValidationError({
                    "customer": "A sale that is not fully paid needs a customer "
                                "(walk-in sales must be paid in full)."
                })
            customer = Customer.objects.select_for_update().get(pk=customer.pk)
            if not (customer.phone or "").strip():
                raise ValidationError({"customer": "Add the customer's phone number before selling on credit."})
            over_limit = (
                customer.credit_limit is not None
                and customer_balance(customer) + on_credit > customer.credit_limit
            )
            if over_limit and not can_approve(employee):
                require_approval("This sale takes the customer over their credit limit — needs manager approval.")

        methods = {line["method"] for line in applied}
        sale = Sale.objects.create(
            customer=customer, employee=employee,
            payment_method=next(iter(methods)) if len(methods) == 1 else None,
            total_amount=total,
            due_date=(due_date or default_due_date()) if on_credit > 0 else None,
        )

        for line in resolved_items:
            product, quantity = line["product"], line["quantity"]
            sale_item = SaleItem.objects.create(
                sale=sale, tax_category=product.tax_category, **line,
            )
            record_movement(
                locked_inventories[product.pk], StockMovement.Bucket.IN_STOCK, -quantity,
                StockMovement.MovementType.SALE, ("sale_item", sale_item.pk), employee,
                reason=f"Sale #{sale.pk}",
            )

        group = uuid.uuid4()
        for line in applied:
            Payment.objects.create(
                direction=Payment.Direction.IN, sale=sale, amount=line["amount"],
                method=line["method"], reference=line["reference"], recorded_by=employee,
                receipt_group=group,
            )
        refresh_sale_payments(sale)

        _notify_admins(sale)

    sale.change_due = change_due
    return sale


def _lock_inventories(product_ids):
    inventories = {}
    for product_id in sorted(set(product_ids)):
        inventories[product_id], _ = Inventory.objects.select_for_update().get_or_create(
            product_id=product_id, defaults={"quantity_in_stock": 0}
        )
    return inventories


def is_same_business_day(sale, today=None):
    """Whether the sale was made on today's Africa/Kigali calendar day."""
    return timezone.localdate(sale.sale_date) == (today or timezone.localdate())


def can_void(sale, today=None):
    return (
        sale.status == Sale.SaleStatus.COMPLETED
        and is_same_business_day(sale, today)
        and not sale.returns.exists()
    )


def void_sale(sale, user, reason):
    """Undo a sale on the day it was made: every unit back on the shelf, every payment reversed.

    Admin/manager only (enforced by the view). After the day it was made, a sale
    can only be returned (return_sale_items).
    """
    reason = (reason or "").strip()
    if not reason:
        raise ValidationError({"reason": "A reason is required to void a sale."})

    with transaction.atomic():
        locked = Sale.objects.select_for_update().get(pk=sale.pk)
        if locked.status == Sale.SaleStatus.VOIDED:
            raise ValidationError("This sale is already voided.")
        if locked.status != Sale.SaleStatus.COMPLETED or locked.returns.exists():
            raise ValidationError("A sale with returns can't be voided; return the remaining items instead.")
        if not is_same_business_day(locked):
            raise ValidationError(
                "Only a sale from today can be voided. Use a return for an older sale."
            )

        items = list(locked.items.order_by("pk"))
        inventories = _lock_inventories(item.product_id for item in items)
        for item in items:
            record_movement(
                inventories[item.product_id], StockMovement.Bucket.IN_STOCK, item.quantity,
                StockMovement.MovementType.SALE_VOID, ("sale_item", item.pk), user,
                reason=f"Sale #{locked.pk} voided: {reason}",
            )

        open_payments = (
            Payment.objects.filter(sale=locked, reversal_of__isnull=True, reversal__isnull=True)
            .order_by("pk")
        )
        for payment in open_payments:
            reverse_payment(payment, user, f"Void of Sale #{locked.pk}: {reason}")

        locked.refresh_from_db(fields=["amount_paid", "payment_status"])
        locked.status = Sale.SaleStatus.VOIDED
        locked.void_reason = reason
        locked.voided_by = user
        locked.voided_at = timezone.now()
        locked.save(update_fields=["status", "void_reason", "voided_by", "voided_at"])

        _notify_admins(locked, notification_type="sale_voided")
    return locked


def returned_quantities(sale):
    """{sale_item_id: units already returned} across every earlier return of the sale."""
    rows = (
        SaleReturnItem.objects.filter(sale_return__sale=sale)
        .values("sale_item_id").annotate(units=Sum("quantity"))
    )
    return {row["sale_item_id"]: row["units"] for row in rows}


def return_sale_items(sale, items, reason, user, refund_method=None, refund_reference="", approved_by=None):
    """Take back some or all units of a sale and refund them.

    items: [{"sale_item": SaleItem, "quantity": int, "condition": "resellable" | "damaged",
             "refund_amount": Decimal | absent}].

    Each line can't return more than was sold minus what earlier returns took
    back. refund_amount defaults to the price actually paid (unit_price x qty)
    and may be lowered, never raised. Resellable units go back in stock, damaged
    ones into the damaged bucket. The refund first reduces what the customer
    still owes on the sale; only the excess is paid out, as an "out" payment in
    `refund_method` (a reference is required for non-cash).
    """
    reason = (reason or "").strip()
    if not reason:
        raise ValidationError({"reason": "A reason is required for a return."})
    if not items:
        raise ValidationError({"items": "Choose at least one item to return."})

    with transaction.atomic():
        locked = Sale.objects.select_for_update().get(pk=sale.pk)
        if locked.status not in (Sale.SaleStatus.COMPLETED, Sale.SaleStatus.PARTIALLY_RETURNED):
            raise ValidationError("Only a completed or partly returned sale can take a return.")

        sale_items = {item.pk: item for item in locked.items.order_by("pk")}
        already = returned_quantities(locked)
        requested = {}
        lines = []
        for index, entry in enumerate(items, start=1):
            sale_item = entry["sale_item"]
            if sale_item.pk not in sale_items:
                raise ValidationError({"items": f"Line {index}: that item is not part of this sale."})
            sale_item = sale_items[sale_item.pk]
            quantity = int(entry["quantity"])
            if quantity < 1:
                raise ValidationError({"items": f"Line {index}: return at least 1 unit."})
            condition = entry.get("condition") or SaleReturnItem.Condition.RESELLABLE
            if condition not in SaleReturnItem.Condition.values:
                raise ValidationError({"items": f"Line {index}: invalid condition {condition!r}."})
            requested[sale_item.pk] = requested.get(sale_item.pk, 0) + quantity
            returnable = sale_item.quantity - already.get(sale_item.pk, 0)
            if requested[sale_item.pk] > returnable:
                raise ValidationError({
                    "items": f"Line {index} ({sale_item.product.name}): only {returnable} "
                             f"of {sale_item.quantity} can still be returned."
                })
            paid_for_units = (sale_item.unit_price * quantity).quantize(CENT)
            refund_amount = entry.get("refund_amount")
            refund_amount = paid_for_units if refund_amount is None else Decimal(refund_amount).quantize(CENT)
            if refund_amount < 0:
                raise ValidationError({"items": f"Line {index}: the refund can't be negative."})
            if refund_amount > paid_for_units:
                raise ValidationError({
                    "items": f"Line {index}: the refund can't be more than the price paid ({paid_for_units})."
                })
            lines.append((sale_item, quantity, condition, refund_amount))

        refund_total = sum((line[3] for line in lines), ZERO)
        new_net_total = locked.net_total - refund_total
        paid_out = min(max(locked.amount_paid - new_net_total, ZERO), refund_total)
        method = refund_method or None
        if paid_out > 0:
            if not method or method == SaleReturn.RefundMethod.BALANCE:
                raise ValidationError({"refund_method": "Choose how the refund is paid back."})
            validate_method_and_reference(method, refund_reference)
        else:
            method = SaleReturn.RefundMethod.BALANCE

        sale_return = SaleReturn.objects.create(
            sale=locked, reason=reason, refund_method=method,
            refund_reference=(refund_reference or "").strip() if paid_out > 0 else "",
            refund_total=refund_total, paid_out=paid_out, balance_reduced=refund_total - paid_out,
            created_by=user, approved_by=approved_by,
        )

        inventories = _lock_inventories(line[0].product_id for line in lines)
        for sale_item, quantity, condition, refund_amount in lines:
            return_item = SaleReturnItem.objects.create(
                sale_return=sale_return, sale_item=sale_item, quantity=quantity,
                refund_amount=refund_amount, condition=condition,
            )
            bucket = (
                StockMovement.Bucket.DAMAGED if condition == SaleReturnItem.Condition.DAMAGED
                else StockMovement.Bucket.IN_STOCK
            )
            record_movement(
                inventories[sale_item.product_id], bucket, quantity,
                StockMovement.MovementType.SALE_RETURN, ("sale_return_item", return_item.pk), user,
                reason=f"Return #{sale_return.pk} of Sale #{locked.pk}: {reason}",
            )

        locked.returned_amount = locked.returned_amount + refund_total
        fully_returned = all(
            already.get(pk, 0) + requested.get(pk, 0) >= item.quantity for pk, item in sale_items.items()
        )
        locked.status = Sale.SaleStatus.RETURNED if fully_returned else Sale.SaleStatus.PARTIALLY_RETURNED
        locked.save(update_fields=["returned_amount", "status"])

        if paid_out > 0:
            payment = Payment.objects.create(
                direction=Payment.Direction.OUT, sale=locked, amount=paid_out, method=method,
                reference=sale_return.refund_reference, recorded_by=user,
                note=f"Refund for return #{sale_return.pk}",
            )
            sale_return.refund_payment = payment
            sale_return.save(update_fields=["refund_payment"])
        refresh_sale_payments(locked)

        _notify_admins(locked, notification_type="sale_returned")
    return sale_return
