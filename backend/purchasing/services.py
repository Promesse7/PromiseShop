from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from catalog.models import Product, ProductPricing
from catalog.services import generate_barcode
from purchasing.models import Purchase, PurchaseItem
from stock.models import Inventory


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


def add_existing_product_item(purchase, product, quantity, unit_cost_paid, unit_cost_invoiced,
                               price_discrepancy_note=""):
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Cannot add items to a purchase that has already been received.")
    _validate_discrepancy_note(unit_cost_paid, unit_cost_invoiced, price_discrepancy_note)
    with transaction.atomic():
        purchase = Purchase.objects.select_for_update().get(pk=purchase.pk)
        if purchase.status != Purchase.Status.DRAFT:
            raise ValidationError("Cannot add items to a purchase that has already been received.")
        item = PurchaseItem.objects.create(
            purchase=purchase, product=product, quantity=quantity,
            unit_cost_paid=unit_cost_paid, unit_cost_invoiced=unit_cost_invoiced,
            price_discrepancy_note=price_discrepancy_note,
            subtotal_paid=quantity * unit_cost_paid,
            subtotal_invoiced=quantity * unit_cost_invoiced,
        )
        _recompute_purchase_totals(purchase)
    return item


def add_new_product_item(purchase, *, category, name, quantity, unit_cost_paid, unit_cost_invoiced,
                          selling_price, brand="", model_number="", specifications="",
                          usage_instructions="", warranty_months=0, reorder_level=5,
                          price_discrepancy_note=""):
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Cannot add items to a purchase that has already been received.")
    _validate_discrepancy_note(unit_cost_paid, unit_cost_invoiced, price_discrepancy_note)
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
        raise ValidationError("Cannot remove items from a purchase that has already been received.")
    if item.purchase_id != purchase.pk:
        raise ValidationError("Item does not belong to this purchase.")
    with transaction.atomic():
        purchase = Purchase.objects.select_for_update().get(pk=purchase.pk)
        if purchase.status != Purchase.Status.DRAFT:
            raise ValidationError("Cannot remove items from a purchase that has already been received.")
        item.delete()
        _recompute_purchase_totals(purchase)


def receive_purchase(purchase):
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Purchase has already been received.")
    with transaction.atomic():
        purchase = Purchase.objects.select_for_update().get(pk=purchase.pk)
        if purchase.status != Purchase.Status.DRAFT:
            raise ValidationError("Purchase has already been received.")
        items = list(purchase.items.select_related("product").all())
        if not items:
            raise ValidationError("Cannot receive a purchase with no line items.")
        for item in items:
            inventory, _ = Inventory.objects.select_for_update().get_or_create(
                product=item.product, defaults={"quantity_in_stock": 0}
            )
            inventory.quantity_in_stock += item.quantity
            inventory.save(update_fields=["quantity_in_stock"])
        purchase.status = Purchase.Status.RECEIVED
        purchase.save(update_fields=["status"])
    return purchase
