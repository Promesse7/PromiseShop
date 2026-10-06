"""Stock the shop uses itself (Module D).

Two cases kept apart:

- InternalConsumption: an item used up or installed that won't come back (a
  cable, toner, a part fitted to the shop's own printer). It leaves sellable
  stock with a reason, a person and a value — and is never an expense or COGS.
- ShopAsset: equipment the shop runs on (its printer, a laptop, a display TV),
  taken from stock or already owned. It can break, be repaired, be replaced or
  be retired; every step is a ShopAssetEvent.
"""
from django.db import models
from django.utils import timezone

from stock.models import AppendOnlyError


class InternalConsumptionQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise AppendOnlyError("Consumption records are append-only; put stock back with an adjustment instead.")

    def delete(self):
        raise AppendOnlyError("Consumption records are append-only; put stock back with an adjustment instead.")

    def reassign_product(self, product):
        """The one change allowed: a product merge moves the rows to the kept product."""
        return super().update(product=product)


class InternalConsumption(models.Model):
    class Purpose(models.TextChoices):
        REPLACEMENT = "replacement", "Replacement"
        REPAIR = "repair", "Repair"
        SHOP_SETUP = "shop_setup", "Shop setup"
        OTHER = "other", "Other"

    consumption_id = models.AutoField(primary_key=True)
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT, related_name="consumptions")
    quantity = models.PositiveIntegerField()
    # Weighted average paid cost at that moment; null when the product has no cost yet.
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    total_value = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    reason = models.TextField()
    taken_by = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, related_name="consumptions_taken"
    )
    recorded_by = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, related_name="consumptions_recorded"
    )
    approved_by = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, null=True, blank=True,
        related_name="consumptions_approved",
    )
    shop_asset = models.ForeignKey(
        "operations.ShopAsset", on_delete=models.PROTECT, null=True, blank=True,
        related_name="consumptions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    objects = InternalConsumptionQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at", "-consumption_id"]
        indexes = [models.Index(fields=["created_at"], name="consumption_created")]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise AppendOnlyError("Consumption records are append-only.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise AppendOnlyError("Consumption records are append-only.")

    def __str__(self):
        return f"{self.quantity} × {self.product_id} ({self.purpose})"


class ShopAsset(models.Model):
    class Status(models.TextChoices):
        IN_SERVICE = "in_service", "In service"
        DAMAGED = "damaged", "Damaged"
        UNDER_REPAIR = "under_repair", "Under repair"
        RETIRED = "retired", "Retired"
        RETURNED_TO_STOCK = "returned_to_stock", "Returned to stock"

    class Source(models.TextChoices):
        FROM_STOCK = "from_stock", "Taken from stock"
        PRE_OWNED = "pre_owned", "Already owned"

    asset_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=150)
    product = models.ForeignKey(
        "catalog.Product", on_delete=models.PROTECT, null=True, blank=True, related_name="shop_assets"
    )
    equipment_unit = models.ForeignKey(
        "stock.EquipmentUnit", on_delete=models.PROTECT, null=True, blank=True, related_name="shop_assets"
    )
    serial = models.CharField(max_length=100, blank=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_SERVICE)
    location = models.CharField(max_length=80, blank=True, default="")
    assigned_to = models.ForeignKey(
        "accounts.Employee", on_delete=models.SET_NULL, null=True, blank=True, related_name="shop_assets"
    )
    source = models.CharField(max_length=20, choices=Source.choices)
    acquired_at = models.DateField(default=timezone.localdate)
    # Average cost when taken from stock; the owner's estimate (or nothing) when pre-owned.
    acquisition_value = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    # An in-service, unassigned asset kept ready to replace a broken one.
    is_spare = models.BooleanField(default=False)
    # The broken asset this one replaced, if any.
    replaces = models.ForeignKey(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="replacements"
    )
    notes = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, related_name="shop_assets_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name", "asset_id"]

    @property
    def is_closed(self):
        return self.status in (self.Status.RETIRED, self.Status.RETURNED_TO_STOCK)

    def __str__(self):
        return f"{self.name} [{self.serial or self.asset_id}]"


class ShopAssetEvent(models.Model):
    event_id = models.AutoField(primary_key=True)
    asset = models.ForeignKey(ShopAsset, on_delete=models.CASCADE, related_name="events")
    from_status = models.CharField(max_length=20, choices=ShopAsset.Status.choices, blank=True, null=True)
    to_status = models.CharField(max_length=20, choices=ShopAsset.Status.choices)
    reason = models.TextField()
    user = models.ForeignKey("accounts.Employee", on_delete=models.PROTECT, related_name="shop_asset_events")
    approved_by = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, null=True, blank=True,
        related_name="shop_asset_events_approved",
    )
    # On the broken asset's event: the asset that took its place.
    replaced_by = models.ForeignKey(
        ShopAsset, on_delete=models.PROTECT, null=True, blank=True, related_name="replaced_events"
    )
    consumption = models.ForeignKey(
        InternalConsumption, on_delete=models.PROTECT, null=True, blank=True, related_name="asset_events"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-event_id"]

    def __str__(self):
        return f"{self.asset_id}: {self.from_status} -> {self.to_status}"
