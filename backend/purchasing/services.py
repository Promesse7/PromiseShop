from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from catalog.models import Product, ProductPricing
from catalog.search import normalise_text
from catalog.services import generate_barcode
from finance.services import refresh_purchase_payments
from purchasing.models import Purchase, PurchaseItem
from stock.models import Inventory, StockMovement
from stock.services import record_movement


def _validate_discrepancy_note(unit_cost_paid, unit_cost_invoiced, price_discrepancy_note):
    if unit_cost_paid != unit_cost_invoiced and not price_discrepancy_note:
        raise ValidationError({
            "price_discrepancy_note": "Required when unit_cost_paid differs from unit_cost_invoiced."
        })


def _recompute_purchase_totals(purchase):
    totals = purchase.items.aggregate(paid=Sum("subtotal_paid"), invoiced=Sum("subtotal_invoiced"))
    purchase.total_paid = totals["paid"] or Decimal("0.00")
    purchase.total_invoiced = totals["invoiced"] or Decimal("0.00")
    purchase.save(update_fields=["total_paid", "total_invoiced"])
    # What is owed changed, so the derived payment status may have too.
    refresh_purchase_payments(purchase)


def add_existing_product_item(purchase, product, quantity, unit_cost_paid, unit_cost_invoiced,
                               price_discrepancy_note=""):
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Cannot add items to a purchase that is not a draft.")
    _validate_discrepancy_note(unit_cost_paid, unit_cost_invoiced, price_discrepancy_note)
    with transaction.atomic():
        purchase = Purchase.objects.select_for_update().get(pk=purchase.pk)
        if purchase.status != Purchase.Status.DRAFT:
            raise ValidationError("Cannot add items to a purchase that is not a draft.")
        item = PurchaseItem.objects.create(
            purchase=purchase, product=product, quantity=quantity,
            unit_cost_paid=unit_cost_paid, unit_cost_invoiced=unit_cost_invoiced,
            price_discrepancy_note=price_discrepancy_note,
            subtotal_paid=quantity * unit_cost_paid,
            subtotal_invoiced=quantity * unit_cost_invoiced,
        )
        _recompute_purchase_totals(purchase)
    return item


def _find_existing_product_by_name(name):
    # Case- and whitespace-insensitive (via the maintained normalized_name), oldest
    # first so a catalog that already holds duplicates resolves deterministically.
    return Product.objects.filter(normalized_name=normalise_text(name)).order_by("product_id").first()


def add_new_product_item(purchase, *, category, name, quantity, unit_cost_paid, unit_cost_invoiced,
                          selling_price, brand="", model_number="", specifications="",
                          usage_instructions="", warranty_months=0, reorder_level=5,
                          price_discrepancy_note=""):
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Cannot add items to a purchase that is not a draft.")
    _validate_discrepancy_note(unit_cost_paid, unit_cost_invoiced, price_discrepancy_note)
    name = " ".join(name.split())

    # A "new product" whose name is already in the catalog is almost always the
    # same product typed by hand (bulk entry, slow catalog load, a second client).
    # Link to it rather than creating a duplicate; the existing product keeps its
    # own pricing, so the selling_price sent for the would-be new product is ignored.
    existing = _find_existing_product_by_name(name)
    if existing is not None:
        return add_existing_product_item(
            purchase, existing, quantity, unit_cost_paid, unit_cost_invoiced, price_discrepancy_note
        )

    with transaction.atomic():
        barcode = generate_barcode(category)
        product = Product.objects.create(
            category=category, barcode=barcode, name=name, brand=brand, model_number=model_number,
            specifications=specifications, usage_instructions=usage_instructions,
            warranty_months=warranty_months, reorder_level=reorder_level,
        )
        ProductPricing.objects.create(
            product=product, wholesale_price=unit_cost_paid, retail_price=selling_price,
            effective_date=timezone.now().date(), is_current=True,
        )
        item = add_existing_product_item(
            purchase, product, quantity, unit_cost_paid, unit_cost_invoiced, price_discrepancy_note
        )
    return item


def remove_item(purchase, item):
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Cannot remove items from a purchase that is not a draft.")
    if item.purchase_id != purchase.pk:
        raise ValidationError("Item does not belong to this purchase.")
    with transaction.atomic():
        purchase = Purchase.objects.select_for_update().get(pk=purchase.pk)
        if purchase.status != Purchase.Status.DRAFT:
            raise ValidationError("Cannot remove items from a purchase that is not a draft.")
        item.delete()
        _recompute_purchase_totals(purchase)


class BulkRowErrors(Exception):
    """Raised by add_items_bulk when any row fails; carries {row_index: errors}."""

    def __init__(self, row_errors):
        super().__init__("Some rows failed; nothing was saved.")
        self.row_errors = row_errors


def add_items_bulk(purchase, rows):
    """Add every row to a draft purchase, or none of them.

    rows: validated BulkPurchaseItemRowSerializer data. Each row goes through the
    same add_existing_product_item / add_new_product_item paths as a single add
    (so new products keep the same-name dedupe). Any failure rolls everything
    back — including products created by earlier rows — and raises BulkRowErrors.
    """
    if not rows:
        raise ValidationError("Add at least one row.")
    with transaction.atomic():
        locked = Purchase.objects.select_for_update().get(pk=purchase.pk)
        if locked.status != Purchase.Status.DRAFT:
            raise ValidationError("Cannot add items to a purchase that is not a draft.")
        items, row_errors = [], {}
        for index, row in enumerate(rows):
            try:
                with transaction.atomic():
                    new_product = row.get("new_product")
                    common = dict(
                        quantity=row["quantity"], unit_cost_paid=row["unit_cost_paid"],
                        unit_cost_invoiced=row["unit_cost_invoiced"],
                        price_discrepancy_note=row.get("price_discrepancy_note", ""),
                    )
                    if new_product is not None:
                        items.append(add_new_product_item(locked, **new_product, **common))
                    else:
                        items.append(add_existing_product_item(locked, row["product"], **common))
            except ValidationError as exc:
                row_errors[index] = exc.detail
        if row_errors:
            transaction.set_rollback(True)
            raise BulkRowErrors(row_errors)
    return items


def update_item(purchase, item, **changes):
    """Change quantity / costs / note on a draft purchase line and re-total."""
    if item.purchase_id != purchase.pk:
        raise ValidationError("Item does not belong to this purchase.")
    with transaction.atomic():
        locked = Purchase.objects.select_for_update().get(pk=purchase.pk)
        if locked.status != Purchase.Status.DRAFT:
            raise ValidationError("Cannot edit items on a purchase that is not a draft.")
        item = PurchaseItem.objects.select_for_update().get(pk=item.pk)
        for field in ("quantity", "unit_cost_paid", "unit_cost_invoiced", "price_discrepancy_note"):
            if field in changes:
                setattr(item, field, changes[field])
        _validate_discrepancy_note(item.unit_cost_paid, item.unit_cost_invoiced, item.price_discrepancy_note)
        item.subtotal_paid = item.quantity * item.unit_cost_paid
        item.subtotal_invoiced = item.quantity * item.unit_cost_invoiced
        item.save()
        _recompute_purchase_totals(locked)
    return item


def recent_products_for_supplier(supplier, limit=20):
    """The last `limit` distinct products bought from a supplier, newest first.

    Cancelled purchases don't count; drafts do (they are what's being typed in now).
    """
    seen, rows = set(), []
    lines = (
        PurchaseItem.objects.filter(purchase__supplier=supplier)
        .exclude(purchase__status=Purchase.Status.CANCELLED)
        .select_related("product", "purchase")
        .order_by("-purchase__purchase_date", "-purchase_id", "-purchase_item_id")
    )
    for line in lines.iterator(chunk_size=200):
        if line.product_id in seen:
            continue
        seen.add(line.product_id)
        rows.append(line)
        if len(rows) == limit:
            break
    return rows


def cancel_purchase(purchase, *, user=None):
    with transaction.atomic():
        locked = Purchase.objects.select_for_update().get(pk=purchase.pk)
        if locked.status == Purchase.Status.CANCELLED:
            raise ValidationError("This purchase is already cancelled.")

        if locked.status == Purchase.Status.RECEIVED:
            items = list(locked.items.select_related("product").order_by("product_id", "pk"))
            quantities = {}
            products = {}
            for item in items:
                quantities[item.product_id] = quantities.get(item.product_id, 0) + item.quantity
                products[item.product_id] = item.product

            # Lock every affected inventory row up front and verify the stock this
            # purchase brought in hasn't already moved on (e.g. been sold) before
            # reversing anything — a partial reversal would desync stock silently.
            inventories = {}
            shortfalls = []
            for product_id, quantity in quantities.items():
                inventory, _ = Inventory.objects.select_for_update().get_or_create(
                    product=products[product_id], defaults={"quantity_in_stock": 0}
                )
                inventories[product_id] = inventory
                if inventory.quantity_in_stock < quantity:
                    shortfalls.append(
                        f"{products[product_id].name} (only {inventory.quantity_in_stock} left, "
                        f"{quantity} would need to be reversed)"
                    )
            if shortfalls:
                raise ValidationError(
                    "Cannot cancel: stock from this purchase has already moved for "
                    + "; ".join(shortfalls)
                )

            for item in items:
                record_movement(
                    inventories[item.product_id], StockMovement.Bucket.IN_STOCK, -item.quantity,
                    StockMovement.MovementType.PURCHASE_CANCEL, ("purchase_item", item.pk), user,
                    reason=f"Purchase #{locked.pk} cancelled", unit_cost=item.unit_cost_paid,
                )

        locked.status = Purchase.Status.CANCELLED
        locked.save(update_fields=["status"])
    return locked


def receive_purchase(purchase, *, user=None):
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Only a draft purchase can be received.")
    with transaction.atomic():
        purchase = Purchase.objects.select_for_update().get(pk=purchase.pk)
        if purchase.status != Purchase.Status.DRAFT:
            raise ValidationError("Only a draft purchase can be received.")
        items = list(purchase.items.select_related("product").order_by("product_id", "pk"))
        if not items:
            raise ValidationError("Cannot receive a purchase with no line items.")
        inventories = {}
        for item in items:  # ordered by product_id, so locks are taken in a stable order
            if item.product_id not in inventories:
                inventories[item.product_id], _ = Inventory.objects.select_for_update().get_or_create(
                    product=item.product, defaults={"quantity_in_stock": 0}
                )
        for item in items:
            record_movement(
                inventories[item.product_id], StockMovement.Bucket.IN_STOCK, item.quantity,
                StockMovement.MovementType.PURCHASE_RECEIPT, ("purchase_item", item.pk), user,
                reason=f"Purchase #{purchase.pk} received", unit_cost=item.unit_cost_paid,
            )
        purchase.status = Purchase.Status.RECEIVED
        purchase.save(update_fields=["status"])
    return purchase
