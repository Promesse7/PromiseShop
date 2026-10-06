"""Product merges (release Module E4).

merge_products(keep, duplicate, user, reason) folds a duplicate into the product
kept, in one transaction, by running MERGE_STEPS in order. Each step is a
``(name, function(keep, duplicate, context) -> count)`` pair; its count lands in
the ProductMerge log under ``name``. Later modules extend the list (e.g. Module D
appends a step that moves shop assets) instead of editing merge_products.

The stock ledger is append-only, so the duplicate's existing StockMovement and
InventoryAdjustment rows stay on it as history. Its stock is transferred with
paired merge_out (duplicate) / merge_in (keep) movements, so both products'
ledgers still add up. Reports on ``keep`` follow ProductMerge rows through
merged_product_ids().
"""
from django.db import connection, transaction
from rest_framework.exceptions import ValidationError

DUPLICATE_SCORE = 0.6
MAX_PAIRS = 100


def merged_product_ids(product_id):
    """``product_id`` plus every product merged into it, directly or through a chain."""
    from catalog.models import ProductMerge

    ids = {product_id}
    frontier = {product_id}
    while frontier:
        found = set(
            ProductMerge.objects.filter(keep_id__in=frontier).values_list("duplicate_id", flat=True)
        ) - ids
        ids |= found
        frontier = found
    return ids


# --- steps -------------------------------------------------------------------

def _move_sale_items(keep, duplicate, context):
    from sales.models import SaleItem
    return SaleItem.objects.filter(product=duplicate).update(product=keep)


def _move_purchase_items(keep, duplicate, context):
    from purchasing.models import PurchaseItem
    return PurchaseItem.objects.filter(product=duplicate).update(product=keep)


def _move_bundle_components(keep, duplicate, context):
    """Module F: bundle components (purchases) and bundle template components.

    A bundle or template can hold each product once, so where it already holds the
    kept product the duplicate's row is folded into it (quantities and allocated
    costs added) instead of moved.
    """
    from purchasing.models import BundleTemplateComponent, PurchaseItemComponent

    moved = 0
    for component in PurchaseItemComponent.objects.filter(product=duplicate):
        twin = PurchaseItemComponent.objects.filter(purchase_item_id=component.purchase_item_id, product=keep).first()
        if twin is None:
            component.product = keep
            component.save(update_fields=["product"])
        else:
            twin.qty_per_bundle += component.qty_per_bundle
            twin.allocated_paid_cost += component.allocated_paid_cost
            twin.allocated_invoiced_cost += component.allocated_invoiced_cost
            twin.save(update_fields=["qty_per_bundle", "allocated_paid_cost", "allocated_invoiced_cost"])
            component.delete()
        moved += 1
    for component in BundleTemplateComponent.objects.filter(product=duplicate):
        twin = BundleTemplateComponent.objects.filter(template_id=component.template_id, product=keep).first()
        if twin is None:
            component.product = keep
            component.save(update_fields=["product"])
        else:
            twin.qty_per_bundle += component.qty_per_bundle
            twin.save(update_fields=["qty_per_bundle"])
            component.delete()
        moved += 1
    return moved


def _move_equipment_units(keep, duplicate, context):
    from stock.models import EquipmentUnit
    return EquipmentUnit.objects.filter(product=duplicate).update(product=keep)


def _move_price_history(keep, duplicate, context):
    # The kept product's current price stays current; the duplicate's prices
    # become history rows (one-current-price constraint).
    from catalog.models import ProductPricing
    return ProductPricing.objects.filter(product=duplicate).update(product=keep, is_current=False)


def _move_barcode_aliases(keep, duplicate, context):
    from catalog.models import ProductBarcodeAlias
    moved = ProductBarcodeAlias.objects.filter(product=duplicate).update(product=keep)
    ProductBarcodeAlias.objects.create(barcode=duplicate.barcode, product=keep)
    return moved + 1


def _transfer_stock(keep, duplicate, context):
    """merge_out from the duplicate / merge_in to keep, per non-empty bucket."""
    from stock.models import Inventory, StockMovement
    from stock.services import BUCKET_FIELDS, record_movement

    source = ("product_merge", context["merge"].merge_id)
    reason = f"Merged {duplicate.barcode} into {keep.barcode}: {context['reason']}"
    Inventory.objects.get_or_create(product=keep)
    Inventory.objects.get_or_create(product=duplicate)
    locked = {
        inv.product_id: inv
        for inv in Inventory.objects.select_for_update().filter(product__in=[keep, duplicate]).order_by("pk")
    }
    keep_inv, dup_inv = locked[keep.pk], locked[duplicate.pk]
    moved = 0
    for bucket, field in BUCKET_FIELDS.items():
        quantity = getattr(dup_inv, field)
        context["counts"][bucket.value] = quantity
        if quantity <= 0:
            continue
        record_movement(dup_inv, bucket, -quantity, StockMovement.MovementType.MERGE_OUT, source, context["user"],
                        reason=reason, unit_cost=context["unit_cost"])
        record_movement(keep_inv, bucket, quantity, StockMovement.MovementType.MERGE_IN, source, context["user"],
                        reason=reason, unit_cost=context["unit_cost"])
        moved += quantity
    return moved


# Extend by appending (name, function); "stock" must stay last so earlier steps
# can't be undone by a failing transfer — the whole merge is atomic anyway.
MERGE_STEPS = [
    ("sale_items", _move_sale_items),
    ("purchase_items", _move_purchase_items),
    ("equipment_units", _move_equipment_units),
    ("price_rows", _move_price_history),
    ("barcode_aliases", _move_barcode_aliases),
    ("bundle_components", _move_bundle_components),  # Module F
    ("stock", _transfer_stock),
]


# --- checks, preview, merge ---------------------------------------------------

def _check(keep, duplicate):
    from catalog.models import ProductMerge

    if keep.pk == duplicate.pk:
        raise ValidationError("Choose two different products.")
    if ProductMerge.objects.filter(duplicate=duplicate).exists():
        raise ValidationError(f"{duplicate.name} has already been merged into another product.")
    if ProductMerge.objects.filter(duplicate=keep).exists():
        raise ValidationError(f"{keep.name} was itself merged away and can't be kept.")


def _summary(product):
    from stock.models import Inventory

    inventory = Inventory.objects.filter(product=product).first()
    return {
        "product_id": product.pk,
        "name": product.name,
        "barcode": product.barcode,
        "category_name": product.category.name,
        "is_active": product.is_active,
        "in_stock": inventory.quantity_in_stock if inventory else None,
    }


def merge_preview(keep, duplicate):
    """What a merge would move, without writing anything."""
    from catalog.models import ProductBarcodeAlias
    from stock.models import Inventory

    _check(keep, duplicate)
    inventory = Inventory.objects.filter(product=duplicate).first()
    counts = {
        "sale_items": duplicate.sale_items.count(),
        "purchase_items": duplicate.purchase_items.count(),
        "bundle_components": (
            duplicate.purchase_item_components.count() + duplicate.bundle_template_components.count()
        ),
        "equipment_units": duplicate.equipment_units.count(),
        "price_rows": duplicate.pricing_history.count(),
        "barcode_aliases": ProductBarcodeAlias.objects.filter(product=duplicate).count() + 1,
        "in_stock": inventory.quantity_in_stock if inventory else 0,
        "in_use": inventory.quantity_in_use if inventory else 0,
        "damaged": inventory.quantity_damaged if inventory else 0,
    }
    return {"keep": _summary(keep), "duplicate": _summary(duplicate), "counts": counts}


def merge_products(keep, duplicate, user, reason):
    """Fold ``duplicate`` into ``keep``. Irreversible; all or nothing."""
    from catalog.models import Product, ProductMerge
    from stock.services import weighted_average_cost

    reason = (reason or "").strip()
    if not reason:
        raise ValidationError({"reason": "Say why these are the same product."})

    with transaction.atomic():
        locked = {p.pk: p for p in Product.objects.select_for_update().filter(pk__in=[keep.pk, duplicate.pk]).order_by("pk")}
        keep, duplicate = locked[keep.pk], locked[duplicate.pk]
        _check(keep, duplicate)

        merge = ProductMerge.objects.create(keep=keep, duplicate=duplicate, merged_by=user, reason=reason, counts={})
        context = {
            "merge": merge, "user": user, "reason": reason, "counts": {},
            # The duplicate's own cost, taken before its purchase lines move.
            "unit_cost": weighted_average_cost(duplicate),
        }
        for name, step in MERGE_STEPS:
            count = step(keep, duplicate, context)
            if name != "stock":
                context["counts"][name] = count

        duplicate.is_active = False
        duplicate.name = f"[merged into {keep.name}]"[:150]
        duplicate.save()
        merge.counts = context["counts"]
        merge.save(update_fields=["counts"])
    return merge


def find_duplicate_pairs(threshold=DUPLICATE_SCORE, limit=MAX_PAIRS):
    """Pairs of active products whose name+brand+model look alike (trigram similarity)."""
    from catalog.models import Product

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT a.product_id, b.product_id, similarity(a.search_text, b.search_text) AS score
            FROM catalog_product a
            JOIN catalog_product b
              ON a.product_id < b.product_id AND a.search_text %% b.search_text
            WHERE a.is_active AND b.is_active
              AND similarity(a.search_text, b.search_text) >= %s
            ORDER BY score DESC, a.product_id, b.product_id
            LIMIT %s
            """,
            [threshold, limit],
        )
        rows = cursor.fetchall()
    ids = {pid for a, b, _ in rows for pid in (a, b)}
    products = {p.pk: p for p in Product.objects.filter(pk__in=ids).select_related("category")}
    return [
        {"a": _summary(products[a]), "b": _summary(products[b]), "score": round(float(score), 3)}
        for a, b, score in rows
    ]
