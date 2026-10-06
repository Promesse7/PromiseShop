"""Module H — the money dashboards: one chain from catalog value to operating profit,
every leak broken out beside it, per-product and per-person views, a VAT estimate
and rule-based alerts.

Everything is computed from the records Modules A-G write, aggregated in SQL.
Periods are Africa/Kigali calendar dates, inclusive at both ends.

The chain is a *cohort* of the sales made in the period: their returns and voids
are subtracted from them whenever those happened, so the chain always reconciles
(net sales - returns/voids = what the shop kept, and VAT and cost of goods are
taken on exactly those kept units).
"""
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import (
    Case, Count, DecimalField, ExpressionWrapper, F, IntegerField, OuterRef, Q, Subquery, Sum, Value, When,
)
from django.db.models.functions import Abs, Coalesce, TruncDate
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from catalog.models import Product, ProductPricing
from finance.models import DailyClose, Expense, Payment, ShopProfile
from finance.services import OPEN_SALE_STATUSES, customer_aging, supplier_aging
from operations.models import InternalConsumption
from operations.reports import frequent_replacements, materials_used_internally
from purchasing.costing import received_cost_totals
from purchasing.models import Purchase, PurchaseItem, PurchaseItemComponent
from sales.models import Sale, SaleItem, SaleReturn, SaleReturnItem
from stock.models import Inventory, StockMovement

ZERO = Decimal("0.00")
CENT = Decimal("0.01")
MONEY = DecimalField(max_digits=18, decimal_places=2)
RATE = DecimalField(max_digits=24, decimal_places=8)
VAT_FRACTION = Decimal("18") / Decimal("118")
ESTIMATE_LABEL = "Estimate — not a tax filing"


def money(value):
    return (value or ZERO).quantize(CENT, rounding=ROUND_HALF_UP)


def pct(part, whole):
    if not whole:
        return None
    return (Decimal(part) / Decimal(whole) * 100).quantize(CENT, rounding=ROUND_HALF_UP)


# --- periods ---------------------------------------------------------------

def parse_range(params):
    """(start, end) Kigali dates from ``from``/``to`` query params; defaults to this month."""
    today = timezone.localdate()

    def parse(name, default):
        raw = params.get(name)
        if raw in (None, ""):
            return default
        try:
            return date.fromisoformat(raw)
        except ValueError:
            raise ValidationError({name: "Use a date like 2026-10-06."})

    start = parse("from", today.replace(day=1))
    end = parse("to", today)
    if start > end:
        raise ValidationError({"from": "The start date is after the end date."})
    return start, end


def _tz():
    return timezone.get_current_timezone()


def _sales_in(start, end):
    return Sale.objects.filter(sale_date__date__gte=start, sale_date__date__lte=end)


def _returned_qty():
    return Coalesce(
        Subquery(
            SaleReturnItem.objects.filter(sale_item=OuterRef("pk"))
            .values("sale_item").annotate(total=Sum("quantity")).values("total")[:1],
            output_field=IntegerField(),
        ),
        0,
    )


def _returned_value():
    return Coalesce(
        Subquery(
            SaleReturnItem.objects.filter(sale_item=OuterRef("pk"))
            .values("sale_item").annotate(total=Sum("refund_amount")).values("total")[:1],
            output_field=MONEY,
        ),
        ZERO,
    )


def _kept_lines(sale_qs):
    """Lines of the given (non-voided) sales with kept quantity = sold - returned."""
    return (
        SaleItem.objects.filter(sale__in=sale_qs)
        .exclude(sale__status=Sale.SaleStatus.VOIDED)
        .annotate(returned_qty=_returned_qty())
        .annotate(kept_qty=F("quantity") - F("returned_qty"))
    )


# --- weighted average cost in bulk ------------------------------------------

def bulk_average_costs(product_ids=None):
    """{product_id: Decimal} weighted average paid unit cost, in a fixed number of queries.

    Same definition as ``stock.services.weighted_average_cost`` (received purchase
    units of every line kind plus person-entered opening stock), computed for many
    products at once. Merged duplicates already had their purchase lines moved
    onto the kept product, so per-product totals are right without chasing chains.
    """
    totals = received_cost_totals(product_ids)
    openings = StockMovement.objects.filter(
        movement_type=StockMovement.MovementType.OPENING, created_by__isnull=False,
        unit_cost__isnull=False, quantity_delta__gt=0,
    )
    if product_ids is not None:
        openings = openings.filter(product_id__in=list(product_ids))
    for row in openings.values("product_id").annotate(
        units=Sum("quantity_delta"),
        paid=Sum(F("quantity_delta") * F("unit_cost"), output_field=MONEY),
    ):
        entry = totals.setdefault(row["product_id"], {"units": 0, "paid": ZERO, "invoiced": ZERO})
        entry["units"] += row["units"] or 0
        entry["paid"] += row["paid"] or ZERO
    return {
        pid: (row["paid"] / row["units"]).quantize(CENT, rounding=ROUND_HALF_UP)
        for pid, row in totals.items() if row["units"]
    }


# --- H1: the money chain ------------------------------------------------------

def _cogs(kept):
    """(cogs, estimated_value, estimated_lines, unknown_lines) for kept lines.

    Lines carry the cost recorded at the sale (Module C). Older lines have none;
    they are valued at today's weighted average cost and flagged as estimated.
    A line with no cost at all (product never received) adds nothing and is
    counted as unknown.
    """
    recorded = kept.filter(cost_at_sale__isnull=False).aggregate(
        total=Sum(F("kept_qty") * F("cost_at_sale"), output_field=MONEY)
    )["total"] or ZERO
    missing = list(
        kept.filter(cost_at_sale__isnull=True, kept_qty__gt=0)
        .values("product_id").annotate(units=Sum("kept_qty"), lines=Count("sale_item_id"))
    )
    costs = bulk_average_costs([row["product_id"] for row in missing]) if missing else {}
    estimated = ZERO
    estimated_lines = unknown_lines = 0
    for row in missing:
        cost = costs.get(row["product_id"])
        if cost is None:
            unknown_lines += row["lines"]
        else:
            estimated += cost * row["units"]
            estimated_lines += row["lines"]
    return money(recorded + estimated), money(estimated), estimated_lines, unknown_lines


def chain(start, end):
    sales = _sales_in(start, end)
    lines = SaleItem.objects.filter(sale__in=sales)
    totals = lines.aggregate(
        catalog=Sum(F("list_price") * F("quantity"), output_field=MONEY),
        discount_net=Sum("discount_amount"),
        discounts=Sum(Case(When(discount_amount__gt=0, then=F("discount_amount")), default=Value(ZERO), output_field=MONEY)),
        markups=Sum(Case(When(discount_amount__lt=0, then=-F("discount_amount")), default=Value(ZERO), output_field=MONEY)),
        net_sales=Sum("subtotal"),
    )
    catalog = money(totals["catalog"])
    net_sales = money(totals["net_sales"])
    voids = money(lines.filter(sale__status=Sale.SaleStatus.VOIDED).aggregate(t=Sum("subtotal"))["t"])
    returns = money(
        SaleReturnItem.objects.filter(sale_item__sale__in=sales)
        .exclude(sale_item__sale__status=Sale.SaleStatus.VOIDED)
        .aggregate(t=Sum("refund_amount"))["t"]
    )
    kept_sales = money(net_sales - voids - returns)

    kept = _kept_lines(sales)
    output_vat = money(kept.filter(quantity__gt=0).aggregate(
        t=Sum(ExpressionWrapper(F("tax_amount") * F("kept_qty") / F("quantity"), output_field=RATE))
    )["t"])
    net_excl_vat = kept_sales - output_vat
    cogs, estimated_cogs, estimated_lines, unknown_lines = _cogs(kept)
    gross_profit = net_excl_vat - cogs
    expenses = money(Expense.objects.filter(expense_date__gte=start, expense_date__lte=end).aggregate(t=Sum("amount"))["t"])
    operating_profit = gross_profit - expenses

    discount_and_markup = -money(totals["discount_net"])  # negative = net discount given
    steps = [
        {"key": "catalog", "label": "Sales at catalog price", "amount": catalog, "kind": "total"},
        {"key": "discounts", "label": "Discounts / markups", "amount": discount_and_markup, "kind": "delta"},
        {"key": "net_sales", "label": "Net sales (VAT incl.)", "amount": net_sales, "kind": "total"},
        {"key": "returns_voids", "label": "Returns and voids", "amount": -(returns + voids), "kind": "delta"},
        {"key": "output_vat", "label": "Output VAT", "amount": -output_vat, "kind": "delta"},
        {"key": "net_excl_vat", "label": "Net sales excl. VAT", "amount": net_excl_vat, "kind": "total"},
        {"key": "cogs", "label": "Cost of goods sold", "amount": -cogs, "kind": "delta"},
        {"key": "gross_profit", "label": "Gross profit", "amount": gross_profit, "kind": "total"},
        {"key": "expenses", "label": "Expenses", "amount": -expenses, "kind": "delta"},
        {"key": "operating_profit", "label": "Operating profit", "amount": operating_profit, "kind": "total"},
    ]
    return {
        "from": start, "to": end,
        "steps": steps,
        "figures": {
            "catalog": catalog,
            "discounts": money(totals["discounts"]),
            "markups": money(totals["markups"]),
            "net_sales": net_sales,
            "returns": returns,
            "voids": voids,
            "kept_sales": kept_sales,
            "output_vat": output_vat,
            "net_excl_vat": net_excl_vat,
            "cogs": cogs,
            "gross_profit": gross_profit,
            "gross_margin_pct": pct(gross_profit, net_excl_vat),
            "expenses": expenses,
            "operating_profit": operating_profit,
        },
        "cogs_estimate": {
            "estimated_value": estimated_cogs,
            "estimated_lines": estimated_lines,
            "unknown_lines": unknown_lines,
            "note": (
                "Lines sold before costs were recorded at the till are valued at today's average cost."
                if estimated_lines else ""
            ),
        },
    }


# --- H4: VAT position ------------------------------------------------------------

def input_vat(start, end):
    """VAT inside what was invoiced on received purchases with a VAT invoice, category B only.

    Single/pack lines use the line's own snapshot; bundle lines use each component's
    snapshot and its allocated invoiced cost, so a bundle mixing exempt and
    standard goods is split correctly.
    """
    purchases = Purchase.objects.filter(
        status=Purchase.Status.RECEIVED, has_vat_invoice=True,
        purchase_date__gte=start, purchase_date__lte=end,
    )
    lines = PurchaseItem.objects.filter(
        purchase__in=purchases, tax_category=Product.TaxCategory.STANDARD,
    ).exclude(line_kind=PurchaseItem.LineKind.BUNDLE).aggregate(t=Sum("subtotal_invoiced"))["t"] or ZERO
    components = PurchaseItemComponent.objects.filter(
        purchase_item__purchase__in=purchases, tax_category=Product.TaxCategory.STANDARD,
    ).aggregate(t=Sum(F("purchase_item__quantity") * F("allocated_invoiced_cost"), output_field=MONEY))["t"] or ZERO
    return money((lines + components) * VAT_FRACTION)


def vat_position(start, end, output_vat=None):
    if output_vat is None:
        output_vat = chain(start, end)["figures"]["output_vat"]
    incoming = input_vat(start, end)
    return {
        "output_vat": output_vat,
        "input_vat": incoming,
        "net_vat": output_vat - incoming,
        "label": ESTIMATE_LABEL,
    }


# --- leakage beside the chain ---------------------------------------------------

def damaged_writeoffs(start, end, product_ids=None):
    """Units that went into the damaged bucket (moved there, or came back damaged on a
    return) in the period, valued at the cost recorded on the movement."""
    moves = StockMovement.objects.filter(
        created_at__date__gte=start, created_at__date__lte=end,
        bucket=StockMovement.Bucket.DAMAGED, quantity_delta__gt=0,
        movement_type__in=[StockMovement.MovementType.TO_DAMAGED, StockMovement.MovementType.SALE_RETURN],
    )
    if product_ids is not None:
        moves = moves.filter(product_id__in=list(product_ids))
    totals = moves.aggregate(
        units=Sum("quantity_delta"),
        value=Sum(F("quantity_delta") * F("unit_cost"), output_field=MONEY),
        unknown=Count("movement_id", filter=Q(unit_cost__isnull=True)),
    )
    return {"units": totals["units"] or 0, "value": money(totals["value"]), "unknown_cost_moves": totals["unknown"]}


def supplier_billing_differences(start, end):
    purchases = Purchase.objects.filter(
        status=Purchase.Status.RECEIVED, purchase_date__gte=start, purchase_date__lte=end,
    )
    totals = purchases.aggregate(
        paid=Sum("total_paid"), invoiced=Sum("total_invoiced"),
        absolute=Sum(Abs(F("total_invoiced") - F("total_paid")), output_field=MONEY),
    )
    paid = money(totals["paid"])
    invoiced = money(totals["invoiced"])
    return {
        "purchases_paid": paid,
        "purchases_invoiced": invoiced,
        "difference": invoiced - paid,
        "absolute_difference": money(totals["absolute"]),
        "difference_pct": pct(money(totals["absolute"]), paid),
    }


def new_credit_given(start, end):
    """What is still owed on the period's (non-voided) sales — same rule as the Z-report."""
    balance = ExpressionWrapper(F("total_amount") - F("returned_amount") - F("amount_paid"), output_field=MONEY)
    return money(
        _sales_in(start, end).filter(status__in=OPEN_SALE_STATUSES)
        .annotate(balance=balance).filter(balance__gt=0)
        .aggregate(t=Sum("balance"))["t"]
    )


def debt_collected(start, end):
    """Customer money received in the period on sales made on an earlier day."""
    return money(
        Payment.objects.filter(
            direction=Payment.Direction.IN, sale__isnull=False, reversal_of__isnull=True,
            reversal__isnull=True, paid_at__date__gte=start, paid_at__date__lte=end,
        )
        .annotate(paid_day=TruncDate("paid_at", tzinfo=_tz()), sale_day=TruncDate("sale__sale_date", tzinfo=_tz()))
        .filter(paid_day__gt=F("sale_day"))
        .aggregate(t=Sum("amount"))["t"]
    )


def leakage(start, end):
    materials = materials_used_internally(start, end)
    damaged = damaged_writeoffs(start, end)
    billing = supplier_billing_differences(start, end)
    aging = customer_aging(as_of=end)
    owed = supplier_aging(as_of=end)
    discounts = SaleItem.objects.filter(sale__in=_sales_in(start, end)).exclude(
        sale__status=Sale.SaleStatus.VOIDED
    ).aggregate(t=Sum(Case(When(discount_amount__gt=0, then=F("discount_amount")), default=Value(ZERO), output_field=MONEY)))["t"]
    return {
        "from": start, "to": end,
        "cards": [
            {"key": "discounts", "label": "Discounts given at the till", "value": money(discounts),
             "link": f"/sales?has_discount=true&from={start}&to={end}"},
            {"key": "materials", "label": "Materials used internally", "value": materials["total_value"],
             "detail": materials, "link": "/shop-use"},
            {"key": "damaged", "label": "Damaged write-offs", "value": damaged["value"], "detail": damaged,
             "link": f"/stock/movements?type=to_damaged&from={start}&to={end}"},
            {"key": "billing", "label": "Supplier billing differences (invoiced − paid)",
             "value": billing["difference"], "detail": billing, "link": "/purchases"},
            {"key": "new_credit", "label": "New credit given", "value": new_credit_given(start, end),
             "link": "/debts"},
            {"key": "debt_collected", "label": "Debt collected", "value": debt_collected(start, end),
             "link": "/debts"},
            {"key": "debt_outstanding", "label": "Customer debt outstanding", "value": money(aging["total"]),
             "detail": {"buckets": aging["totals"]}, "link": "/debts"},
            {"key": "owed_to_suppliers", "label": "Owed to suppliers", "value": money(owed["total"]),
             "detail": {"buckets": owed["totals"]}, "link": "/debts"},
        ],
    }


# --- summary ----------------------------------------------------------------------

def stock_value(product_ids=None):
    rows = Inventory.objects.filter(quantity_in_stock__gt=0)
    if product_ids is not None:
        rows = rows.filter(product_id__in=list(product_ids))
    rows = list(rows.values_list("product_id", "quantity_in_stock"))
    costs = bulk_average_costs([pid for pid, _ in rows]) if rows else {}
    value = sum((costs[pid] * qty for pid, qty in rows if pid in costs), ZERO)
    return {"value": money(value), "products_without_cost": sum(1 for pid, _ in rows if pid not in costs)}


def summary(start, end):
    result = chain(start, end)
    figures = result["figures"]
    sales = _sales_in(start, end).exclude(status=Sale.SaleStatus.VOIDED)
    count = sales.count()
    return {
        "from": start, "to": end,
        "sales_count": count,
        "net_sales": figures["net_sales"],
        "kept_sales": figures["kept_sales"],
        "average_sale": money(figures["kept_sales"] / count) if count else ZERO,
        "gross_profit": figures["gross_profit"],
        "gross_margin_pct": figures["gross_margin_pct"],
        "expenses": figures["expenses"],
        "operating_profit": figures["operating_profit"],
        "customer_debt": money(customer_aging(as_of=end)["total"]),
        "owed_to_suppliers": money(supplier_aging(as_of=end)["total"]),
        "stock_value": stock_value()["value"],
        "vat": vat_position(start, end, output_vat=figures["output_vat"]),
    }


# --- H2: product drill-down ---------------------------------------------------------

def product_drilldown(product, start, end):
    from catalog.merge import merged_product_ids

    ids = merged_product_ids(product.pk)
    received = received_cost_totals(ids).values()
    units_bought = sum(r["units"] for r in received)
    paid = sum((r["paid"] for r in received), ZERO)
    invoiced = sum((r["invoiced"] for r in received), ZERO)
    avg_paid = money(paid / units_bought) if units_bought else None
    avg_invoiced = money(invoiced / units_bought) if units_bought else None
    average_cost = bulk_average_costs(ids)
    avg_cost = average_cost.get(product.pk)
    if avg_cost is None and len(ids) > 1:
        from stock.services import weighted_average_cost
        avg_cost = weighted_average_cost(product)

    sales = _sales_in(start, end)
    kept = _kept_lines(sales).filter(product_id__in=ids)
    sold = kept.aggregate(
        units=Sum("kept_qty"),
        revenue=Sum(ExpressionWrapper(F("subtotal") * F("kept_qty") / F("quantity"), output_field=RATE)),
        vat=Sum(ExpressionWrapper(F("tax_amount") * F("kept_qty") / F("quantity"), output_field=RATE)),
        catalog=Sum(F("list_price") * F("kept_qty"), output_field=MONEY),
    )
    units_sold = sold["units"] or 0
    revenue = money(sold["revenue"])
    vat = money(sold["vat"])
    cogs, _, estimated_lines, _ = _cogs(kept)
    pricing = ProductPricing.objects.filter(product=product, is_current=True).first()
    catalog_price = pricing.retail_price if pricing else None

    consumed = InternalConsumption.objects.filter(
        product_id__in=ids, created_at__date__gte=start, created_at__date__lte=end,
    ).aggregate(units=Sum("quantity"), value=Sum("total_value"))
    damaged = damaged_writeoffs(start, end, product_ids=ids)
    inventory = Inventory.objects.filter(product=product).first()
    in_stock = inventory.quantity_in_stock if inventory else 0

    net_revenue = revenue - vat
    return {
        "product_id": product.pk, "name": product.name, "from": start, "to": end,
        "units_bought": units_bought,
        "avg_cost_paid": avg_paid,
        "avg_cost_invoiced": avg_invoiced,
        "catalog_price": catalog_price,
        "avg_sold_price": money(revenue / units_sold) if units_sold else None,
        "vat_per_unit": money(vat / units_sold) if units_sold else None,
        "units_sold": units_sold,
        "revenue": revenue,
        "revenue_excl_vat": net_revenue,
        "cogs": cogs,
        "cogs_estimated_lines": estimated_lines,
        "actual_margin": net_revenue - cogs if units_sold else None,
        "actual_margin_pct": pct(net_revenue - cogs, net_revenue) if units_sold else None,
        "projected_margin_per_unit": (catalog_price - avg_invoiced) if catalog_price is not None and avg_invoiced is not None else None,
        "units_consumed_internally": consumed["units"] or 0,
        "value_consumed_internally": money(consumed["value"]),
        "units_damaged": damaged["units"],
        "value_damaged": damaged["value"],
        "in_stock": in_stock,
        "average_cost": avg_cost,
        "stock_value": money(avg_cost * in_stock) if avg_cost is not None else None,
    }


# --- H3: people ----------------------------------------------------------------------

def _below_floor_q():
    """A line sold under its floor: the product's minimum price if set, else its cost then."""
    return Q(product__min_price__isnull=False, unit_price__lt=F("product__min_price")) | Q(
        product__min_price__isnull=True, cost_at_sale__isnull=False, unit_price__lt=F("cost_at_sale"),
    )


def people(start, end):
    sales = _sales_in(start, end)
    kept_sales = sales.exclude(status=Sale.SaleStatus.VOIDED)
    rows = {}

    def row(employee_id, name):
        return rows.setdefault(employee_id, {
            "employee_id": employee_id, "name": name,
            "sales_count": 0, "sales_value": ZERO, "catalog_value": ZERO, "discounts": ZERO,
            "avg_discount_pct": None, "approvals_received": 0, "below_floor_approvals": 0,
            "voids": 0, "returns_count": 0, "returns_value": ZERO,
            "closes": 0, "variance_total": ZERO, "variance_abs_total": ZERO, "worst_variance": None,
        })

    for r in kept_sales.values("employee_id", "employee__full_name").annotate(
        count=Count("sale_id"),
        value=Sum(F("total_amount") - F("returned_amount"), output_field=MONEY),
    ):
        entry = row(r["employee_id"], r["employee__full_name"])
        entry["sales_count"] = r["count"]
        entry["sales_value"] = money(r["value"])

    line_stats = SaleItem.objects.filter(sale__in=kept_sales).values(
        "sale__employee_id", "sale__employee__full_name",
    ).annotate(
        catalog=Sum(F("list_price") * F("quantity"), output_field=MONEY),
        discounts=Sum(Case(When(discount_amount__gt=0, then=F("discount_amount")), default=Value(ZERO), output_field=MONEY)),
        approvals=Count("sale_item_id", filter=Q(approved_by__isnull=False)),
        below_floor=Count("sale_item_id", filter=Q(approved_by__isnull=False) & _below_floor_q()),
    )
    for r in line_stats:
        entry = row(r["sale__employee_id"], r["sale__employee__full_name"])
        entry["catalog_value"] = money(r["catalog"])
        entry["discounts"] = money(r["discounts"])
        entry["avg_discount_pct"] = pct(entry["discounts"], entry["catalog_value"])
        entry["approvals_received"] = r["approvals"]
        entry["below_floor_approvals"] = r["below_floor"]

    for r in sales.filter(status=Sale.SaleStatus.VOIDED).values("employee_id", "employee__full_name").annotate(n=Count("sale_id")):
        row(r["employee_id"], r["employee__full_name"])["voids"] = r["n"]

    for r in SaleReturn.objects.filter(created_at__date__gte=start, created_at__date__lte=end).values(
        "sale__employee_id", "sale__employee__full_name",
    ).annotate(n=Count("return_id"), value=Sum("refund_total")):
        entry = row(r["sale__employee_id"], r["sale__employee__full_name"])
        entry["returns_count"] = r["n"]
        entry["returns_value"] = money(r["value"])

    for r in DailyClose.objects.filter(business_date__gte=start, business_date__lte=end).values(
        "cashier_id", "cashier__full_name",
    ).annotate(
        n=Count("close_id"), total=Sum("variance"), absolute=Sum(Abs("variance"), output_field=MONEY),
    ):
        entry = row(r["cashier_id"], r["cashier__full_name"])
        entry["closes"] = r["n"]
        entry["variance_total"] = money(r["total"])
        entry["variance_abs_total"] = money(r["absolute"])
    for close in DailyClose.objects.filter(business_date__gte=start, business_date__lte=end).order_by("cashier_id"):
        entry = rows[close.cashier_id]
        if entry["worst_variance"] is None or abs(close.variance) > abs(entry["worst_variance"]):
            entry["worst_variance"] = close.variance

    approvers = [
        {
            "employee_id": r["approved_by_id"], "name": r["approved_by__full_name"],
            "approvals_given": r["lines"], "sales": r["sales"], "below_floor": r["below_floor"],
            "discount_approved": money(r["discount"]),
        }
        for r in SaleItem.objects.filter(sale__in=kept_sales, approved_by__isnull=False)
        .values("approved_by_id", "approved_by__full_name")
        .annotate(
            lines=Count("sale_item_id"), sales=Count("sale_id", distinct=True),
            below_floor=Count("sale_item_id", filter=_below_floor_q()),
            discount=Sum(Case(When(discount_amount__gt=0, then=F("discount_amount")), default=Value(ZERO), output_field=MONEY)),
        )
        .order_by("-lines")
    ]
    cashiers = sorted(rows.values(), key=lambda r: (-r["sales_value"], r["name"] or ""))
    return {"from": start, "to": end, "cashiers": cashiers, "approvers": approvers}


# --- H5: alerts ----------------------------------------------------------------------

def _discount_pct_by_cashier(start, end):
    stats = SaleItem.objects.filter(
        sale__sale_date__date__gte=start, sale__sale_date__date__lte=end,
    ).exclude(sale__status=Sale.SaleStatus.VOIDED).values("sale__employee_id", "sale__employee__full_name").annotate(
        catalog=Sum(F("list_price") * F("quantity"), output_field=MONEY),
        discounts=Sum(Case(When(discount_amount__gt=0, then=F("discount_amount")), default=Value(ZERO), output_field=MONEY)),
    )
    return {
        r["sale__employee_id"]: (r["sale__employee__full_name"], pct(r["discounts"] or ZERO, r["catalog"]))
        for r in stats
    }


def alerts(as_of=None, profile=None):
    as_of = as_of or timezone.localdate()
    profile = profile or ShopProfile.objects.filter(pk=1).first() or ShopProfile(business_name="")
    found = []

    # 1. A cashier's discounting jumps: this week's average discount % vs their previous 8 weeks.
    week_start = as_of - timedelta(days=6)
    this_week = _discount_pct_by_cashier(week_start, as_of)
    baseline = _discount_pct_by_cashier(week_start - timedelta(days=56), week_start - timedelta(days=1))
    for employee_id, (name, week_pct) in this_week.items():
        base_pct = baseline.get(employee_id, (name, None))[1]
        if week_pct and base_pct and week_pct > base_pct * profile.alert_discount_spike_ratio:
            found.append({
                "code": "discount_spike", "severity": "warning",
                "message": f"{name} gave {week_pct}% off on average this week — more than "
                           f"{profile.alert_discount_spike_ratio}× their usual {base_pct}%.",
                "link": f"/sales?cashier={employee_id}&has_discount=true&from={week_start}&to={as_of}",
            })

    # 2. Customer debt long overdue.
    cutoff = as_of - timedelta(days=profile.alert_overdue_days)
    due_day = Coalesce("due_date", TruncDate("sale_date", tzinfo=_tz()))
    overdue = (
        Sale.objects.filter(status__in=OPEN_SALE_STATUSES)
        .annotate(due_day=due_day, balance=ExpressionWrapper(
            F("total_amount") - F("returned_amount") - F("amount_paid"), output_field=MONEY))
        .filter(balance__gt=0, due_day__lt=cutoff)
        .aggregate(total=Sum("balance"), customers=Count("customer_id", distinct=True))
    )
    if overdue["total"]:
        found.append({
            "code": "debt_overdue", "severity": "danger",
            "message": f"{money(overdue['total'])} RWF of customer debt is more than {profile.alert_overdue_days} "
                       f"days overdue ({overdue['customers']} customer{'s' if overdue['customers'] != 1 else ''}).",
            "link": "/debts",
        })

    # 3. A day closed with a cash variance beyond the threshold (last 7 days).
    for close in DailyClose.objects.filter(
        business_date__gte=as_of - timedelta(days=6), business_date__lte=as_of,
    ).filter(Q(variance__gt=profile.alert_cash_variance) | Q(variance__lt=-profile.alert_cash_variance)).select_related("cashier"):
        found.append({
            "code": "cash_variance", "severity": "danger",
            "message": f"{close.cashier.full_name}'s drawer on {close.business_date} was "
                       f"{'over' if close.variance > 0 else 'short'} by {money(abs(close.variance))} RWF.",
            "link": "/close-day",
        })

    # 4. A product repeatedly sold below cost.
    since = as_of - timedelta(days=profile.alert_below_cost_days - 1)
    for r in SaleItem.objects.filter(
        sale__sale_date__date__gte=since, sale__sale_date__date__lte=as_of,
        cost_at_sale__isnull=False, unit_price__lt=F("cost_at_sale"),
    ).exclude(sale__status=Sale.SaleStatus.VOIDED).values("product_id", "product__name").annotate(
        n=Count("sale_item_id")
    ).filter(n__gt=profile.alert_below_cost_count):
        found.append({
            "code": "below_cost", "severity": "warning",
            "message": f"{r['product__name']} was sold below cost {r['n']} times in the last "
                       f"{profile.alert_below_cost_days} days.",
            "link": f"/products/{r['product_id']}",
        })

    # 5. Shop equipment that keeps failing.
    for r in frequent_replacements(
        threshold=profile.alert_asset_replacements, days=profile.alert_asset_window_days, as_of=as_of,
    ):
        found.append({
            "code": "asset_replacements", "severity": "warning",
            "message": f"{r['name']} has been replaced {r['replacements']} times in "
                       f"{profile.alert_asset_window_days} days.",
            "link": f"/shop-use/assets/{r['root_asset_id']}",
        })

    # 6. Supplier billing differences this month.
    month_start = as_of.replace(day=1)
    billing = supplier_billing_differences(month_start, as_of)
    if billing["difference_pct"] is not None and billing["difference_pct"] > profile.alert_billing_diff_pct:
        found.append({
            "code": "billing_differences", "severity": "warning",
            "message": f"Supplier invoices differ from what was paid by {billing['difference_pct']}% this month "
                       f"({billing['absolute_difference']} RWF).",
            "link": "/purchases",
        })

    # 7. Low stock on a top seller (top N by units over the last 30 days).
    top = (
        SaleItem.objects.filter(
            sale__sale_date__date__gte=as_of - timedelta(days=29), sale__sale_date__date__lte=as_of,
        ).exclude(sale__status=Sale.SaleStatus.VOIDED)
        .values("product_id").annotate(units=Sum("quantity")).order_by("-units")[: profile.alert_top_sellers]
    )
    top_ids = [r["product_id"] for r in top]
    for inv in Inventory.objects.filter(
        product_id__in=top_ids, quantity_in_stock__lte=F("product__reorder_level"),
    ).select_related("product"):
        found.append({
            "code": "low_stock_top_seller", "severity": "warning",
            "message": f"{inv.product.name} is a top seller and has only {inv.quantity_in_stock} left "
                       f"(reorder at {inv.product.reorder_level}).",
            "link": f"/products/{inv.product_id}",
        })

    order = {"danger": 0, "warning": 1}
    found.sort(key=lambda a: order[a["severity"]])
    return {"as_of": as_of, "alerts": found}
