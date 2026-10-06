"""Per-unit cost figures from received purchases, whatever the line kind (Module F).

A single or pack line brings ``quantity x units_per_pack`` units at its subtotals;
a bundle line brings ``bundles x qty_per_bundle`` units of each component at
``bundles x`` the component's allocated per-bundle cost. Everything that averages
purchase costs (weighted average cost, dashboard profitability) goes through here
so packs and bundles never distort a per-unit figure.
"""
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import DecimalField, F, IntegerField, Sum

from purchasing.models import Purchase, PurchaseItem, PurchaseItemComponent

MONEY = DecimalField(max_digits=18, decimal_places=2)
CENT = Decimal("0.01")


def received_cost_totals(product_ids=None):
    """{product_id: {"units": int, "paid": Decimal, "invoiced": Decimal}} over received purchases.

    ``product_ids`` (iterable) narrows the products; None means every product.
    """
    lines = PurchaseItem.objects.filter(purchase__status=Purchase.Status.RECEIVED, product__isnull=False)
    components = PurchaseItemComponent.objects.filter(purchase_item__purchase__status=Purchase.Status.RECEIVED)
    if product_ids is not None:
        product_ids = list(product_ids)
        lines = lines.filter(product_id__in=product_ids)
        components = components.filter(product_id__in=product_ids)

    totals = {}

    def add(product_id, units, paid, invoiced):
        row = totals.setdefault(product_id, {"units": 0, "paid": Decimal("0.00"), "invoiced": Decimal("0.00")})
        row["units"] += int(units or 0)
        row["paid"] += paid or Decimal("0.00")
        row["invoiced"] += invoiced or Decimal("0.00")

    for row in lines.values("product_id").annotate(
        units=Sum(F("quantity") * F("units_per_pack"), output_field=IntegerField()),
        paid=Sum("subtotal_paid"), invoiced=Sum("subtotal_invoiced"),
    ):
        add(row["product_id"], row["units"], row["paid"], row["invoiced"])

    for row in components.values("product_id").annotate(
        units=Sum(F("purchase_item__quantity") * F("qty_per_bundle"), output_field=IntegerField()),
        paid=Sum(F("purchase_item__quantity") * F("allocated_paid_cost"), output_field=MONEY),
        invoiced=Sum(F("purchase_item__quantity") * F("allocated_invoiced_cost"), output_field=MONEY),
    ):
        add(row["product_id"], row["units"], row["paid"], row["invoiced"])

    return totals


def line_unit_costs(item):
    """(per-unit paid, per-unit invoiced) for a single or pack line, to the cent."""
    per = Decimal(item.units_per_pack or 1)
    return (
        (item.unit_cost_paid / per).quantize(CENT, rounding=ROUND_HALF_UP),
        (item.unit_cost_invoiced / per).quantize(CENT, rounding=ROUND_HALF_UP),
    )


def component_unit_costs(component):
    """(per-unit paid, per-unit invoiced) for one bundle component, to the cent."""
    per = Decimal(component.qty_per_bundle)
    return (
        (component.allocated_paid_cost / per).quantize(CENT, rounding=ROUND_HALF_UP),
        (component.allocated_invoiced_cost / per).quantize(CENT, rounding=ROUND_HALF_UP),
    )


def last_paid_unit_costs(product_ids):
    """{product_id: per-unit paid cost on the latest received purchase} — a single
    or pack line, or a bundle component, whichever was bought most recently."""
    product_ids = list(product_ids)
    latest = {}

    def consider(product_id, key, cost):
        if product_id not in latest or key > latest[product_id][0]:
            latest[product_id] = (key, cost)

    lines = (
        PurchaseItem.objects.filter(
            product_id__in=product_ids, purchase__status=Purchase.Status.RECEIVED
        )
        .order_by("product_id", "-purchase__purchase_date", "-purchase_item_id")
        .distinct("product_id")
        .values_list("product_id", "purchase__purchase_date", "purchase_item_id", "unit_cost_paid", "units_per_pack")
    )
    for product_id, purchase_date, item_id, paid, per_pack in lines:
        consider(product_id, (purchase_date, item_id),
                 (paid / Decimal(per_pack or 1)).quantize(CENT, rounding=ROUND_HALF_UP))

    components = (
        PurchaseItemComponent.objects.filter(
            product_id__in=product_ids, purchase_item__purchase__status=Purchase.Status.RECEIVED
        )
        .order_by("product_id", "-purchase_item__purchase__purchase_date", "-purchase_item_id")
        .distinct("product_id")
        .values_list(
            "product_id", "purchase_item__purchase__purchase_date", "purchase_item_id",
            "allocated_paid_cost", "qty_per_bundle",
        )
    )
    for product_id, purchase_date, item_id, paid, qty in components:
        consider(product_id, (purchase_date, item_id),
                 (paid / Decimal(qty)).quantize(CENT, rounding=ROUND_HALF_UP))

    return {product_id: cost for product_id, (_key, cost) in latest.items()}
