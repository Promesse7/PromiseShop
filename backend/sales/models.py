from django.db import models

from catalog.models import Product


class Customer(models.Model):
    customer_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=120, blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(max_length=120, blank=True, null=True)
    address = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        return self.name or f"Walk-in customer #{self.customer_id}"


class Sale(models.Model):
    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        MOBILE_MONEY = "mobile_money", "Mobile Money"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"

    class SaleStatus(models.TextChoices):
        COMPLETED = "completed", "Completed"
        RETURNED = "returned", "Returned"
        CANCELLED = "cancelled", "Cancelled"

    sale_id = models.AutoField(primary_key=True)
    customer = models.ForeignKey(
        Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name="sales"
    )
    employee = models.ForeignKey("accounts.Employee", on_delete=models.PROTECT, related_name="sales")
    sale_date = models.DateTimeField(auto_now_add=True)
    payment_method = models.CharField(
        max_length=30, choices=PaymentMethod.choices, blank=True, null=True
    )
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, choices=SaleStatus.choices, default=SaleStatus.COMPLETED)

    def __str__(self):
        return f"Sale #{self.sale_id}"


class SaleItem(models.Model):
    sale_item_id = models.AutoField(primary_key=True)
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT, related_name="sale_items")
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    tax_category = models.CharField(max_length=1, choices=Product.TaxCategory.choices)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f"{self.product} x{self.quantity} (Sale #{self.sale_id})"
