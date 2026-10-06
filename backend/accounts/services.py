import re

from django.contrib.auth.hashers import check_password, make_password
from rest_framework.exceptions import Throttled, ValidationError

from accounts import lockout
from accounts.models import Employee

APPROVER_ROLES = (Employee.Role.ADMIN, Employee.Role.MANAGER)
PIN_PATTERN = re.compile(r"^\d{4,6}$")
REFUSED_MESSAGE = "Approval refused: wrong approver or PIN."


class ApprovalRefused(ValidationError):
    default_code = "approval_refused"


def can_approve(employee):
    return employee is not None and employee.role in APPROVER_ROLES and employee.is_active


def set_approval_pin(employee, pin):
    if employee.role not in APPROVER_ROLES:
        raise ValidationError({"pin": "Only admin and manager accounts can have an approval PIN."})
    if not PIN_PATTERN.match(str(pin or "")):
        raise ValidationError({"pin": "The PIN must be 4 to 6 digits."})
    employee.approval_pin = make_password(str(pin))
    employee.save(update_fields=["approval_pin"])
    return employee


def _lock_name(username):
    return f"pin:{username}"


def verify_approval(approver_username, pin):
    """Return the approving Employee, or raise.

    The approver must be an active admin or manager with a PIN set, and the PIN
    must match. Wrong attempts count toward the same lockout as login (5 in 15
    minutes locks that approver's PIN for 15 minutes). The refusal never says
    which part was wrong.
    """
    username = str(approver_username or "").strip()
    if lockout.is_locked(_lock_name(username)):
        raise Throttled(detail="Too many wrong PIN attempts. Try again in 15 minutes.")
    approver = Employee.objects.filter(username__iexact=username).first()
    ok = (
        approver is not None
        and can_approve(approver)
        and bool(approver.approval_pin)
        and check_password(str(pin or ""), approver.approval_pin)
    )
    if not ok:
        lockout.record_failure(_lock_name(username))
        raise ApprovalRefused(REFUSED_MESSAGE)
    lockout.clear_failures(_lock_name(username))
    return approver
