from django.db import models


class Category(models.Model):
    category_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=80, unique=True)
    code = models.CharField(max_length=10, unique=True)
    description = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.name


class Product(models.Model):
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
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.barcode})"
