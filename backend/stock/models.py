from django.db import models


class Inventory(models.Model):
    inventory_id = models.AutoField(primary_key=True)
    product = models.OneToOneField(
        "catalog.Product", on_delete=models.CASCADE, related_name="inventory"
    )
    quantity_in_stock = models.IntegerField(default=0)
    quantity_in_use = models.IntegerField(default=0)
    quantity_damaged = models.IntegerField(default=0)
    storage_location = models.CharField(max_length=80, blank=True, null=True)
    last_updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Inventory for {self.product}"


class InventoryAdjustment(models.Model):
    """Audit row for a manual change to an Inventory's buckets.

    Purchases and sales move quantity_in_stock on their own; this records the
    corrections a person makes — a recount, breakage, demo use — with who did
    it, why, and every bucket before and after, mirroring EquipmentStatusHistory
    for serialised units.
    """

    class AdjustmentType(models.TextChoices):
        COUNT_CORRECTION = "count_correction", "Count correction"
        TO_DAMAGED = "to_damaged", "Moved to damaged"
        FROM_DAMAGED = "from_damaged", "Returned from damaged"
        TO_IN_USE = "to_in_use", "Moved to in use"
        FROM_IN_USE = "from_in_use", "Returned from in use"

    adjustment_id = models.AutoField(primary_key=True)
    inventory = models.ForeignKey(Inventory, on_delete=models.CASCADE, related_name="adjustments")
    adjustment_type = models.CharField(max_length=20, choices=AdjustmentType.choices)
    # For a count correction this is the new in-stock count; for a move, the units moved.
    quantity = models.PositiveIntegerField()
    reason = models.TextField()
    before_in_stock = models.IntegerField()
    after_in_stock = models.IntegerField()
    before_in_use = models.IntegerField()
    after_in_use = models.IntegerField()
    before_damaged = models.IntegerField()
    after_damaged = models.IntegerField()
    changed_by = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, related_name="inventory_adjustments"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-adjustment_id"]

    def __str__(self):
        return f"{self.inventory} {self.adjustment_type} {self.quantity}"


class AppendOnlyError(Exception):
    """Raised when code tries to change or remove a ledger row."""


class StockMovementQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise AppendOnlyError("Stock movements are append-only; write a reversing movement instead.")

    def delete(self):
        raise AppendOnlyError("Stock movements are append-only; write a reversing movement instead.")


class StockMovement(models.Model):
    """One signed change to one Inventory bucket — the stock ledger.

    Inventory stays the cached balance; every change to a bucket goes through
    stock.services.record_movement, which updates the bucket and writes this row
    in the same transaction. Rows are never edited or deleted.
    """

    class MovementType(models.TextChoices):
        PURCHASE_RECEIPT = "purchase_receipt", "Purchase received"
        PURCHASE_CANCEL = "purchase_cancel", "Purchase cancelled"
        SALE = "sale", "Sale"
        SALE_RETURN = "sale_return", "Sale return"
        SALE_VOID = "sale_void", "Sale void"
        ADJUST_COUNT = "adjust_count", "Count correction"
        TO_DAMAGED = "to_damaged", "Moved to damaged"
        FROM_DAMAGED = "from_damaged", "Returned from damaged"
        TO_IN_USE = "to_in_use", "Moved to in use"
        FROM_IN_USE = "from_in_use", "Returned from in use"
        INTERNAL_CONSUMPTION = "internal_consumption", "Used internally"
        TO_SHOP_ASSET = "to_shop_asset", "Made shop asset"
        FROM_SHOP_ASSET = "from_shop_asset", "Returned from shop asset"
        OPENING = "opening", "Opening stock"
        MERGE_IN = "merge_in", "Merged in"
        MERGE_OUT = "merge_out", "Merged out"
        BUNDLE_BREAKDOWN = "bundle_breakdown", "Bundle breakdown"

    class Bucket(models.TextChoices):
        IN_STOCK = "in_stock", "In stock"
        IN_USE = "in_use", "In use"
        DAMAGED = "damaged", "Damaged"

    movement_id = models.BigAutoField(primary_key=True)
    product = models.ForeignKey(
        "catalog.Product", on_delete=models.CASCADE, related_name="stock_movements"
    )
    movement_type = models.CharField(max_length=30, choices=MovementType.choices)
    bucket = models.CharField(max_length=10, choices=Bucket.choices)
    quantity_delta = models.IntegerField()
    balance_after = models.IntegerField()
    # Weighted average paid cost at the time; null before the product's first received purchase.
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    source_type = models.CharField(max_length=30, blank=True, default="")
    source_id = models.BigIntegerField(null=True, blank=True)
    reason = models.TextField(blank=True, default="")
    # Null only for system rows (the ledger-start backfill).
    created_by = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, null=True, blank=True,
        related_name="stock_movements",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    objects = StockMovementQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at", "-movement_id"]
        indexes = [
            models.Index(fields=["product", "created_at"], name="stockmove_product_created"),
            models.Index(fields=["created_at"], name="stockmove_created"),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise AppendOnlyError("Stock movements are append-only; write a reversing movement instead.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise AppendOnlyError("Stock movements are append-only; write a reversing movement instead.")

    def __str__(self):
        return f"{self.product_id} {self.movement_type} {self.bucket} {self.quantity_delta:+d}"


class EquipmentUnit(models.Model):
    class UnitStatus(models.TextChoices):
        IN_STOCK = "in_stock", "In stock"
        IN_USE = "in_use", "In use"
        DAMAGED = "damaged", "Damaged"
        UNDER_REPAIR = "under_repair", "Under repair"
        SOLD = "sold", "Sold"
        # Kept by the shop for its own use (Module D, operations.ShopAsset).
        SHOP_ASSET = "shop_asset", "Shop asset"

    unit_id = models.AutoField(primary_key=True)
    product = models.ForeignKey(
        "catalog.Product", on_delete=models.CASCADE, related_name="equipment_units"
    )
    serial_number = models.CharField(max_length=100, unique=True)
    status = models.CharField(max_length=20, choices=UnitStatus.choices)
    assigned_to = models.ForeignKey(
        "accounts.Employee", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="assigned_equipment",
    )
    storage_location = models.CharField(max_length=80, blank=True, null=True)
    condition_notes = models.TextField(blank=True, null=True)
    status_changed_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.product} [{self.serial_number}]"


class EquipmentStatusHistory(models.Model):
    history_id = models.AutoField(primary_key=True)
    unit = models.ForeignKey(EquipmentUnit, on_delete=models.CASCADE, related_name="status_history")
    previous_status = models.CharField(max_length=20, blank=True, null=True)
    new_status = models.CharField(max_length=20)
    changed_by = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, related_name="equipment_changes"
    )
    change_date = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.unit} {self.previous_status} -> {self.new_status}"
