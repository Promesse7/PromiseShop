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


class EquipmentUnit(models.Model):
    class UnitStatus(models.TextChoices):
        IN_STOCK = "in_stock", "In stock"
        IN_USE = "in_use", "In use"
        DAMAGED = "damaged", "Damaged"
        UNDER_REPAIR = "under_repair", "Under repair"
        SOLD = "sold", "Sold"

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
