"""Module H: the money chain, leakage, VAT and people figures on a fixed fixture shop,
checked to the franc against hand-calculated figures."""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Employee
from catalog.models import Category, Product, ProductPricing
from dashboard import money
from finance.models import Expense
from operations.services import consume_stock
from purchasing.models import Purchase, Supplier
from purchasing.services import add_existing_product_item, receive_purchase
from sales.models import Customer
from sales.services import complete_sale, return_sale_items, void_sale
from stock.models import Inventory
from stock.services import adjust_inventory

pytestmark = pytest.mark.django_db
D = Decimal


@pytest.fixture
def manager():
    return Employee.objects.create_user(
        username="manager1", password="pass12345", full_name="Manager One",
        hire_date=date(2025, 1, 1), role=Employee.Role.MANAGER,
    )


@pytest.fixture
def shop(manager):
    """The fixture shop. Every figure the tests assert is derived in the comments."""
    category = Category.objects.create(name="Electronics", code="ELC")
    tv = Product.objects.create(category=category, barcode="PES-ELC-00001", name="TV",
                                tax_category=Product.TaxCategory.STANDARD)
    cable = Product.objects.create(category=category, barcode="PES-ELC-00002", name="Cable",
                                   tax_category=Product.TaxCategory.EXEMPT)
    today = timezone.localdate()
    for product, retail in ((tv, "118000.00"), (cable, "1000.00")):
        ProductPricing.objects.create(product=product, wholesale_price=D("1"), retail_price=D(retail),
                                      effective_date=today, is_current=True)

    # Purchase: TV 5 @ paid 80,000 / invoiced 82,000; cable 20 @ 400.
    # total paid 408,000, invoiced 418,000 -> billing difference 10,000.
    supplier = Supplier.objects.create(name="Supplier")
    purchase = Purchase.objects.create(supplier=supplier, employee=manager, purchase_date=today)
    add_existing_product_item(purchase, tv, 5, D("80000"), D("82000"), "supplier invoice higher")
    add_existing_product_item(purchase, cable, 20, D("400"), D("400"))
    receive_purchase(purchase, user=manager)

    customer = Customer.objects.create(name="Aline", phone="0788000000")
    # Sale 1: 2 TVs at 110,000 (discount 16,000), paid -> later 1 returned (refund 110,000).
    s1 = complete_sale(None, manager, "cash", [{"product": tv, "quantity": 2, "unit_price": D("110000")}])
    # Sale 2: 10 cables at 1,200 (markup 2,000), paid.
    complete_sale(None, manager, "cash", [{"product": cable, "quantity": 10, "unit_price": D("1200")}])
    # Sale 3: 1 TV at catalog, voided the same day.
    s3 = complete_sale(None, manager, "cash", [{"product": tv, "quantity": 1}])
    # Sale 4: 1 TV at catalog on credit: 18,000 paid, 100,000 owed.
    complete_sale(customer, manager, items=[{"product": tv, "quantity": 1}],
                  payments=[{"method": "cash", "amount": D("18000")}])

    return_sale_items(s1, [{"sale_item": s1.items.get(), "quantity": 1, "condition": "resellable"}],
                      "Customer changed mind", manager, refund_method="cash")
    void_sale(s3, manager, "Rung up twice")

    consume_stock(cable, 2, "replacement", "Fix the shop's own TV", manager, manager)  # 2 x 400 = 800
    adjust_inventory(Inventory.objects.get(product=cable), "to_damaged", 1, "Crushed", manager)  # 1 x 400
    Expense.objects.create(category="rent", amount=D("5000"), expense_date=today, recorded_by=manager)
    return {"tv": tv, "cable": cable, "today": today}


def test_chain_matches_hand_calculation_to_the_franc(shop):
    today = shop["today"]
    result = money.chain(today, today)
    f = result["figures"]

    assert f["catalog"] == D("482000.00")          # 4 TVs x 118,000 + 10 cables x 1,000
    assert f["discounts"] == D("16000.00")
    assert f["markups"] == D("2000.00")
    assert f["net_sales"] == D("468000.00")        # 482,000 - 14,000
    assert f["voids"] == D("118000.00")
    assert f["returns"] == D("110000.00")
    assert f["kept_sales"] == D("240000.00")
    # VAT: half of sale 1's 33,559.32 (one TV kept) + 18,000 on sale 4; cables exempt.
    assert f["output_vat"] == D("34779.66")
    assert f["net_excl_vat"] == D("205220.34")
    assert f["cogs"] == D("164000.00")             # 2 TVs x 80,000 + 10 cables x 400
    assert f["gross_profit"] == D("41220.34")
    assert f["expenses"] == D("5000.00")
    assert f["operating_profit"] == D("36220.34")

    steps = {s["key"]: s["amount"] for s in result["steps"]}
    assert steps["discounts"] == D("-14000.00")
    assert steps["returns_voids"] == D("-228000.00")
    assert steps["catalog"] + steps["discounts"] == steps["net_sales"]
    assert steps["net_sales"] + steps["returns_voids"] + steps["output_vat"] == steps["net_excl_vat"]
    assert steps["net_excl_vat"] + steps["cogs"] == steps["gross_profit"]
    assert steps["gross_profit"] + steps["expenses"] == steps["operating_profit"]
    assert result["cogs_estimate"]["estimated_lines"] == 0


def test_vat_position_is_an_estimate(shop):
    today = shop["today"]
    vat = money.vat_position(today, today)
    assert vat["output_vat"] == D("34779.66")
    assert vat["input_vat"] == D("62542.37")       # 410,000 invoiced on TVs x 18/118; cables exempt
    assert vat["net_vat"] == D("-27762.71")
    assert vat["label"] == "Estimate — not a tax filing"


def test_purchase_without_vat_invoice_gives_no_input_vat(shop):
    Purchase.objects.update(has_vat_invoice=False)
    today = shop["today"]
    assert money.input_vat(today, today) == D("0.00")


def test_leakage_beside_the_chain(shop):
    today = shop["today"]
    cards = {c["key"]: c for c in money.leakage(today, today)["cards"]}
    assert cards["discounts"]["value"] == D("16000.00")
    assert cards["materials"]["value"] == D("800.00")
    assert cards["damaged"]["value"] == D("400.00")
    assert cards["billing"]["value"] == D("10000.00")
    assert cards["new_credit"]["value"] == D("100000.00")
    assert cards["debt_collected"]["value"] == D("0.00")
    assert cards["debt_outstanding"]["value"] == D("100000.00")
    assert cards["damaged"]["link"].startswith("/stock/movements?type=to_damaged")
    assert cards["discounts"]["link"].startswith("/sales?has_discount=true")


def test_internal_use_is_not_an_expense_or_cogs(shop, manager):
    today = shop["today"]
    before = money.chain(today, today)["figures"]
    consume_stock(shop["cable"], 3, "repair", "More cable", manager, manager)
    after = money.chain(today, today)["figures"]
    assert after["expenses"] == before["expenses"]
    assert after["cogs"] == before["cogs"]


def test_product_drilldown(shop):
    today = shop["today"]
    tv = money.product_drilldown(shop["tv"], today, today)
    assert tv["units_bought"] == 5
    assert tv["avg_cost_paid"] == D("80000.00")
    assert tv["avg_cost_invoiced"] == D("82000.00")
    assert tv["catalog_price"] == D("118000.00")
    assert tv["units_sold"] == 2                    # one kept from sale 1, one on credit
    assert tv["revenue"] == D("228000.00")
    assert tv["avg_sold_price"] == D("114000.00")
    assert tv["cogs"] == D("160000.00")
    assert tv["in_stock"] == 3                      # 5 - 4 sold + 1 returned + 1 voided
    assert tv["stock_value"] == D("240000.00")
    cable = money.product_drilldown(shop["cable"], today, today)
    assert cable["units_consumed_internally"] == 2
    assert cable["units_damaged"] == 1
    assert cable["value_damaged"] == D("400.00")


def test_people(shop, manager):
    today = shop["today"]
    result = money.people(today, today)
    row = next(r for r in result["cashiers"] if r["employee_id"] == manager.pk)
    assert row["sales_count"] == 3
    assert row["sales_value"] == D("240000.00")     # 110,000 + 12,000 + 118,000
    assert row["discounts"] == D("16000.00")
    assert row["avg_discount_pct"] == D("4.40")     # 16,000 / 364,000
    assert row["voids"] == 1
    assert row["returns_count"] == 1
    assert row["returns_value"] == D("110000.00")


def test_summary_and_endpoints(shop, manager):
    client = APIClient()
    token = client.post("/api/auth/login/", {"username": "manager1", "password": "pass12345"}, format="json").json()["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    today = shop["today"].isoformat()
    for url in ("summary", "chain", "leakage", "people", "alerts", f"products/{shop['tv'].pk}"):
        response = client.get(f"/api/dashboard/{url}/?from={today}&to={today}")
        assert response.status_code == 200, url
    body = client.get(f"/api/dashboard/summary/?from={today}&to={today}").json()
    assert body["operating_profit"] == "36220.34"
    assert body["vat"]["label"] == "Estimate — not a tax filing"
    chain = client.get(f"/api/dashboard/chain/?from={today}&to={today}").json()
    assert chain["vat"]["input_vat"] == "62542.37"


@pytest.mark.parametrize("role", [Employee.Role.SALES_STAFF, Employee.Role.TECHNICIAN])
@pytest.mark.parametrize("url", ["summary", "chain", "leakage", "people", "alerts", "products/1"])
def test_staff_cannot_open_money_dashboards(role, url):
    Employee.objects.create_user(username="staff", password="pass12345", full_name="S",
                                 hire_date=date(2025, 1, 1), role=role)
    client = APIClient()
    token = client.post("/api/auth/login/", {"username": "staff", "password": "pass12345"}, format="json").json()["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    assert client.get(f"/api/dashboard/{url}/").status_code == 403


def test_older_dashboard_endpoints_agree_with_the_chain(shop, manager):
    """sales-summary, financial-snapshot and profitability count partly returned sales,
    net off returns and leave voided sales out, like the chain."""
    client = APIClient()
    token = client.post("/api/auth/login/", {"username": "manager1", "password": "pass12345"}, format="json").json()["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    summary = client.get("/api/dashboard/sales-summary/?period=today").json()
    assert summary["total_revenue"] == "240000.00"     # = kept sales in the chain
    assert summary["sale_count"] == 3
    snapshot = client.get("/api/dashboard/financial-snapshot/?period=today").json()
    assert snapshot["total_revenue"] == "240000.00"
    profit = client.get(f"/api/dashboard/profitability/?period=today&product={shop['tv'].pk}").json()
    row = profit["products"][0]
    assert row["units_sold"] == 2
    assert row["revenue"] == "228000.00"


def test_bad_dates_are_refused(manager):
    with pytest.raises(Exception):
        money.parse_range({"from": "yesterday"})
    with pytest.raises(Exception):
        money.parse_range({"from": "2026-10-06", "to": "2026-10-01"})
    start, end = money.parse_range({})
    assert start == timezone.localdate().replace(day=1)
    assert end == timezone.localdate()
    assert end - start < timedelta(days=31)
