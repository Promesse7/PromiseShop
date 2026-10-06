from django.db import models

from catalog.models import Product


class Customer(models.Model):
    customer_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=120, blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(max_length=120, blank=True, null=True)
    address = models.CharField(max_length=255, blank=True, null=True)
    # Null means no limit. Above it, new credit needs a manager/admin approval.
    credit_limit = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return self.name or f"Walk-in customer #{self.customer_id}"


class Sale(models.Model):
    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        MOBILE_MONEY = "mobile_money", "Mobile Money"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"

    class PaymentStatus(models.TextChoices):
        PAID = "paid", "Paid"
        PARTIAL = "partial", "Partly paid"
        CREDIT = "credit", "On credit"

    class SaleStatus(models.TextChoices):
        COMPLETED = "completed", "Completed"
        PARTIALLY_RETURNED = "partially_returned", "Partly returned"
        RETURNED = "returned", "Returned"
        # Undone on the day it was made: stock back, every payment reversed.
        VOIDED = "voided", "Voided"

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
    # Cached sum of this sale's payments (finance.Payment), refreshed in the same
    # transaction as every payment; payment_status is derived from it.
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    payment_status = models.CharField(
        max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PAID
    )
    due_date = models.DateField(null=True, blank=True)
    # Cached sum of this sale's return items' refund_amount (SaleReturnItem),
    # refreshed in the same transaction as each return. What the customer owes is
    # total_amount - returned_amount - amount_paid.
    returned_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    void_reason = models.TextField(blank=True, default="")
    voided_by = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, null=True, blank=True, related_name="voided_sales"
    )
    voided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["sale_date"], name="sale_sale_date")]

    @property
    def net_total(self):
        """The sale's value after returns: what the customer is to pay in the end."""
        return self.total_amount - self.returned_amount

    @property
    def balance(self):
        return self.net_total - self.amount_paid

    def __str__(self):
        return f"Sale #{self.sale_id}"


class SaleItem(models.Model):
    sale_item_id = models.AutoField(primary_key=True)
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT, related_name="sale_items")
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    # Catalog retail price at the moment of sale. unit_price may be overridden at
    # the till; keeping the list price beside it makes every discount/markup auditable.
    list_price = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    tax_category = models.CharField(max_length=1, choices=Product.TaxCategory.choices)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2)
    # Weighted average paid cost at the moment of sale (null before the product's
    # first received purchase). Never shown to sales staff.
    cost_at_sale = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    # (list_price - unit_price) * quantity: positive for a discount, negative for a markup.
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # The manager/admin whose PIN approved this line's price, when it needed one.
    approved_by = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, null=True, blank=True,
        related_name="approved_sale_items",
    )
    price_note = models.TextField(blank=True, default="")

    def __str__(self):
        return f"{self.product} x{self.quantity} (Sale #{self.sale_id})"


class SaleReturn(models.Model):
    """Units of a sale coming back, with the refund they earn.

    The refund first reduces what is still owed on the sale; only the excess is
    paid out (an "out" finance.Payment on the sale). Admin/manager only.
    """

    class RefundMethod(models.TextChoices):
        CASH = "cash", "Cash"
        MOBILE_MONEY = "mobile_money", "Mobile Money"
        CARD = "card", "Card"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        # Nothing paid out: the refund only reduced the open balance.
        BALANCE = "balance", "Reduced the balance owed"

    return_id = models.AutoField(primary_key=True)
    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name="returns")
    reason = models.TextField()
    refund_method = models.CharField(max_length=20, choices=RefundMethod.choices)
    refund_reference = models.CharField(max_length=100, blank=True, default="")
    refund_total = models.DecimalField(max_digits=14, decimal_places=2)
    paid_out = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    balance_reduced = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    refund_payment = models.OneToOneField(
        "finance.Payment", on_delete=models.PROTECT, null=True, blank=True, related_name="sale_return"
    )
    created_by = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, related_name="sale_returns_created"
    )
    approved_by = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, null=True, blank=True,
        related_name="sale_returns_approved",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-return_id"]

    def __str__(self):
        return f"Return #{self.return_id} of Sale #{self.sale_id}"


class SaleReturnItem(models.Model):
    class Condition(models.TextChoices):
        RESELLABLE = "resellable", "Resellable"
        DAMAGED = "damaged", "Damaged"

    return_item_id = models.AutoField(primary_key=True)
    sale_return = models.ForeignKey(SaleReturn, on_delete=models.CASCADE, related_name="items")
    sale_item = models.ForeignKey(SaleItem, on_delete=models.PROTECT, related_name="return_items")
    quantity = models.PositiveIntegerField()
    refund_amount = models.DecimalField(max_digits=14, decimal_places=2)
    condition = models.CharField(max_length=20, choices=Condition.choices)

    def __str__(self):
        return f"{self.sale_item} x{self.quantity} returned ({self.condition})"
