"""Aggregates over shop use, for the dashboards (Module H).

Every function takes Africa/Kigali calendar dates (inclusive) and aggregates in
SQL. Values are what was recorded at the time (weighted average paid cost);
rows with an unknown cost add nothing to a value but still count.
Nothing here is an expense or cost of goods sold — Module H shows it beside
the money chain as "Materials used internally".
"""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from operations.models import InternalConsumption, ShopAsset, ShopAssetEvent
from stock.models import StockMovement

ZERO = Decimal("0.00")


def _consumptions(start, end):
    return InternalConsumption.objects.filter(created_at__date__gte=start, created_at__date__lte=end)


def consumption_total(start, end):
    """{count, quantity, value, unknown_cost_count} for consumptions in the period."""
    qs = _consumptions(start, end)
    totals = qs.aggregate(count=Count("consumption_id"), quantity=Sum("quantity"), value=Sum("total_value"))
    return {
        "count": totals["count"],
        "quantity": totals["quantity"] or 0,
        "value": totals["value"] or ZERO,
        "unknown_cost_count": qs.filter(total_value__isnull=True).count(),
    }


def consumption_by_purpose(start, end):
    """[{purpose, count, quantity, value}], largest value first."""
    rows = (
        _consumptions(start, end).values("purpose")
        .annotate(count=Count("consumption_id"), quantity=Sum("quantity"), value=Sum("total_value"))
        .order_by("-value", "purpose")
    )
    return [{**row, "value": row["value"] or ZERO} for row in rows]


def consumption_by_month(start, end):
    """[{month: "YYYY-MM", purpose, count, quantity, value}] in Kigali months."""
    rows = (
        _consumptions(start, end)
        .annotate(month=TruncMonth("created_at", tzinfo=timezone.get_current_timezone()))
        .values("month", "purpose")
        .annotate(count=Count("consumption_id"), quantity=Sum("quantity"), value=Sum("total_value"))
        .order_by("month", "purpose")
    )
    return [{**row, "month": row["month"].strftime("%Y-%m"), "value": row["value"] or ZERO} for row in rows]


def consumption_by_employee(start, end):
    """[{employee_id, employee_name, count, quantity, value}] by who physically took it."""
    rows = (
        _consumptions(start, end).values("taken_by_id", "taken_by__full_name")
        .annotate(count=Count("consumption_id"), quantity=Sum("quantity"), value=Sum("total_value"))
        .order_by("-value", "taken_by__full_name")
    )
    return [
        {
            "employee_id": row["taken_by_id"], "employee_name": row["taken_by__full_name"],
            "count": row["count"], "quantity": row["quantity"], "value": row["value"] or ZERO,
        }
        for row in rows
    ]


def materials_used_internally(start, end):
    """{consumed_value, taken_as_assets_value, total_value} — stock the shop kept for itself.

    Assets taken from stock are counted from their ledger movements (net of any
    returned to stock in the same period), at the cost recorded then.
    """
    consumed = consumption_total(start, end)["value"]
    asset_moves = StockMovement.objects.filter(
        created_at__date__gte=start, created_at__date__lte=end,
        movement_type__in=[StockMovement.MovementType.TO_SHOP_ASSET, StockMovement.MovementType.FROM_SHOP_ASSET],
        unit_cost__isnull=False,
    ).values_list("quantity_delta", "unit_cost")
    taken = sum((-delta * cost for delta, cost in asset_moves), ZERO)
    taken = taken.quantize(Decimal("0.01"))
    return {"consumed_value": consumed, "taken_as_assets_value": taken, "total_value": consumed + taken}


def assets_damaged(start, end):
    """{count, value}: assets that went damaged in the period (each asset once)."""
    asset_ids = set(
        ShopAssetEvent.objects.filter(
            created_at__date__gte=start, created_at__date__lte=end, to_status=ShopAsset.Status.DAMAGED,
        ).values_list("asset_id", flat=True)
    )
    value = ShopAsset.objects.filter(pk__in=asset_ids).aggregate(total=Sum("acquisition_value"))["total"]
    return {"count": len(asset_ids), "value": value or ZERO}


def replacements_per_asset(days=90, as_of=None):
    """[{asset_id, name, replacements}] for assets replaced in the last ``days`` days."""
    as_of = as_of or timezone.localdate()
    since = as_of - timedelta(days=days)
    rows = (
        ShopAssetEvent.objects.filter(
            replaced_by__isnull=False, created_at__date__gt=since, created_at__date__lte=as_of,
        ).values("asset_id", "asset__name").annotate(replacements=Count("event_id")).order_by("-replacements")
    )
    return [{"asset_id": r["asset_id"], "name": r["asset__name"], "replacements": r["replacements"]} for r in rows]


def frequent_replacements(threshold=2, days=90, as_of=None):
    """Equipment that keeps failing: [{root_asset_id, name, replacements}] where a chain of
    replacements (printer → its replacement → its replacement …) was replaced more than
    ``threshold`` times in the window. Feeds the "asset replaced > 2 times in 90 days" alert.
    """
    per_asset = replacements_per_asset(days=days, as_of=as_of)
    if not per_asset:
        return []
    parents = dict(ShopAsset.objects.filter(replaces__isnull=False).values_list("asset_id", "replaces_id"))
    chains = {}
    for row in per_asset:
        root = row["asset_id"]
        seen = {root}
        while root in parents and parents[root] not in seen:
            root = parents[root]
            seen.add(root)
        chains[root] = chains.get(root, 0) + row["replacements"]
    names = dict(ShopAsset.objects.filter(pk__in=chains).values_list("asset_id", "name"))
    return sorted(
        (
            {"root_asset_id": root, "name": names.get(root), "replacements": count}
            for root, count in chains.items() if count > threshold
        ),
        key=lambda r: -r["replacements"],
    )
