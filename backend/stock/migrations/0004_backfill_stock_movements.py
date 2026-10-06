from decimal import ROUND_HALF_UP, Decimal

from django.db import migrations
from django.db.models import Sum

BUCKETS = [
    ("in_stock", "quantity_in_stock"),
    ("in_use", "quantity_in_use"),
    ("damaged", "quantity_damaged"),
]


def backfill_opening_movements(apps, schema_editor):
    """Start the ledger from today's balances: one `opening` row per non-zero bucket.

    History before the ledger is not reconstructed. Re-runnable — an Inventory
    whose product already has movements is skipped.
    """
    Inventory = apps.get_model("stock", "Inventory")
    StockMovement = apps.get_model("stock", "StockMovement")
    PurchaseItem = apps.get_model("purchasing", "PurchaseItem")

    for inventory in Inventory.objects.order_by("inventory_id"):
        if StockMovement.objects.filter(product_id=inventory.product_id).exists():
            continue
        totals = PurchaseItem.objects.filter(
            product_id=inventory.product_id, purchase__status="received"
        ).aggregate(units=Sum("quantity"), paid=Sum("subtotal_paid"))
        unit_cost = (
            (totals["paid"] / totals["units"]).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if totals["units"] else None
        )
        for bucket, field in BUCKETS:
            balance = getattr(inventory, field)
            if balance:
                StockMovement.objects.create(
                    product_id=inventory.product_id, movement_type="opening", bucket=bucket,
                    quantity_delta=balance, balance_after=balance, unit_cost=unit_cost,
                    source_type="", source_id=None, reason="Ledger start", created_by=None,
                )


class Migration(migrations.Migration):

    dependencies = [
        ("stock", "0003_stockmovement"),
        ("purchasing", "0004_alter_purchase_status"),
    ]

    operations = [
        migrations.RunPython(backfill_opening_movements, migrations.RunPython.noop),
    ]
