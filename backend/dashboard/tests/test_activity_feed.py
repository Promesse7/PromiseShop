import pytest
from datetime import date, timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import Employee
from notifications.models import NotificationLog
from purchasing.models import Purchase, Supplier
from sales.models import Sale

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
def admin():
    return Employee.objects.create_user(
        username="admin1", password="adminpass", full_name="Admin One",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


@pytest.fixture
def other_admin():
    return Employee.objects.create_user(
        username="admin2", password="adminpass", full_name="Admin Two",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


@pytest.fixture
def staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def supplier():
    return Supplier.objects.create(name="Acme Supplies")


def test_activity_feed_merges_and_sorts_three_types(admin, supplier):
    Sale.objects.create(employee=admin, total_amount=Decimal("1000.00"), status=Sale.SaleStatus.COMPLETED)
    Purchase.objects.create(
        supplier=supplier, employee=admin, purchase_date=date.today(), status=Purchase.Status.DRAFT,
    )
    NotificationLog.objects.create(type="sale_alert", recipient=admin)
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/activity-feed/")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 3
    types = {item["type"] for item in body}
    assert types == {"sale", "purchase", "notification"}


def test_activity_feed_respects_limit(admin):
    for _ in range(5):
        Sale.objects.create(employee=admin, total_amount=Decimal("1000.00"), status=Sale.SaleStatus.COMPLETED)
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/activity-feed/?limit=3")
    assert response.status_code == 200
    assert len(response.json()) == 3


def test_activity_feed_default_limit_is_20(admin):
    for _ in range(25):
        Sale.objects.create(employee=admin, total_amount=Decimal("1000.00"), status=Sale.SaleStatus.COMPLETED)
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/activity-feed/")
    assert response.status_code == 200
    assert len(response.json()) == 20


def test_activity_feed_only_includes_requesting_admins_notifications(admin, other_admin):
    NotificationLog.objects.create(type="sale_alert", recipient=admin)
    NotificationLog.objects.create(type="sale_alert", recipient=other_admin)
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/activity-feed/")
    notification_items = [item for item in response.json() if item["type"] == "notification"]
    assert len(notification_items) == 1


def test_activity_feed_empty_state(admin):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/activity-feed/")
    assert response.status_code == 200
    assert response.json() == []


def test_activity_feed_non_admin_returns_403(staff):
    client = auth_client(staff, "staffpass")
    response = client.get("/api/dashboard/activity-feed/")
    assert response.status_code == 403


def test_activity_feed_unauthenticated_returns_401():
    client = APIClient()
    response = client.get("/api/dashboard/activity-feed/")
    assert response.status_code == 401


def test_activity_feed_non_numeric_limit_returns_400(admin):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/activity-feed/?limit=abc")
    assert response.status_code == 400


def test_activity_feed_negative_limit_is_clamped_to_one(admin):
    for _ in range(3):
        Sale.objects.create(employee=admin, total_amount=Decimal("1000.00"), status=Sale.SaleStatus.COMPLETED)
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/activity-feed/?limit=-5")
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_activity_feed_huge_limit_is_clamped_to_100(admin):
    for _ in range(10):
        Sale.objects.create(employee=admin, total_amount=Decimal("1000.00"), status=Sale.SaleStatus.COMPLETED)
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/activity-feed/?limit=99999")
    assert response.status_code == 200
    assert len(response.json()) == 10


def test_activity_feed_cancelled_sale_includes_status(admin):
    Sale.objects.create(employee=admin, total_amount=Decimal("1000.00"), status=Sale.SaleStatus.CANCELLED)
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/activity-feed/")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["status"] == "cancelled"


def test_activity_feed_orders_items_newest_first(admin, supplier):
    now = timezone.now()

    sale = Sale.objects.create(employee=admin, total_amount=Decimal("1000.00"), status=Sale.SaleStatus.COMPLETED)
    Sale.objects.filter(pk=sale.pk).update(sale_date=now - timedelta(hours=3))

    purchase = Purchase.objects.create(
        supplier=supplier, employee=admin, purchase_date=(now - timedelta(days=1)).date(),
        status=Purchase.Status.DRAFT,
    )

    notification = NotificationLog.objects.create(type="sale_alert", recipient=admin)
    NotificationLog.objects.filter(pk=notification.pk).update(sent_at=now)

    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/activity-feed/")
    assert response.status_code == 200
    body = response.json()

    ordered = [(item["type"], item["id"]) for item in body]
    assert ordered == [
        ("notification", notification.notification_id),
        ("sale", sale.sale_id),
        ("purchase", purchase.purchase_id),
    ]

    timestamps = [item["timestamp"] for item in body]
    assert timestamps == sorted(timestamps, reverse=True)
