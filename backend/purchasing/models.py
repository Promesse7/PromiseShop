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

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        RECEIVED = "received", "Received"
        CANCELLED = "cancelled", "Cancelled"

    purchase_id = models.AutoField(primary_key=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchases")
    employee = models.ForeignKey("accounts.Employee", on_delete=models.PROTECT, related_name="purchases")
    invoice_number = models.CharField(max_length=60, blank=True, null=True)
    purchase_date = models.DateField()
    total_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_invoiced = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Derived from finance.Payment rows by finance.services; not set by hand.
    payment_status = models.CharField(
        max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.UNPAID
    )
    # Cached sum of payments to the supplier for this purchase.
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    due_date = models.DateField(null=True, blank=True)
    # Set by the payments data migration on purchases that were "partial" or
    # "unpaid" before payments existed: the owner must confirm what was paid.
    payment_needs_review = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    # Module H4: only a purchase with a proper VAT invoice gives input VAT back.
    has_vat_invoice = models.BooleanField(default=True)

    def __str__(self):
        return f"Purchase #{self.purchase_id} - {self.supplier}"


class PurchaseItem(models.Model):
    """One line of a purchase: a single product, a pack of one product, or a bundle.

    `quantity` counts what the supplier sold (units, packs or bundles) and the unit
    costs are per one of those, so subtotals and purchase totals work the same for
    every kind. Stock is always counted in single units (see `units_received`).
    """

    class LineKind(models.TextChoices):
        SINGLE = "single", "Single"
        PACK = "pack", "Pack"
        BUNDLE = "bundle", "Bundle"

    purchase_item_id = models.AutoField(primary_key=True)
    purchase = models.ForeignKey(Purchase, on_delete=models.CASCADE, related_name="items")
    # Null only on a bundle line: its products are the components.
    product = models.ForeignKey(
        "catalog.Product", on_delete=models.PROTECT, related_name="purchase_items", null=True, blank=True
    )
    line_kind = models.CharField(max_length=10, choices=LineKind.choices, default=LineKind.SINGLE)
    units_per_pack = models.PositiveIntegerField(default=1)
    bundle_name = models.CharField(max_length=150, blank=True, default="")
    quantity = models.PositiveIntegerField()
    unit_cost_paid = models.DecimalField(max_digits=12, decimal_places=2)
    unit_cost_invoiced = models.DecimalField(max_digits=12, decimal_places=2)
    price_discrepancy_note = models.TextField(blank=True, null=True)
    subtotal_paid = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal_invoiced = models.DecimalField(max_digits=12, decimal_places=2)
    # VAT category of the product when bought (Module H4); null on a bundle line,
    # whose components carry their own.
    tax_category = models.CharField(max_length=1, null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(product__isnull=False) | models.Q(line_kind="bundle"),
                name="purchase_item_product_required_unless_bundle",
            ),
            models.CheckConstraint(
                condition=~models.Q(line_kind="bundle") | models.Q(product__isnull=True),
                name="purchase_item_bundle_has_no_product",
            ),
            models.CheckConstraint(
                condition=models.Q(units_per_pack__gte=1),
                name="purchase_item_units_per_pack_positive",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.tax_category is None and self.product_id:
            self.tax_category = self.product.tax_category
        super().save(*args, **kwargs)

    @property
    def units_received(self):
        """Single units this line brings into stock (all components for a bundle)."""
        if self.line_kind == self.LineKind.BUNDLE:
            return sum(self.quantity * c.qty_per_bundle for c in self.components.all())
        return self.quantity * self.units_per_pack

    def __str__(self):
        label = self.bundle_name if self.line_kind == self.LineKind.BUNDLE else self.product
        return f"{label} x{self.quantity} (Purchase #{self.purchase_id})"


class PurchaseItemComponent(models.Model):
    """One product inside a bundle line, with its share of the bundle's price."""

    component_id = models.AutoField(primary_key=True)
    purchase_item = models.ForeignKey(PurchaseItem, on_delete=models.CASCADE, related_name="components")
    product = models.ForeignKey(
        "catalog.Product", on_delete=models.PROTECT, related_name="purchase_item_components"
    )
    qty_per_bundle = models.PositiveIntegerField()
    # Per ONE bundle; summed over the components they equal the line's unit costs exactly.
    allocated_paid_cost = models.DecimalField(max_digits=14, decimal_places=2)
    allocated_invoiced_cost = models.DecimalField(max_digits=14, decimal_places=2)
    # VAT category of the component product when bought (Module H4).
    tax_category = models.CharField(max_length=1, null=True, blank=True)

    class Meta:
        ordering = ["component_id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(qty_per_bundle__gte=1), name="purchase_component_qty_positive"
            ),
            models.UniqueConstraint(
                fields=["purchase_item", "product"], name="purchase_component_product_once_per_bundle"
            ),
        ]

    def save(self, *args, **kwargs):
        if self.tax_category is None and self.product_id:
            self.tax_category = self.product.tax_category
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.product} x{self.qty_per_bundle} in {self.purchase_item}"


class BundleTemplate(models.Model):
    """A saved bundle recipe (e.g. "Canalbox TV kit" = 1 TV + 20 decoders)."""

    template_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=150)
    supplier = models.ForeignKey(
        Supplier, on_delete=models.SET_NULL, null=True, blank=True, related_name="bundle_templates"
    )
    created_by = models.ForeignKey(
        "accounts.Employee", on_delete=models.SET_NULL, null=True, blank=True, related_name="bundle_templates"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name", "template_id"]

    def __str__(self):
        return self.name


class BundleTemplateComponent(models.Model):
    template_component_id = models.AutoField(primary_key=True)
    template = models.ForeignKey(BundleTemplate, on_delete=models.CASCADE, related_name="components")
    product = models.ForeignKey(
        "catalog.Product", on_delete=models.PROTECT, related_name="bundle_template_components"
    )
    qty_per_bundle = models.PositiveIntegerField()

    class Meta:
        ordering = ["template_component_id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(qty_per_bundle__gte=1), name="bundle_template_component_qty_positive"
            ),
            models.UniqueConstraint(
                fields=["template", "product"], name="bundle_template_product_once"
            ),
        ]

    def __str__(self):
        return f"{self.product} x{self.qty_per_bundle} in {self.template}"
