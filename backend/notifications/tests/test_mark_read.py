import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from notifications.models import NotificationLog

pytestmark = pytest.mark.django_db


def auth_client(employee, password):
    client = APIClient()
    response = client.post(
        "/api/auth/login/", {"username": employee.username, "password": password}, format="json"
    )
    token = response.json()["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="admin1", password="adminpass", full_name="Admin One",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


@pytest.fixture
def other_employee():
    return Employee.objects.create_user(
        username="admin2", password="adminpass", full_name="Admin Two",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


def test_mark_read_sets_read_at(employee):
    log = NotificationLog.objects.create(type="sale_alert", recipient=employee)
    client = auth_client(employee, "adminpass")
    response = client.post(f"/api/notifications/{log.notification_id}/mark-read/")
    assert response.status_code == 200
    log.refresh_from_db()
    assert log.read_at is not None
    assert response.json()["read_at"] is not None


def test_mark_read_is_idempotent(employee):
    log = NotificationLog.objects.create(type="sale_alert", recipient=employee)
    client = auth_client(employee, "adminpass")
    first = client.post(f"/api/notifications/{log.notification_id}/mark-read/")
    log.refresh_from_db()
    first_read_at = log.read_at
    second = client.post(f"/api/notifications/{log.notification_id}/mark-read/")
    assert second.status_code == 200
    log.refresh_from_db()
    assert log.read_at == first_read_at


def test_mark_read_other_employees_notification_returns_404(employee, other_employee):
    log = NotificationLog.objects.create(type="sale_alert", recipient=other_employee)
    client = auth_client(employee, "adminpass")
    response = client.post(f"/api/notifications/{log.notification_id}/mark-read/")
    assert response.status_code == 404
    log.refresh_from_db()
    assert log.read_at is None


def test_mark_read_unauthenticated_returns_401():
    client = APIClient()
    response = client.post("/api/notifications/1/mark-read/")
    assert response.status_code == 401
