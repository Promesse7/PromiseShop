import pytest
from datetime import date
from accounts.models import Employee
from sales.models import Sale
from notifications.models import NotificationLog

pytestmark = pytest.mark.django_db


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="admin1", password="adminpass", full_name="Admin One",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


def test_notification_log_without_related_sale(employee):
    log = NotificationLog.objects.create(type="low_stock", recipient=employee)
    assert log.related_sale is None
    assert log.status == NotificationLog.NotificationStatus.SENT


def test_notification_log_with_related_sale(employee):
    sale = Sale.objects.create(employee=employee, total_amount="145000.00")
    log = NotificationLog.objects.create(
        type="sale_alert", recipient=employee, related_sale=sale
    )
    assert log.related_sale == sale
