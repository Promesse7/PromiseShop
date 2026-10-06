"""Module D endpoints: permissions, cost stripping, filters, serial lookup."""
import pytest

from operations.models import InternalConsumption, ShopAsset
from operations.services import take_from_stock_as_asset
from stock.models import EquipmentUnit

from .conftest import client_for, stock_of

pytestmark = pytest.mark.django_db

APPROVAL = {"approver_username": "manager1", "pin": "4321"}


def consume_payload(product, **extra):
    return {"product": product.product_id, "quantity": 1, "purpose": "repair", "reason": "Till cable", **extra}


def test_manager_consumes_and_sees_value(cable, manager):
    response = client_for(manager).post("/api/operations/consumptions/", consume_payload(cable), format="json")

    assert response.status_code == 201
    body = response.json()
    assert body["total_value"] == "2000.00" and body["taken_by_name"] == "Manager1"
    assert stock_of(cable) == 9


def test_staff_without_pin_gets_approval_required(cable, staff):
    response = client_for(staff).post("/api/operations/consumptions/", consume_payload(cable), format="json")

    assert response.status_code == 400
    assert response.json()["code"] == "approval_required"
    assert stock_of(cable) == 10


def test_staff_with_pin_consumes_and_never_sees_cost(cable, staff, manager):
    client = client_for(staff)
    response = client.post(
        "/api/operations/consumptions/", consume_payload(cable, approval=APPROVAL), format="json"
    )

    assert response.status_code == 201
    assert "unit_cost" not in response.json() and "total_value" not in response.json()
    assert response.json()["approved_by_name"] == "Manager1"
    rows = client.get("/api/operations/consumptions/").json()["results"]
    assert rows and "total_value" not in rows[0]


def test_consumption_filters(cable, printer, admin):
    client = client_for(admin)
    client.post("/api/operations/consumptions/", consume_payload(cable), format="json")
    client.post("/api/operations/consumptions/", consume_payload(printer, purpose="shop_setup"), format="json")

    by_product = client.get(f"/api/operations/consumptions/?product={cable.product_id}").json()
    by_purpose = client.get("/api/operations/consumptions/?purpose=shop_setup").json()
    by_date = client.get("/api/operations/consumptions/?from=2000-01-01&to=2000-01-02").json()

    assert by_product["count"] == 1 and by_purpose["count"] == 1 and by_date["count"] == 0
    assert client.get("/api/operations/consumptions/?from=nope").status_code == 400


def test_register_asset_is_admin_or_manager(staff, manager):
    payload = {"name": "Shop laptop", "serial": "LAP-9", "acquisition_value": "400000"}
    assert client_for(staff).post("/api/operations/assets/", payload, format="json").status_code == 400
    response = client_for(manager).post("/api/operations/assets/", payload, format="json")
    assert response.status_code == 201
    assert response.json()["source"] == "pre_owned"


def test_take_from_stock_by_serial_and_lookup_by_serial(printer, admin, staff):
    EquipmentUnit.objects.create(product=printer, serial_number="SN-77", status="in_stock")
    client = client_for(admin)

    created = client.post(
        "/api/operations/assets/from-stock/",
        {"product": printer.product_id, "serial": "sn-77", "reason": "Office printer", "location": "Office"},
        format="json",
    )

    assert created.status_code == 201
    assert created.json()["serial"] == "SN-77" and created.json()["acquisition_value"] == "200000.00"
    found = client_for(staff).get("/api/operations/assets/?serial=SN-77").json()["results"]
    assert len(found) == 1 and "acquisition_value" not in found[0]


def test_status_replace_and_events_endpoints(printer, admin):
    client = client_for(admin)
    asset = take_from_stock_as_asset(printer, user=admin, reason="Office")

    status = client.post(f"/api/operations/assets/{asset.asset_id}/status/",
                         {"to_status": "under_repair", "reason": "Jam"}, format="json")
    replaced = client.post(f"/api/operations/assets/{asset.asset_id}/replace/",
                           {"new_status": "retired", "reason": "Dead", "replacement_product": printer.product_id},
                           format="json")
    events = client.get(f"/api/operations/assets/{asset.asset_id}/events/").json()

    assert status.status_code == 200 and status.json()["status"] == "under_repair"
    assert replaced.status_code == 201 and replaced.json()["replaces"] == asset.asset_id
    assert events[0]["to_status"] == "retired" and events[0]["replaced_by"] == replaced.json()["asset_id"]


def test_return_to_stock_is_admin_only(printer, admin, manager):
    asset = take_from_stock_as_asset(printer, user=admin, reason="Office")
    url = f"/api/operations/assets/{asset.asset_id}/return-to-stock/"
    payload = {"bucket": "in_stock", "reason": "Sell it"}

    assert client_for(manager).post(url, payload, format="json").status_code == 400
    response = client_for(admin).post(url, payload, format="json")
    assert response.status_code == 200 and response.json()["status"] == "returned_to_stock"


def test_asset_list_filters(printer, admin):
    take_from_stock_as_asset(printer, user=admin, reason="a", location="Office")
    take_from_stock_as_asset(printer, user=admin, reason="b", location="Store", is_spare=True)
    client = client_for(admin)

    assert client.get("/api/operations/assets/?location=off").json()["count"] == 1
    assert client.get("/api/operations/assets/?is_spare=true").json()["count"] == 1
    assert client.get("/api/operations/assets/?status=in_service,damaged").json()["count"] == 2


def test_unauthenticated_gets_401():
    from rest_framework.test import APIClient
    assert APIClient().get("/api/operations/assets/").status_code == 401
    assert InternalConsumption.objects.count() == 0 and ShopAsset.objects.count() == 0
