"""Module C — bargaining at the till."""
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth.hashers import make_password
from rest_framework.exceptions import Throttled, ValidationError
from rest_framework.test import APIClient

from accounts.models import Employee
from accounts.services import ApprovalRefused, set_approval_pin
from catalog.models import Category, Product, ProductPricing
from finance.models import ShopProfile
from purchasing.models import Purchase, Supplier
from purchasing.services import add_existing_product_item, receive_purchase
from sales.models import SaleItem
from sales.services import ApprovalRequired, PriceNoteRequired, complete_sale

pytestmark = pytest.mark.django_db
D = Decimal


def make_employee(username, role, pin=None):
    employee = Employee.objects.create_user(
        username=username, password="pass12345", full_name=username.title(),
        hire_date=date(2025, 1, 1), role=role,
    )
    if pin:
        set_approval_pin(employee, pin)
    return employee


@pytest.fixture
def staff():
    return make_employee("staff1", Employee.Role.SALES_STAFF)


@pytest.fixture
def manager():
    return make_employee("manager1", Employee.Role.MANAGER, pin="4321")


@pytest.fixture
def admin():
    return make_employee("admin1", Employee.Role.ADMIN, pin="9999")


@pytest.fixture
def product(manager):
    """List price 100; weighted average paid cost 60 from a received purchase."""
    category = Category.objects.create(name="Audio", code="AUD")
    product = Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker")
    ProductPricing.objects.create(
        product=product, wholesale_price=D("60.00"), retail_price=D("100.00"),
        effective_date=date(2026, 1, 1), is_current=True,
    )
    purchase = Purchase.objects.create(
        supplier=Supplier.objects.create(name="S"), employee=manager, purchase_date=date(2026, 1, 1)
    )
    add_existing_product_item(purchase, product, 50, D("60"), D("60"))
    receive_purchase(purchase, user=manager)
    return product


def sell(employee, product, price, approval=None, note=""):
    return complete_sale(
        None, employee, "cash",
        [{"product": product, "quantity": 2, "unit_price": D(price), "price_note": note}],
        approval=approval,
    )


def pin(username, value):
    return {"approver_username": username, "pin": value}


def test_markup_is_allowed_and_recorded_as_negative_discount(staff, product):
    item = SaleItem.objects.get(sale=sell(staff, product, "120"))
    assert item.discount_amount == D("-40.00")
    assert item.cost_at_sale == D("60.00")
    assert item.approved_by is None


def test_staff_can_discount_up_to_the_limit_alone(staff, product):
    item = SaleItem.objects.get(sale=sell(staff, product, "90"))
    assert item.discount_amount == D("20.00")
    assert item.approved_by is None


def test_staff_discount_over_the_limit_needs_a_manager_pin(staff, manager, product):
    with pytest.raises(ApprovalRequired):
        sell(staff, product, "85")
    item = SaleItem.objects.get(sale=sell(staff, product, "85", approval=pin("manager1", "4321")))
    assert item.approved_by == manager


def test_below_floor_needs_a_note_and_approval_for_staff(staff, admin, product):
    with pytest.raises(PriceNoteRequired):
        sell(staff, product, "55")
    with pytest.raises(ApprovalRequired):
        sell(staff, product, "55", note="Old stock, customer haggled")
    sale = sell(staff, product, "55", note="Old stock, customer haggled", approval=pin("admin1", "9999"))
    item = SaleItem.objects.get(sale=sale)
    assert item.approved_by == admin
    assert item.price_note == "Old stock, customer haggled"


def test_manager_discounts_freely_above_the_floor(manager, product):
    item = SaleItem.objects.get(sale=sell(manager, product, "70"))
    assert item.approved_by is None


def test_manager_below_floor_needs_a_note_but_no_pin(manager, product):
    with pytest.raises(PriceNoteRequired):
        sell(manager, product, "50")
    item = SaleItem.objects.get(sale=sell(manager, product, "50", note="Display unit"))
    assert item.approved_by is None and item.price_note == "Display unit"


def test_min_price_is_the_floor_when_set(staff, manager, product):
    product.min_price = D("95")
    product.save()
    with pytest.raises(PriceNoteRequired):
        sell(staff, product, "92")  # within 10%, but below the 95 floor


def test_shop_profile_sets_the_staff_limit(staff, product):
    profile, _ = ShopProfile.objects.get_or_create(pk=1, defaults={"business_name": "Shop"})
    profile.max_staff_discount_pct = D("20")
    profile.save()
    item = SaleItem.objects.get(sale=sell(staff, product, "82"))
    assert item.approved_by is None


def test_wrong_pin_is_refused_and_locks_after_five_attempts(staff, manager, product):
    for _ in range(5):
        with pytest.raises(ApprovalRefused):
            sell(staff, product, "85", approval=pin("manager1", "0000"))
    with pytest.raises(Throttled):
        sell(staff, product, "85", approval=pin("manager1", "4321"))
    assert not SaleItem.objects.filter(unit_price=D("85")).exists()


def test_a_non_manager_approver_is_refused(staff, product):
    technician = make_employee("tech1", Employee.Role.TECHNICIAN)
    Employee.objects.filter(pk=technician.pk).update(approval_pin=make_password("1111"))
    with pytest.raises(ApprovalRefused):
        sell(staff, product, "85", approval=pin("tech1", "1111"))


def test_an_inactive_manager_cannot_approve(staff, manager, product):
    Employee.objects.filter(pk=manager.pk).update(status=Employee.Status.INACTIVE)
    with pytest.raises(ApprovalRefused):
        sell(staff, product, "85", approval=pin("manager1", "4321"))


def test_zero_price_is_refused_for_everyone(admin, product):
    with pytest.raises(ValidationError):
        complete_sale(None, admin, "cash", [{"product": product, "quantity": 1, "unit_price": D("0")}])


# --- API ----------------------------------------------------------------------

def client_for(employee):
    client = APIClient()
    token = client.post(
        "/api/auth/login/", {"username": employee.username, "password": "pass12345"}, format="json"
    ).json()["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


def test_staff_never_receive_cost_at_sale(staff, manager, product):
    payload = {"payment_method": "cash", "items": [{"product": product.pk, "quantity": 1}]}
    staff_item = client_for(staff).post("/api/sales/", payload, format="json").json()["items"][0]
    manager_item = client_for(manager).post("/api/sales/", payload, format="json").json()["items"][0]
    assert "cost_at_sale" not in staff_item
    assert manager_item["cost_at_sale"] == "60.00"
    sale_id = staff_item["sale"]
    assert "cost_at_sale" not in client_for(staff).get(f"/api/sales/{sale_id}/").json()["items"][0]


def test_sale_api_returns_approval_required_code(staff, product):
    response = client_for(staff).post("/api/sales/", {
        "payment_method": "cash",
        "items": [{"product": product.pk, "quantity": 1, "unit_price": "80.00"}],
    }, format="json")
    assert response.status_code == 400
    assert response.json()["code"] == "approval_required"
    assert "60" not in str(response.json()["detail"])


def test_price_check_tells_staff_the_rule_without_cost(staff, manager, product):
    response = client_for(staff).post("/api/sales/price-check/", {"items": [
        {"product": product.pk, "unit_price": "120"},
        {"product": product.pk, "unit_price": "95"},
        {"product": product.pk, "unit_price": "85"},
        {"product": product.pk, "unit_price": "55"},
    ]}, format="json")
    assert response.status_code == 200
    lines = response.json()["lines"]
    assert [l["rule"] for l in lines] == ["markup", "discount", "needs_approval", "below_floor"]
    assert [l["needs_approval"] for l in lines] == [False, False, True, True]
    assert [l["needs_note"] for l in lines] == [False, False, False, True]
    assert "60" not in str(response.json())

    manager_lines = client_for(manager).post("/api/sales/price-check/", {"items": [
        {"product": product.pk, "unit_price": "85"},
    ]}, format="json").json()["lines"]
    assert manager_lines[0]["needs_approval"] is False


def test_min_price_is_hidden_from_staff_and_set_by_managers(staff, manager, product):
    assert client_for(staff).patch(
        f"/api/products/{product.pk}/", {"min_price": "70"}, format="json"
    ).status_code == 403
    response = client_for(manager).patch(f"/api/products/{product.pk}/", {"min_price": "70"}, format="json")
    assert response.status_code == 200 and response.json()["min_price"] == "70.00"
    assert "min_price" not in client_for(staff).get(f"/api/products/{product.pk}/").json()


def test_admin_sets_approval_pins_for_managers_only(admin, manager, staff):
    client = client_for(admin)
    response = client.post(f"/api/employees/{manager.pk}/set-pin/", {"pin": "2468"}, format="json")
    assert response.status_code == 200
    assert response.json()["has_approval_pin"] is True
    assert "approval_pin" not in response.json()
    assert client.post(f"/api/employees/{staff.pk}/set-pin/", {"pin": "2468"}, format="json").status_code == 400
    assert client.post(f"/api/employees/{manager.pk}/set-pin/", {"pin": "12"}, format="json").status_code == 400
    assert client_for(manager).post(
        f"/api/employees/{manager.pk}/set-pin/", {"pin": "2468"}, format="json"
    ).status_code == 403


def test_only_admin_changes_the_shop_profile(admin, manager):
    assert client_for(manager).patch("/api/shop-profile/", {"max_staff_discount_pct": "15"}, format="json").status_code == 403
    response = client_for(admin).patch("/api/shop-profile/", {"max_staff_discount_pct": "15"}, format="json")
    assert response.status_code == 200 and response.json()["max_staff_discount_pct"] == "15.00"
    assert client_for(admin).patch("/api/shop-profile/", {"max_staff_discount_pct": "150"}, format="json").status_code == 400
