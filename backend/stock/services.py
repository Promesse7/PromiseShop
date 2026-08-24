from django.db import transaction
from rest_framework.exceptions import ValidationError

from stock.models import EquipmentUnit, EquipmentStatusHistory

VALID_STATUSES = {choice[0] for choice in EquipmentUnit.UnitStatus.choices}


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
