from django.contrib.postgres.indexes import GinIndex
from django.db import models

from catalog.search import normalise_text


class Category(models.Model):
    category_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=80, unique=True)
    code = models.CharField(max_length=10, unique=True)
    description = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.name


class Product(models.Model):
    class TaxCategory(models.TextChoices):
        EXEMPT = "A", "Exempt (0%)"
        STANDARD = "B", "Standard (18%)"

    product_id = models.AutoField(primary_key=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    barcode = models.CharField(max_length=50, unique=True, editable=False)
    name = models.CharField(max_length=150)
    brand = models.CharField(max_length=80, blank=True, null=True)
    model_number = models.CharField(max_length=80, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    specifications = models.TextField(blank=True, null=True)
    usage_instructions = models.TextField(blank=True, null=True)
    warranty_months = models.PositiveIntegerField(default=0)
    reorder_level = models.PositiveIntegerField(default=5)
    unit = models.CharField(max_length=20, default="pcs")
    tax_category = models.CharField(max_length=1, choices=TaxCategory.choices, default=TaxCategory.STANDARD)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    # Maintained on save for product search (Module E1): lowercase, single-spaced.
    # normalized_name answers "is this exactly the same name?"; search_text (name +
    # brand + model) carries the trigram index for fuzzy matching.
    normalized_name = models.CharField(max_length=150, default="", editable=False, db_index=True)
    search_text = models.CharField(max_length=320, default="", editable=False)

    class Meta:
        indexes = [
            GinIndex(fields=["search_text"], name="product_search_trgm", opclasses=["gin_trgm_ops"]),
        ]

    def save(self, *args, **kwargs):
        self.normalized_name = normalise_text(self.name)
        self.search_text = normalise_text(" ".join([self.name or "", self.brand or "", self.model_number or ""]))
        update_fields = kwargs.get("update_fields")
        if update_fields is not None:
            kwargs["update_fields"] = set(update_fields) | {"normalized_name", "search_text"}
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.barcode})"


class ProductBarcodeAlias(models.Model):
    """An extra barcode that scans as its product — e.g. the label of a duplicate
    that was merged into it (Module E4), so old stickers keep working."""

    alias_id = models.AutoField(primary_key=True)
    barcode = models.CharField(max_length=50, unique=True)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="barcode_aliases")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.barcode} -> {self.product}"


class ProductPricing(models.Model):
    price_id = models.AutoField(primary_key=True)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="pricing_history")
    wholesale_price = models.DecimalField(max_digits=12, decimal_places=2)
    retail_price = models.DecimalField(max_digits=12, decimal_places=2)
    effective_date = models.DateField()
    is_current = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["product"],
                condition=models.Q(is_current=True),
                name="one_current_price_per_product",
            )
        ]

    def __str__(self):
        return f"{self.product} @ {self.effective_date}"


class ProductMerge(models.Model):
    """Log of a duplicate product folded into the one kept (Module E4). Irreversible.

    The duplicate keeps its own ledger rows and adjustments as history; its sales,
    purchases, units, prices and stock now belong to ``keep``. Code that reports
    on ``keep`` follows these rows (catalog.merge.merged_product_ids).
    """

    merge_id = models.AutoField(primary_key=True)
    keep = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="merges_received")
    duplicate = models.OneToOneField(Product, on_delete=models.PROTECT, related_name="merged_into")
    merged_by = models.ForeignKey("accounts.Employee", on_delete=models.PROTECT, related_name="product_merges")
    reason = models.TextField()
    # What moved, e.g. {"sale_items": 3, "purchase_items": 1, "in_stock": 4, ...}
    counts = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-merge_id"]

    def __str__(self):
        return f"{self.duplicate_id} merged into {self.keep_id}"

