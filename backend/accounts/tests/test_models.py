import pytest
from datetime import date
from accounts.models import Employee

pytestmark = pytest.mark.django_db


def test_create_user_hashes_password_and_check_password_works():
    employee = Employee.objects.create_user(
        username="e.mugisha",
        password="s3cret-pass",
        full_name="Eric Mugisha",
        hire_date=date(2025, 1, 15),
        role=Employee.Role.SALES_STAFF,
    )
    assert employee.password != "s3cret-pass"
    assert employee.check_password("s3cret-pass")


def test_is_active_reflects_status():
    employee = Employee.objects.create_user(
        username="a.uwase",
        password="pw",
        full_name="Alice Uwase",
        hire_date=date(2025, 1, 15),
        role=Employee.Role.ADMIN,
        status=Employee.Status.INACTIVE,
    )
    assert employee.is_active is False

    employee.status = Employee.Status.ACTIVE
    assert employee.is_active is True


def test_is_staff_reflects_admin_role_only():
    admin = Employee.objects.create_user(
        username="admin1", password="pw", full_name="Admin One",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )
    staff = Employee.objects.create_user(
        username="staff1", password="pw", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )
    assert admin.is_staff is True
    assert staff.is_staff is False


def test_username_must_be_unique():
    Employee.objects.create_user(
        username="dupe", password="pw", full_name="First",
        hire_date=date(2025, 1, 1), role=Employee.Role.TECHNICIAN,
    )
    with pytest.raises(Exception):
        Employee.objects.create_user(
            username="dupe", password="pw", full_name="Second",
            hire_date=date(2025, 1, 1), role=Employee.Role.TECHNICIAN,
        )


def test_create_superuser_defaults_to_admin_role():
    superuser = Employee.objects.create_superuser(username="root", password="pw")
    assert superuser.role == Employee.Role.ADMIN
    assert superuser.is_staff is True
    assert superuser.is_superuser is True
