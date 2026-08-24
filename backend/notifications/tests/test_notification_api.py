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


def test_list_only_returns_own_notifications(employee, other_employee):
    NotificationLog.objects.create(type="sale_alert", recipient=employee)
    NotificationLog.objects.create(type="sale_alert", recipient=other_employee)
    client = auth_client(employee, "adminpass")
    response = client.get("/api/notifications/")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1


def test_list_unread_filter(employee):
    from django.utils import timezone
    NotificationLog.objects.create(type="sale_alert", recipient=employee, read_at=timezone.now())
    NotificationLog.objects.create(type="sale_alert", recipient=employee)
    client = auth_client(employee, "adminpass")
    response = client.get("/api/notifications/?unread=true")
    assert response.status_code == 200
    assert response.json()["count"] == 1


def test_list_ordered_newest_first(employee):
    first = NotificationLog.objects.create(type="sale_alert", recipient=employee)
    second = NotificationLog.objects.create(type="sale_reversed", recipient=employee)
    client = auth_client(employee, "adminpass")
    response = client.get("/api/notifications/")
    results = response.json()["results"]
    assert results[0]["notification_id"] == second.notification_id
    assert results[1]["notification_id"] == first.notification_id


def test_retrieve_own_notification(employee):
    log = NotificationLog.objects.create(type="sale_alert", recipient=employee)
    client = auth_client(employee, "adminpass")
    response = client.get(f"/api/notifications/{log.notification_id}/")
    assert response.status_code == 200
    assert response.json()["type"] == "sale_alert"


def test_retrieve_other_employees_notification_returns_404(employee, other_employee):
    log = NotificationLog.objects.create(type="sale_alert", recipient=other_employee)
    client = auth_client(employee, "adminpass")
    response = client.get(f"/api/notifications/{log.notification_id}/")
    assert response.status_code == 404


def test_post_to_collection_returns_405(employee):
    client = auth_client(employee, "adminpass")
    response = client.post("/api/notifications/", {"type": "sale_alert"}, format="json")
    assert response.status_code == 405


def test_patch_put_delete_return_405(employee):
    log = NotificationLog.objects.create(type="sale_alert", recipient=employee)
    client = auth_client(employee, "adminpass")
    url = f"/api/notifications/{log.notification_id}/"
    assert client.patch(url, {"type": "x"}, format="json").status_code == 405
    assert client.put(url, {"type": "x"}, format="json").status_code == 405
    assert client.delete(url).status_code == 405


def test_unauthenticated_request_returns_401():
    client = APIClient()
    response = client.get("/api/notifications/")
    assert response.status_code == 401
