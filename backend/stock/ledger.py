"""Consistency check between the stock ledger and the cached Inventory balances."""
from django.db.models import Sum

from stock.models import Inventory, StockMovement
from stock.services import BUCKET_FIELDS


def ledger_mismatches():
    """Every (product, bucket) where the sum of movements differs from Inventory.

    Returns a list of dicts sorted by product then bucket; empty when consistent.
    """
    sums = {
        (row["product_id"], row["bucket"]): row["total"]
        for row in StockMovement.objects.values("product_id", "bucket").annotate(total=Sum("quantity_delta"))
    }
    mismatches = []
    seen = set()
    for inventory in Inventory.objects.select_related("product").order_by("product_id"):
        for bucket, field in BUCKET_FIELDS.items():
            key = (inventory.product_id, bucket.value)
            seen.add(key)
            ledger = sums.get(key) or 0
            actual = getattr(inventory, field)
            if ledger != actual:
                mismatches.append({
                    "product_id": inventory.product_id, "product_name": inventory.product.name,
                    "bucket": bucket.value, "ledger": ledger, "inventory": actual,
                })
    # Movements for a product that has no Inventory row at all.
    for (product_id, bucket), total in sorted(sums.items()):
        if (product_id, bucket) not in seen and total:
            mismatches.append({
                "product_id": product_id, "product_name": None,
                "bucket": bucket, "ledger": total, "inventory": 0,
            })
    return mismatches
