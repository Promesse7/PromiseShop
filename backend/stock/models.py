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
