from django.db import transaction
from rest_framework.exceptions import ValidationError

from stock.models import EquipmentUnit, EquipmentStatusHistory, Inventory, InventoryAdjustment

VALID_STATUSES = {choice[0] for choice in EquipmentUnit.UnitStatus.choices}

# adjustment_type -> (source bucket field, destination bucket field, wording)
MOVES = {
    InventoryAdjustment.AdjustmentType.TO_DAMAGED: ("quantity_in_stock", "quantity_damaged", "to damaged", "in stock"),
    InventoryAdjustment.AdjustmentType.FROM_DAMAGED: ("quantity_damaged", "quantity_in_stock", "from damaged", "damaged"),
    InventoryAdjustment.AdjustmentType.TO_IN_USE: ("quantity_in_stock", "quantity_in_use", "to in use", "in stock"),
    InventoryAdjustment.AdjustmentType.FROM_IN_USE: ("quantity_in_use", "quantity_in_stock", "from in use", "in use"),
}


def adjust_inventory(inventory, adjustment_type, quantity, reason, changed_by):
    """Apply a manual stock adjustment and write its audit row.

    A count correction sets quantity_in_stock outright (the number typed at a
    stock take); the four moves shift units between in-stock and the damaged /
    in-use buckets and can never exceed what the source bucket holds.
    """
    if adjustment_type not in InventoryAdjustment.AdjustmentType.values:
        raise ValidationError({"adjustment_type": f"Invalid adjustment type: {adjustment_type}"})
    if not reason or not reason.strip():
        raise ValidationError({"reason": "A reason is required when adjusting stock."})

    with transaction.atomic():
        locked = Inventory.objects.select_for_update().get(pk=inventory.pk)
        before = (locked.quantity_in_stock, locked.quantity_in_use, locked.quantity_damaged)

        if adjustment_type == InventoryAdjustment.AdjustmentType.COUNT_CORRECTION:
            if quantity < 0:
                raise ValidationError({"quantity": "A count cannot be negative."})
            locked.quantity_in_stock = quantity
        else:
            if quantity < 1:
                raise ValidationError({"quantity": "Move at least 1 unit."})
            source, destination, verb, source_label = MOVES[adjustment_type]
            available = getattr(locked, source)
            if quantity > available:
                raise ValidationError(
                    f"Cannot move {quantity} {verb}: only {available} {source_label}."
                )
            setattr(locked, source, available - quantity)
            setattr(locked, destination, getattr(locked, destination) + quantity)

        locked.save(update_fields=["quantity_in_stock", "quantity_in_use", "quantity_damaged", "last_updated"])

        adjustment = InventoryAdjustment.objects.create(
            inventory=locked, adjustment_type=adjustment_type, quantity=quantity,
            reason=reason.strip(), changed_by=changed_by,
            before_in_stock=before[0], after_in_stock=locked.quantity_in_stock,
            before_in_use=before[1], after_in_use=locked.quantity_in_use,
            before_damaged=before[2], after_damaged=locked.quantity_damaged,
        )
    return adjustment


def change_equipment_status(unit, new_status, reason, changed_by, assigned_to=None):
    if new_status not in VALID_STATUSES:
        raise ValidationError(f"Invalid status: {new_status}")
    if not reason:
        raise ValidationError({"reason": "A reason is required when changing equipment status."})

    with transaction.atomic():
        locked_unit = EquipmentUnit.objects.select_for_update().get(pk=unit.pk)
        previous_status = locked_unit.status

        EquipmentStatusHistory.objects.create(
            unit=locked_unit, previous_status=previous_status, new_status=new_status,
            changed_by=changed_by, notes=reason,
        )

        locked_unit.status = new_status
        update_fields = ["status", "status_changed_at"]
        if assigned_to is not None:
            locked_unit.assigned_to = assigned_to
            update_fields.append("assigned_to")
        locked_unit.save(update_fields=update_fields)

    return locked_unit
