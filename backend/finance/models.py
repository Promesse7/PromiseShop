from django.db import models
from django.utils import timezone

from stock.models import AppendOnlyError


class Expense(models.Model):
    class ExpenseCategory(models.TextChoices):
        RENT = "rent", "Rent"
        UTILITIES = "utilities", "Utilities"
        SALARIES = "salaries", "Salaries"
        REPAIRS = "repairs", "Repairs"
        OTHER = "other", "Other"

    expense_id = models.AutoField(primary_key=True)
    category = models.CharField(max_length=50, choices=ExpenseCategory.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    expense_date = models.DateField()
    description = models.TextField(blank=True, null=True)
    recorded_by = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, related_name="expenses_recorded"
    )

    def __str__(self):
        return f"{self.category} - {self.amount} ({self.expense_date})"


class ShopProfile(models.Model):
    business_name = models.CharField(max_length=150)
    tin = models.CharField(max_length=50, blank=True, null=True)
    po_box = models.CharField(max_length=50, blank=True, null=True)
    phone = models.CharField(max_length=30, blank=True, null=True)
    email = models.EmailField(max_length=120, blank=True, null=True)
    address = models.CharField(max_length=255, blank=True, null=True)

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        pass

    def __str__(self):
        return self.business_name


class PaymentQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise AppendOnlyError("Payments are append-only; reverse a payment instead.")

    def delete(self):
        raise AppendOnlyError("Payments are append-only; reverse a payment instead.")


class Payment(models.Model):
    """Money in from a customer or out to a supplier, against one sale or purchase.

    Debt balances are computed from these rows: a sale's amount_paid is the sum of
    its "in" payments minus any "out" refunds, a purchase's is its "out" payments
    minus any "in" refunds. A mistake is fixed with a reversal row (negative
    amount, reversal_of set), never by editing or deleting.
    """

    class Direction(models.TextChoices):
        IN = "in", "In (from customer)"
        OUT = "out", "Out (to supplier)"

    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        MOBILE_MONEY = "mobile_money", "Mobile Money"
        CARD = "card", "Card"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"

    payment_id = models.AutoField(primary_key=True)
    direction = models.CharField(max_length=3, choices=Direction.choices)
    sale = models.ForeignKey(
        "sales.Sale", on_delete=models.PROTECT, null=True, blank=True, related_name="payments"
    )
    purchase = models.ForeignKey(
        "purchasing.Purchase", on_delete=models.PROTECT, null=True, blank=True,
        related_name="payments",
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    method = models.CharField(max_length=20, choices=Method.choices)
    # MoMo / bank / card transaction id; required for every method but cash.
    reference = models.CharField(max_length=100, blank=True, default="")
    paid_at = models.DateTimeField(default=timezone.now)
    recorded_by = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, related_name="payments_recorded"
    )
    note = models.TextField(blank=True, default="")
    # Shared by every row of one customer payment spread over several sales.
    receipt_group = models.UUIDField(null=True, blank=True, db_index=True)
    reversal_of = models.OneToOneField(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="reversal"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    objects = PaymentQuerySet.as_manager()

    class Meta:
        ordering = ["-paid_at", "-payment_id"]
        indexes = [models.Index(fields=["paid_at"], name="payment_paid_at")]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(sale__isnull=False, purchase__isnull=True)
                    | models.Q(sale__isnull=True, purchase__isnull=False)
                ),
                name="payment_exactly_one_target",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(amount__gt=0, reversal_of__isnull=True)
                    | models.Q(amount__lt=0, reversal_of__isnull=False)
                ),
                name="payment_positive_unless_reversal",
            ),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise AppendOnlyError("Payments are append-only; reverse a payment instead.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise AppendOnlyError("Payments are append-only; reverse a payment instead.")

    def __str__(self):
        target = f"sale #{self.sale_id}" if self.sale_id else f"purchase #{self.purchase_id}"
        return f"{self.direction} {self.amount} ({self.method}) for {target}"
