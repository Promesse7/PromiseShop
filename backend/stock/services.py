from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework.exceptions import ValidationError

from stock.models import EquipmentUnit, EquipmentStatusHistory, Inventory, InventoryAdjustment, StockMovement

BUCKET_FIELDS = {
    StockMovement.Bucket.IN_STOCK: "quantity_in_stock",
    StockMovement.Bucket.IN_USE: "quantity_in_use",
    StockMovement.Bucket.DAMAGED: "quantity_damaged",
}

# Movements a person decides on, rather than ones a document (purchase, sale,
# return, bundle) causes — these must say why.
MANUAL_MOVEMENT_TYPES = {
    StockMovement.MovementType.ADJUST_COUNT,
    StockMovement.MovementType.TO_DAMAGED,
    StockMovement.MovementType.FROM_DAMAGED,
    StockMovement.MovementType.TO_IN_USE,
    StockMovement.MovementType.FROM_IN_USE,
    StockMovement.MovementType.INTERNAL_CONSUMPTION,
    StockMovement.MovementType.TO_SHOP_ASSET,
    StockMovement.MovementType.OPENING,
    StockMovement.MovementType.MERGE_IN,
    StockMovement.MovementType.MERGE_OUT,
}

CENT = Decimal("0.01")


def weighted_average_cost(product):
    """Weighted average *paid* unit cost over the product's received purchase lines.

    None when nothing has been received yet. Used for ledger unit costs, the
    cost floor at the till and the value of stock used internally.
    """
    from purchasing.models import Purchase, PurchaseItem

    totals = PurchaseItem.objects.filter(
        product=product, purchase__status=Purchase.Status.RECEIVED
    ).aggregate(units=Sum("quantity"), paid=Sum("subtotal_paid"))
    if not totals["units"]:
        return None
    return (totals["paid"] / totals["units"]).quantize(CENT, rounding=ROUND_HALF_UP)


def record_movement(inventory, bucket, delta, movement_type, source, user, reason="", unit_cost=None):
    """Change one Inventory bucket by ``delta`` and write the ledger row for it.

    Must run inside the caller's transaction with ``inventory`` already locked
    (select_for_update). ``source`` is a ``(source_type, source_id)`` tuple or
    None. ``unit_cost`` defaults to the product's weighted average paid cost now;
    callers pass an explicit cost when they know better (a purchase line's own
    cost). Refuses to take a bucket below zero.
    """
    field = BUCKET_FIELDS.get(bucket)
    if field is None:
        raise ValidationError({"bucket": f"Invalid bucket: {bucket}"})
    if movement_type not in StockMovement.MovementType.values:
        raise ValidationError({"movement_type": f"Invalid movement type: {movement_type}"})
    reason = (reason or "").strip()
    if movement_type in MANUAL_MOVEMENT_TYPES and not reason:
        raise ValidationError({"reason": "A reason is required for this stock movement."})
    if delta == 0 and movement_type != StockMovement.MovementType.ADJUST_COUNT:
        raise ValidationError("A stock movement must change the quantity.")

    current = getattr(inventory, field)
    new_balance = current + delta
    if new_balance < 0:
        raise ValidationError(
            f"Not enough stock: {current} {StockMovement.Bucket(bucket).label.lower()}, "
            f"cannot take {-delta}."
        )
    setattr(inventory, field, new_balance)
    inventory.save(update_fields=[field, "last_updated"])

    source_type, source_id = source if source else ("", None)
    return StockMovement.objects.create(
        product_id=inventory.product_id,
        movement_type=movement_type,
        bucket=bucket,
        quantity_delta=delta,
        balance_after=new_balance,
        unit_cost=unit_cost if unit_cost is not None else weighted_average_cost(inventory.product_id),
        source_type=source_type,
        source_id=source_id,
        reason=reason,
        created_by=user,
    )

VALID_STATUSES = {choice[0] for choice in EquipmentUnit.UnitStatus.choices}

# adjustment_type -> (source bucket field, destination bucket field, wording)
MOVES = {
    InventoryAdjustment.AdjustmentType.TO_DAMAGED: ("quantity_in_stock", "quantity_damaged", "to damaged", "in stock"),
    InventoryAdjustment.AdjustmentType.FROM_DAMAGED: ("quantity_damaged", "quantity_in_stock", "from damaged", "damaged"),
    InventoryAdjustment.AdjustmentType.TO_IN_USE: ("quantity_in_stock", "quantity_in_use", "to in use", "in stock"),
    InventoryAdjustment.AdjustmentType.FROM_IN_USE: ("quantity_in_use", "quantity_in_stock", "from in use", "in use"),
}


FIELD_BUCKETS = {field: bucket for bucket, field in BUCKET_FIELDS.items()}


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
            steps = [(StockMovement.Bucket.IN_STOCK, quantity - locked.quantity_in_stock,
                      StockMovement.MovementType.ADJUST_COUNT)]
        else:
            if quantity < 1:
                raise ValidationError({"quantity": "Move at least 1 unit."})
            source, destination, verb, source_label = MOVES[adjustment_type]
            available = getattr(locked, source)
            if quantity > available:
                raise ValidationError(
                    f"Cannot move {quantity} {verb}: only {available} {source_label}."
                )
            steps = [
                (FIELD_BUCKETS[source], -quantity, adjustment_type),
                (FIELD_BUCKETS[destination], quantity, adjustment_type),
            ]

        # The audit row is written first so the ledger rows can point at it.
        adjustment = InventoryAdjustment.objects.create(
            inventory=locked, adjustment_type=adjustment_type, quantity=quantity,
            reason=reason.strip(), changed_by=changed_by,
            before_in_stock=before[0], after_in_stock=before[0],
            before_in_use=before[1], after_in_use=before[1],
            before_damaged=before[2], after_damaged=before[2],
        )
        for bucket, delta, movement_type in steps:
            record_movement(
                locked, bucket, delta, movement_type, ("adjustment", adjustment.pk),
                changed_by, reason=reason,
            )
        InventoryAdjustment.objects.filter(pk=adjustment.pk).update(
            after_in_stock=locked.quantity_in_stock,
            after_in_use=locked.quantity_in_use,
            after_damaged=locked.quantity_damaged,
        )
        adjustment.refresh_from_db()
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
