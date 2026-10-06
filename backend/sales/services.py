import uuid
from decimal import Decimal
from django.db import transaction
from rest_framework.exceptions import ValidationError

from accounts.models import Employee
from accounts.services import can_approve, verify_approval
from catalog.models import ProductPricing
from sales.pricing import evaluate_line, max_staff_discount_pct, price_floor
from finance.models import Payment
from finance.services import (
    customer_balance, default_due_date, refresh_sale_payments, validate_method_and_reference,
)
from notifications.models import NotificationLog
from sales.models import Customer, Sale, SaleItem
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


def reverse_sale(sale, new_status, *, user=None):
    if new_status not in (Sale.SaleStatus.RETURNED, Sale.SaleStatus.CANCELLED):
        raise ValidationError(f"Invalid reversal status: {new_status}")

    with transaction.atomic():
        locked_sale = Sale.objects.select_for_update().get(pk=sale.pk)
        if locked_sale.status != Sale.SaleStatus.COMPLETED:
            raise ValidationError("Only a completed sale can be returned or cancelled.")

        items = list(locked_sale.items.select_related("product").order_by("pk"))
        inventories = {}
        for product_id in sorted({item.product_id for item in items}):
            inventories[product_id], _ = Inventory.objects.select_for_update().get_or_create(
                product_id=product_id, defaults={"quantity_in_stock": 0}
            )

        movement_type = (
            StockMovement.MovementType.SALE_RETURN if new_status == Sale.SaleStatus.RETURNED
            else StockMovement.MovementType.SALE_VOID
        )
        for item in items:
            record_movement(
                inventories[item.product_id], StockMovement.Bucket.IN_STOCK, item.quantity,
                movement_type, ("sale_item", item.pk), user,
                reason=f"Sale #{locked_sale.pk} {new_status}",
            )

        locked_sale.status = new_status
        locked_sale.save(update_fields=["status"])

        _notify_admins(locked_sale, notification_type="sale_reversed")
    return locked_sale
