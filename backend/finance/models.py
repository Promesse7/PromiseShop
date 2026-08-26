from django.db import models


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
