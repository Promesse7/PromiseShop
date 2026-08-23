from django.db import models


class Supplier(models.Model):
    supplier_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=150)
    contact_person = models.CharField(max_length=120, blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(max_length=120, blank=True, null=True)
    address = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        return self.name


class Purchase(models.Model):
    class PaymentStatus(models.TextChoices):
        PAID = "paid", "Paid"
        PARTIAL = "partial", "Partial"
        UNPAID = "unpaid", "Unpaid"

    purchase_id = models.AutoField(primary_key=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchases")
    employee = models.ForeignKey("accounts.Employee", on_delete=models.PROTECT, related_name="purchases")
    invoice_number = models.CharField(max_length=60, blank=True, null=True)
    purchase_date = models.DateField()
    total_paid = models.DecimalField(max_digits=12, decimal_places=2)
    total_invoiced = models.DecimalField(max_digits=12, decimal_places=2)
    payment_status = models.CharField(
        max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PAID
    )

    def __str__(self):
        return f"Purchase #{self.purchase_id} - {self.supplier}"


class PurchaseItem(models.Model):
    purchase_item_id = models.AutoField(primary_key=True)
    purchase = models.ForeignKey(Purchase, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT, related_name="purchase_items")
    quantity = models.PositiveIntegerField()
    unit_cost_paid = models.DecimalField(max_digits=12, decimal_places=2)
    unit_cost_invoiced = models.DecimalField(max_digits=12, decimal_places=2)
    price_discrepancy_note = models.TextField(blank=True, null=True)
    subtotal_paid = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal_invoiced = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f"{self.product} x{self.quantity} (Purchase #{self.purchase_id})"
