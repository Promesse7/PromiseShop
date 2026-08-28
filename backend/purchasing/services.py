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


def add_new_product_item(purchase, *, category, name, quantity, unit_cost_paid, unit_cost_invoiced,
                          selling_price, brand="", model_number="", specifications="",
                          usage_instructions="", warranty_months=0, reorder_level=5,
                          price_discrepancy_note=""):
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Cannot add items to a purchase that is not a draft.")
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
        raise ValidationError("Cannot remove items from a purchase that is not a draft.")
    if item.purchase_id != purchase.pk:
        raise ValidationError("Item does not belong to this purchase.")
    with transaction.atomic():
        purchase = Purchase.objects.select_for_update().get(pk=purchase.pk)
        if purchase.status != Purchase.Status.DRAFT:
            raise ValidationError("Cannot remove items from a purchase that is not a draft.")
        item.delete()
        _recompute_purchase_totals(purchase)


def cancel_purchase(purchase):
    with transaction.atomic():
        locked = Purchase.objects.select_for_update().get(pk=purchase.pk)
        if locked.status == Purchase.Status.CANCELLED:
            raise ValidationError("This purchase is already cancelled.")

        if locked.status == Purchase.Status.RECEIVED:
            items = list(locked.items.select_related("product").order_by("product_id"))
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

            for product_id, quantity in quantities.items():
                inventory = inventories[product_id]
                inventory.quantity_in_stock -= quantity
                inventory.save(update_fields=["quantity_in_stock"])

        locked.status = Purchase.Status.CANCELLED
        locked.save(update_fields=["status"])
    return locked


def receive_purchase(purchase):
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Only a draft purchase can be received.")
    with transaction.atomic():
        purchase = Purchase.objects.select_for_update().get(pk=purchase.pk)
        if purchase.status != Purchase.Status.DRAFT:
            raise ValidationError("Only a draft purchase can be received.")
        items = list(purchase.items.select_related("product").order_by("product_id"))
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
