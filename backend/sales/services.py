from decimal import Decimal
from django.db import transaction
from rest_framework.exceptions import ValidationError

from accounts.models import Employee
from catalog.models import ProductPricing
from notifications.models import NotificationLog
from sales.models import Sale, SaleItem
from stock.models import Inventory


def _resolve_retail_price(product):
    try:
        pricing = ProductPricing.objects.get(product=product, is_current=True)
    except ProductPricing.DoesNotExist:
        raise ValidationError(f"Product {product.pk} has no current price set.")
    return pricing.retail_price


def _notify_admins(sale):
    admins = Employee.objects.filter(role=Employee.Role.ADMIN)
    NotificationLog.objects.bulk_create([
        NotificationLog(
            type="sale_alert", recipient=admin, related_sale=sale,
            status=NotificationLog.NotificationStatus.SENT,
        )
        for admin in admins
    ])


def complete_sale(customer, employee, payment_method, items):
    """items: list of {"product": Product instance, "quantity": int}"""
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

        sale = Sale.objects.create(
            customer=customer, employee=employee, payment_method=payment_method,
            total_amount=Decimal("0.00"),
        )

        total = Decimal("0.00")
        for entry in items:
            product = entry["product"]
            quantity = entry["quantity"]
            unit_price = _resolve_retail_price(product)
            subtotal = unit_price * quantity
            SaleItem.objects.create(
                sale=sale, product=product, quantity=quantity,
                unit_price=unit_price, subtotal=subtotal,
            )
            total += subtotal

        sale.total_amount = total
        sale.save(update_fields=["total_amount"])

        for product_id, quantity in quantities.items():
            inventory = locked_inventories[product_id]
            inventory.quantity_in_stock -= quantity
            inventory.save(update_fields=["quantity_in_stock"])

        _notify_admins(sale)

    return sale


def reverse_sale(sale, new_status):
    with transaction.atomic():
        locked_sale = Sale.objects.select_for_update().get(pk=sale.pk)
        if locked_sale.status != Sale.SaleStatus.COMPLETED:
            raise ValidationError("Only a completed sale can be returned or cancelled.")

        items = list(locked_sale.items.select_related("product").all())
        quantities = {}
        for item in items:
            quantities[item.product_id] = quantities.get(item.product_id, 0) + item.quantity

        for product_id in sorted(quantities):
            inventory, _ = Inventory.objects.select_for_update().get_or_create(
                product_id=product_id, defaults={"quantity_in_stock": 0}
            )
            inventory.quantity_in_stock += quantities[product_id]
            inventory.save(update_fields=["quantity_in_stock"])

        locked_sale.status = new_status
        locked_sale.save(update_fields=["status"])
    return locked_sale
