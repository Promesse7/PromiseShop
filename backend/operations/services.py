"""Module D: stock the shop uses itself, and the shop's own equipment.

Every function runs in one transaction and locks what it changes. Stock leaves
or returns through stock.services.record_movement, so the ledger stays whole.
Values use the weighted average paid cost at that moment; none of this is an
expense or cost of goods sold.

Who may act: admin and manager directly. Sales staff and technicians may
consume, take stock as an asset and replace a broken asset only with a manager
or admin PIN (``approval={"approver_username", "pin"}``); a technician may also
move an asset between under-repair and in-service with one. Registering an
asset the shop already owned and other status changes are admin/manager.
Returning an asset to sellable stock is admin only.
"""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.models import Employee
from accounts.services import verify_approval
from operations.models import InternalConsumption, ShopAsset, ShopAssetEvent
from stock.models import EquipmentUnit, Inventory, StockMovement
from stock.services import change_equipment_status, record_movement, weighted_average_cost

MANAGERS = (Employee.Role.ADMIN, Employee.Role.MANAGER)
CENT = Decimal("0.01")
REPAIR_TOGGLE = {ShopAsset.Status.UNDER_REPAIR, ShopAsset.Status.IN_SERVICE}
BROKEN_STATUSES = {ShopAsset.Status.DAMAGED, ShopAsset.Status.UNDER_REPAIR, ShopAsset.Status.RETIRED}


class ApprovalRequired(ValidationError):
    """A manager/admin PIN is needed (same code the till uses)."""

    default_code = "approval_required"


def _authorise(user, approval=None, *, staff_with_approval=True, admin_only=False):
    """Return the approving Employee (None when the user acts on their own authority).

    Raises ApprovalRequired when the user's role may not do this, or may only do
    it with a PIN and none (or a wrong one) was given.
    """
    if admin_only:
        if user.role != Employee.Role.ADMIN:
            raise ApprovalRequired("Only an admin can do this.")
        return None
    if user.role in MANAGERS:
        return None
    if not staff_with_approval:
        raise ApprovalRequired("Only an admin or manager can do this.")
    if not approval:
        raise ApprovalRequired("Needs manager approval.")
    return verify_approval(approval.get("approver_username"), approval.get("pin"))


def _reason(reason):
    reason = (reason or "").strip()
    if not reason:
        raise ValidationError({"reason": "Say why."})
    return reason


def _locked_inventory(product):
    Inventory.objects.get_or_create(product=product)
    return Inventory.objects.select_for_update().get(product=product)


def _money(value):
    return None if value is None else value.quantize(CENT)


def _event(asset, from_status, to_status, reason, user, approved_by=None, replaced_by=None, consumption=None):
    return ShopAssetEvent.objects.create(
        asset=asset, from_status=from_status, to_status=to_status, reason=reason, user=user,
        approved_by=approved_by, replaced_by=replaced_by, consumption=consumption,
    )


# --- consumption --------------------------------------------------------------

def consume_stock(product, qty, purpose, reason, taken_by, user, asset=None, approval=None):
    """Take ``qty`` of ``product`` out of sellable stock for the shop's own use."""
    reason = _reason(reason)
    if purpose not in InternalConsumption.Purpose.values:
        raise ValidationError({"purpose": f"Invalid purpose: {purpose}"})
    if not isinstance(qty, int) or qty < 1:
        raise ValidationError({"quantity": "Use at least 1."})
    approver = _authorise(user, approval)

    with transaction.atomic():
        inventory = _locked_inventory(product)
        unit_cost = weighted_average_cost(product)
        record = InternalConsumption.objects.create(
            product=product, quantity=qty, unit_cost=_money(unit_cost),
            total_value=_money(unit_cost * qty) if unit_cost is not None else None,
            purpose=purpose, reason=reason, taken_by=taken_by or user, recorded_by=user,
            approved_by=approver, shop_asset=asset,
        )
        record_movement(
            inventory, StockMovement.Bucket.IN_STOCK, -qty, StockMovement.MovementType.INTERNAL_CONSUMPTION,
            ("consumption", record.consumption_id), user, reason=reason, unit_cost=unit_cost,
        )
    return record


# --- assets -------------------------------------------------------------------

def register_asset(*, name, user, reason="", product=None, serial=None, status=ShopAsset.Status.IN_SERVICE,
                   location="", assigned_to=None, acquired_at=None, acquisition_value=None, notes="",
                   is_spare=False):
    """Something the shop already owned; no stock moves."""
    _authorise(user, staff_with_approval=False)
    if not (name or "").strip():
        raise ValidationError({"name": "Name the asset."})
    if status not in (ShopAsset.Status.IN_SERVICE, ShopAsset.Status.DAMAGED, ShopAsset.Status.UNDER_REPAIR):
        raise ValidationError({"status": "A new asset starts in service, damaged or under repair."})
    with transaction.atomic():
        asset = ShopAsset.objects.create(
            name=name.strip(), product=product, serial=serial or None, status=status, location=location or "",
            assigned_to=assigned_to, source=ShopAsset.Source.PRE_OWNED,
            acquired_at=acquired_at or timezone.localdate(), acquisition_value=acquisition_value,
            notes=notes or "", is_spare=is_spare, created_by=user,
        )
        _event(asset, None, status, (reason or "").strip() or "Registered", user)
    return asset


def _take_from_stock(product, *, user, reason, approver=None, unit=None, name=None, location="",
                     assigned_to=None, is_spare=False, notes="", replaces=None):
    """Steps shared by take-from-stock and replace; caller holds the transaction."""
    if unit is not None:
        unit = EquipmentUnit.objects.select_for_update().get(pk=unit.pk)
        if unit.product_id != product.pk:
            raise ValidationError({"unit": "That serial belongs to another product."})
        if unit.status != EquipmentUnit.UnitStatus.IN_STOCK:
            raise ValidationError({"unit": f"Unit {unit.serial_number} is not in stock ({unit.status})."})
    inventory = _locked_inventory(product)
    unit_cost = weighted_average_cost(product)
    asset = ShopAsset.objects.create(
        name=(name or "").strip() or product.name, product=product, equipment_unit=unit,
        serial=unit.serial_number if unit else None, status=ShopAsset.Status.IN_SERVICE,
        location=location or "", assigned_to=assigned_to, source=ShopAsset.Source.FROM_STOCK,
        acquisition_value=_money(unit_cost), is_spare=is_spare, notes=notes or "", replaces=replaces,
        created_by=user,
    )
    record_movement(
        inventory, StockMovement.Bucket.IN_STOCK, -1, StockMovement.MovementType.TO_SHOP_ASSET,
        ("shop_asset", asset.asset_id), user, reason=reason, unit_cost=unit_cost,
    )
    if unit is not None:
        change_equipment_status(unit, EquipmentUnit.UnitStatus.SHOP_ASSET, f"Shop asset #{asset.asset_id}: {reason}", user)
    first_reason = f"Replaces {replaces.name} (#{replaces.asset_id}): {reason}" if replaces else reason
    _event(asset, None, ShopAsset.Status.IN_SERVICE, first_reason, user, approved_by=approver)
    return asset


def take_from_stock_as_asset(product, *, user, reason, unit=None, name=None, location="", assigned_to=None,
                             is_spare=False, notes="", approval=None):
    """One unit leaves sellable stock and becomes a shop asset at average cost."""
    reason = _reason(reason)
    approver = _authorise(user, approval)
    with transaction.atomic():
        return _take_from_stock(
            product, user=user, reason=reason, approver=approver, unit=unit, name=name, location=location,
            assigned_to=assigned_to, is_spare=is_spare, notes=notes,
        )


def change_asset_status(asset, to_status, reason, user, approval=None):
    reason = _reason(reason)
    if to_status not in (ShopAsset.Status.IN_SERVICE, *BROKEN_STATUSES):
        raise ValidationError({"to_status": f"Invalid status: {to_status}"})
    approver = None
    if user.role not in MANAGERS:
        if user.role != Employee.Role.TECHNICIAN or to_status not in REPAIR_TOGGLE:
            raise ApprovalRequired("Only an admin or manager can do this.")
        approver = _authorise(user, approval)
    with transaction.atomic():
        locked = ShopAsset.objects.select_for_update().get(pk=asset.pk)
        if locked.is_closed:
            raise ValidationError(f"{locked.name} is {locked.get_status_display().lower()}; it can't change any more.")
        if locked.status == to_status:
            raise ValidationError(f"{locked.name} is already {locked.get_status_display().lower()}.")
        if _technician_bad_source(user, locked):
            raise ApprovalRequired("Only an admin or manager can do this.")
        previous = locked.status
        locked.status = to_status
        if to_status != ShopAsset.Status.IN_SERVICE:
            locked.is_spare = False
        locked.save(update_fields=["status", "is_spare"])
        _event(locked, previous, to_status, reason, user, approved_by=approver)
    return locked


def _technician_bad_source(user, asset):
    # A technician toggles only between under-repair and in-service.
    return user.role not in MANAGERS and asset.status not in REPAIR_TOGGLE


def replace_asset(broken_asset, new_status, reason, user, *, replacement_product=None, replacement_unit=None,
                  spare_asset=None, name=None, location=None, assigned_to=None, approval=None):
    """"Our printer broke, we took one from stock" — one transaction.

    Marks the broken asset damaged / under repair / retired, brings a replacement
    into service (a unit taken from stock, or a spare asset) and links the two.
    Any failure leaves everything as it was.
    """
    reason = _reason(reason)
    if new_status not in BROKEN_STATUSES:
        raise ValidationError({"new_status": "The broken asset becomes damaged, under repair or retired."})
    if (replacement_product is None) == (spare_asset is None):
        raise ValidationError("Replace from stock or with a spare asset — choose one.")
    approver = _authorise(user, approval)

    with transaction.atomic():
        lock_ids = sorted({broken_asset.pk, *( [spare_asset.pk] if spare_asset else [] )})
        locked = {a.pk: a for a in ShopAsset.objects.select_for_update().filter(pk__in=lock_ids).order_by("pk")}
        broken = locked[broken_asset.pk]
        if broken.is_closed:
            raise ValidationError(f"{broken.name} is {broken.get_status_display().lower()}.")
        target_location = broken.location if location is None else location
        target_assignee = broken.assigned_to if assigned_to is None else assigned_to

        if spare_asset is not None:
            new = locked[spare_asset.pk]
            if new.pk == broken.pk or not new.is_spare or new.status != ShopAsset.Status.IN_SERVICE:
                raise ValidationError({"spare_asset": "Pick an in-service asset marked as a spare."})
            new.is_spare = False
            new.location = target_location
            new.assigned_to = target_assignee
            new.replaces = broken
            new.save(update_fields=["is_spare", "location", "assigned_to", "replaces"])
            _event(new, ShopAsset.Status.IN_SERVICE, ShopAsset.Status.IN_SERVICE,
                   f"Spare brought into service to replace {broken.name} (#{broken.asset_id}): {reason}",
                   user, approved_by=approver)
        else:
            new = _take_from_stock(
                replacement_product, user=user, reason=reason, approver=approver, unit=replacement_unit,
                name=name or broken.name, location=target_location, assigned_to=target_assignee,
                replaces=broken,
            )

        previous = broken.status
        broken.status = new_status
        broken.is_spare = False
        broken.save(update_fields=["status", "is_spare"])
        _event(broken, previous, new_status, reason, user, approved_by=approver, replaced_by=new)
    return new


def return_asset_to_stock(asset, bucket, reason, user):
    """Admin only: a (repaired) asset goes back on the shelf, or into damaged stock."""
    reason = _reason(reason)
    _authorise(user, admin_only=True)
    if bucket not in (StockMovement.Bucket.IN_STOCK, StockMovement.Bucket.DAMAGED):
        raise ValidationError({"bucket": "Return into in stock or damaged."})
    with transaction.atomic():
        locked = ShopAsset.objects.select_for_update().get(pk=asset.pk)
        if locked.is_closed:
            raise ValidationError(f"{locked.name} is {locked.get_status_display().lower()}.")
        if locked.product_id is None:
            raise ValidationError("This asset has no catalog product, so it can't go into stock.")
        inventory = _locked_inventory(locked.product)
        record_movement(
            inventory, bucket, 1, StockMovement.MovementType.FROM_SHOP_ASSET,
            ("shop_asset", locked.asset_id), user, reason=reason,
            unit_cost=locked.acquisition_value,
        )
        if locked.equipment_unit_id:
            change_equipment_status(locked.equipment_unit, bucket, f"Back from shop asset #{locked.asset_id}: {reason}", user)
        previous = locked.status
        locked.status = ShopAsset.Status.RETURNED_TO_STOCK
        locked.is_spare = False
        locked.save(update_fields=["status", "is_spare"])
        _event(locked, previous, ShopAsset.Status.RETURNED_TO_STOCK, reason, user)
    return locked
