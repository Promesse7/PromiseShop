from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from catalog.models import Product, ProductPricing
from catalog.search import normalise_text
from catalog.services import generate_barcode
from finance.services import refresh_purchase_payments
from purchasing.bundles import default_split
from purchasing.costing import component_unit_costs, line_unit_costs
from purchasing.models import (
    BundleTemplate, BundleTemplateComponent, Purchase, PurchaseItem, PurchaseItemComponent,
)
from stock.models import Inventory, StockMovement
from stock.services import record_movement

CENT = Decimal("0.01")


def _validate_discrepancy_note(unit_cost_paid, unit_cost_invoiced, price_discrepancy_note):
    if unit_cost_paid != unit_cost_invoiced and not price_discrepancy_note:
        raise ValidationError({
            "price_discrepancy_note": "Required when unit_cost_paid differs from unit_cost_invoiced."
        })


def _recompute_purchase_totals(purchase):
    totals = purchase.items.aggregate(paid=Sum("subtotal_paid"), invoiced=Sum("subtotal_invoiced"))
    purchase.total_paid = totals["paid"] or Decimal("0.00")
    purchase.total_invoiced = totals["invoiced"] or Decimal("0.00")
    purchase.save(update_fields=["total_paid", "total_invoiced"])
    # What is owed changed, so the derived payment status may have too.
    refresh_purchase_payments(purchase)


def _lock_draft(purchase, verb="add items to"):
    locked = Purchase.objects.select_for_update().get(pk=purchase.pk)
    if locked.status != Purchase.Status.DRAFT:
        raise ValidationError(f"Cannot {verb} a purchase that is not a draft.")
    return locked


def _normalise_kind(line_kind, units_per_pack):
    """(line_kind, units_per_pack) for a line that has its own product."""
    line_kind = line_kind or PurchaseItem.LineKind.SINGLE
    if line_kind == PurchaseItem.LineKind.SINGLE:
        return line_kind, 1
    if line_kind == PurchaseItem.LineKind.PACK:
        if units_per_pack is None or units_per_pack < 2:
            raise ValidationError({"units_per_pack": "A pack holds at least 2 units."})
        return line_kind, units_per_pack
    raise ValidationError({"line_kind": "A bundle line is entered with its components."})


def add_existing_product_item(purchase, product, quantity, unit_cost_paid, unit_cost_invoiced,
                               price_discrepancy_note="", *, line_kind=PurchaseItem.LineKind.SINGLE,
                               units_per_pack=1):
    """Add a single or pack line. For a pack, ``quantity`` counts packs and the
    unit costs are the price of one pack."""
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Cannot add items to a purchase that is not a draft.")
    _validate_discrepancy_note(unit_cost_paid, unit_cost_invoiced, price_discrepancy_note)
    line_kind, units_per_pack = _normalise_kind(line_kind, units_per_pack)
    with transaction.atomic():
        purchase = _lock_draft(purchase)
        item = PurchaseItem.objects.create(
            purchase=purchase, product=product, quantity=quantity,
            line_kind=line_kind, units_per_pack=units_per_pack,
            unit_cost_paid=unit_cost_paid, unit_cost_invoiced=unit_cost_invoiced,
            price_discrepancy_note=price_discrepancy_note,
            subtotal_paid=quantity * unit_cost_paid,
            subtotal_invoiced=quantity * unit_cost_invoiced,
        )
        _recompute_purchase_totals(purchase)
    return item


def _find_existing_product_by_name(name):
    # Case- and whitespace-insensitive (via the maintained normalized_name), oldest
    # first so a catalog that already holds duplicates resolves deterministically.
    return Product.objects.filter(normalized_name=normalise_text(name)).order_by("product_id").first()


def _get_or_create_product(*, category, name, selling_price, wholesale_price, brand="", model_number="",
                           specifications="", usage_instructions="", warranty_months=0, reorder_level=5):
    """The catalog product called ``name``, created with a current price if new.

    A "new product" whose name is already in the catalog is almost always the same
    product typed by hand (bulk entry, slow catalog load, a second client), so the
    existing one is returned and keeps its own pricing — the selling price sent for
    the would-be new product is ignored.
    """
    name = " ".join(name.split())
    existing = _find_existing_product_by_name(name)
    if existing is not None:
        return existing
    barcode = generate_barcode(category)
    product = Product.objects.create(
        category=category, barcode=barcode, name=name, brand=brand, model_number=model_number,
        specifications=specifications, usage_instructions=usage_instructions,
        warranty_months=warranty_months, reorder_level=reorder_level,
    )
    ProductPricing.objects.create(
        product=product, wholesale_price=wholesale_price, retail_price=selling_price,
        effective_date=timezone.now().date(), is_current=True,
    )
    return product


def add_new_product_item(purchase, *, category, name, quantity, unit_cost_paid, unit_cost_invoiced,
                          selling_price, brand="", model_number="", specifications="",
                          usage_instructions="", warranty_months=0, reorder_level=5,
                          price_discrepancy_note="", line_kind=PurchaseItem.LineKind.SINGLE,
                          units_per_pack=1):
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Cannot add items to a purchase that is not a draft.")
    _validate_discrepancy_note(unit_cost_paid, unit_cost_invoiced, price_discrepancy_note)
    line_kind, units_per_pack = _normalise_kind(line_kind, units_per_pack)
    with transaction.atomic():
        product = _get_or_create_product(
            category=category, name=name, selling_price=selling_price,
            # The cost price is per single unit, so a pack's price is divided out.
            wholesale_price=(Decimal(unit_cost_paid) / units_per_pack).quantize(CENT),
            brand=brand, model_number=model_number, specifications=specifications,
            usage_instructions=usage_instructions, warranty_months=warranty_months,
            reorder_level=reorder_level,
        )
        item = add_existing_product_item(
            purchase, product, quantity, unit_cost_paid, unit_cost_invoiced, price_discrepancy_note,
            line_kind=line_kind, units_per_pack=units_per_pack,
        )
    return item


# --- bundles -------------------------------------------------------------------

def _current_retail(product):
    return (
        ProductPricing.objects.filter(product=product, is_current=True)
        .values_list("retail_price", flat=True).first()
    )


def _prepare_components(components):
    """Validate a bundle's component list and attach each one's retail price.

    A ``new_product`` component whose name already exists resolves to that
    product (same dedupe as a new-product line); a truly new one isn't created
    yet — its cost price comes from the split — and its selling price stands in
    for the retail price.
    """
    if not components:
        raise ValidationError({"components": "A bundle needs at least one component."})
    prepared, seen = [], set()
    for component in components:
        component = dict(component)
        product, new_product = component.get("product"), component.get("new_product")
        if (product is None) == (new_product is None):
            raise ValidationError(
                {"components": "Each component is an existing product or an explicit new one."}
            )
        if not component.get("qty_per_bundle") or component["qty_per_bundle"] < 1:
            raise ValidationError({"components": "Each component needs a quantity of at least 1."})
        if product is None:
            existing = _find_existing_product_by_name(new_product["name"])
            if existing is not None:
                component["product"], component["new_product"] = existing, None
                product = existing
        if product is not None:
            key = ("id", product.pk)
            component["_retail_price"] = _current_retail(product)
        else:
            key = ("new", normalise_text(new_product["name"]))
            component["_retail_price"] = new_product.get("selling_price")
        if key in seen:
            raise ValidationError({"components": "Each product can appear only once in a bundle."})
        seen.add(key)
        prepared.append(component)
    return prepared


def _allocations(components, unit_cost_paid, unit_cost_invoiced):
    """Per-bundle (paid, invoiced) for each prepared component.

    The user's split when given on every component (it must sum exactly to the
    bundle's prices); the default split when given on none; refused in between.
    """
    def given(key):
        present = [component.get(key) is not None for component in components]
        if any(present) and not all(present):
            raise ValidationError(
                {"components": f"Give {key} on every component, or on none for the default split."}
            )
        return all(present)

    paid_given = given("allocated_paid_cost")
    invoiced_given = given("allocated_invoiced_cost")
    default = default_split(
        [(c["_retail_price"], c["qty_per_bundle"]) for c in components], unit_cost_paid, unit_cost_invoiced,
    )
    paid = [Decimal(c["allocated_paid_cost"]) for c in components] if paid_given else [d[0] for d in default]
    invoiced = (
        [Decimal(c["allocated_invoiced_cost"]) for c in components] if invoiced_given
        else [d[1] for d in default]
    )
    if any(value < 0 for value in paid + invoiced):
        raise ValidationError({"components": "Allocated costs can't be negative."})
    if sum(paid) != Decimal(unit_cost_paid):
        raise ValidationError({"components": (
            f"Paid allocations add up to {sum(paid)}, not the bundle price {unit_cost_paid}."
        )})
    if sum(invoiced) != Decimal(unit_cost_invoiced):
        raise ValidationError({"components": (
            f"Invoiced allocations add up to {sum(invoiced)}, not the invoiced price {unit_cost_invoiced}."
        )})
    return list(zip(paid, invoiced))


def _write_components(item, components, allocations):
    for component, (paid, invoiced) in zip(components, allocations):
        product = component.get("product")
        if product is None:
            product = _get_or_create_product(
                **component["new_product"],
                wholesale_price=(paid / component["qty_per_bundle"]).quantize(CENT),
            )
        PurchaseItemComponent.objects.create(
            purchase_item=item, product=product, qty_per_bundle=component["qty_per_bundle"],
            allocated_paid_cost=paid, allocated_invoiced_cost=invoiced,
        )


def _save_template(item, name, user):
    template = BundleTemplate.objects.create(
        name=" ".join((name or item.bundle_name).split()), supplier=item.purchase.supplier, created_by=user,
    )
    BundleTemplateComponent.objects.bulk_create([
        BundleTemplateComponent(template=template, product=c.product, qty_per_bundle=c.qty_per_bundle)
        for c in item.components.order_by("component_id")
    ])
    return template


def add_bundle_item(purchase, *, bundle_name, quantity, unit_cost_paid, unit_cost_invoiced, components,
                    price_discrepancy_note="", save_as_template=False, template_name="", user=None):
    """Add a bundle line: ``quantity`` bundles at a per-bundle price, broken into
    components whose allocated per-bundle costs sum exactly to that price."""
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Cannot add items to a purchase that is not a draft.")
    bundle_name = " ".join((bundle_name or "").split())
    if not bundle_name:
        raise ValidationError({"bundle_name": "Name the bundle (e.g. the supplier's package name)."})
    _validate_discrepancy_note(unit_cost_paid, unit_cost_invoiced, price_discrepancy_note)
    components = _prepare_components(components)
    allocations = _allocations(components, unit_cost_paid, unit_cost_invoiced)
    with transaction.atomic():
        locked = _lock_draft(purchase)
        item = PurchaseItem.objects.create(
            purchase=locked, product=None, line_kind=PurchaseItem.LineKind.BUNDLE, units_per_pack=1,
            bundle_name=bundle_name, quantity=quantity,
            unit_cost_paid=unit_cost_paid, unit_cost_invoiced=unit_cost_invoiced,
            price_discrepancy_note=price_discrepancy_note,
            subtotal_paid=quantity * unit_cost_paid, subtotal_invoiced=quantity * unit_cost_invoiced,
        )
        _write_components(item, components, allocations)
        if save_as_template:
            _save_template(item, template_name, user)
        _recompute_purchase_totals(locked)
    return item


def add_row(purchase, row, user=None):
    """Add one validated row (single, pack or bundle) from the add/bulk endpoints."""
    common = dict(
        quantity=row["quantity"], unit_cost_paid=row["unit_cost_paid"],
        unit_cost_invoiced=row["unit_cost_invoiced"],
        price_discrepancy_note=row.get("price_discrepancy_note", ""),
    )
    line_kind = row.get("line_kind") or PurchaseItem.LineKind.SINGLE
    if line_kind == PurchaseItem.LineKind.BUNDLE:
        return add_bundle_item(
            purchase, bundle_name=row.get("bundle_name", ""), components=row.get("components") or [],
            save_as_template=row.get("save_as_template", False), template_name=row.get("template_name", ""),
            user=user, **common,
        )
    kind = dict(line_kind=line_kind, units_per_pack=row.get("units_per_pack") or 1)
    if row.get("new_product") is not None:
        return add_new_product_item(purchase, **row["new_product"], **common, **kind)
    return add_existing_product_item(purchase, row["product"], **common, **kind)


def bundle_split_preview(unit_cost_paid, unit_cost_invoiced, components):
    """The default split for a bundle being typed in — nothing is saved."""
    prepared = _prepare_components(components)
    rows = []
    for component, (paid, invoiced) in zip(
        prepared, default_split([(c["_retail_price"], c["qty_per_bundle"]) for c in prepared],
                                unit_cost_paid, unit_cost_invoiced),
    ):
        qty = component["qty_per_bundle"]
        rows.append({
            "product": component["product"].pk if component.get("product") is not None else None,
            "qty_per_bundle": qty,
            "retail_price": component["_retail_price"],
            "allocated_paid_cost": paid,
            "allocated_invoiced_cost": invoiced,
            "unit_paid_cost": (paid / qty).quantize(CENT),
            "unit_invoiced_cost": (invoiced / qty).quantize(CENT),
        })
    return rows


def remove_item(purchase, item):
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Cannot remove items from a purchase that is not a draft.")
    if item.purchase_id != purchase.pk:
        raise ValidationError("Item does not belong to this purchase.")
    with transaction.atomic():
        purchase = _lock_draft(purchase, verb="remove items from")
        item.delete()
        _recompute_purchase_totals(purchase)


class BulkRowErrors(Exception):
    """Raised by add_items_bulk when any row fails; carries {row_index: errors}."""

    def __init__(self, row_errors):
        super().__init__("Some rows failed; nothing was saved.")
        self.row_errors = row_errors


def add_items_bulk(purchase, rows, user=None):
    """Add every row to a draft purchase, or none of them.

    rows: validated BulkPurchaseItemRowSerializer data — single, pack or bundle.
    Each goes through the same paths as a single add (so new products keep the
    same-name dedupe). Any failure rolls everything back — including products
    created by earlier rows — and raises BulkRowErrors.
    """
    if not rows:
        raise ValidationError("Add at least one row.")
    with transaction.atomic():
        locked = _lock_draft(purchase)
        items, row_errors = [], {}
        for index, row in enumerate(rows):
            try:
                with transaction.atomic():
                    items.append(add_row(locked, row, user=user))
            except ValidationError as exc:
                row_errors[index] = exc.detail
        if row_errors:
            transaction.set_rollback(True)
            raise BulkRowErrors(row_errors)
    return items


def update_item(purchase, item, **changes):
    """Change a draft purchase line and re-total.

    Any line: quantity, unit costs, discrepancy note. A pack line: units_per_pack.
    A bundle line: bundle_name and ``components`` (a full replacement); when its
    prices change without new components, the default split is redone over the
    existing components.
    """
    if item.purchase_id != purchase.pk:
        raise ValidationError("Item does not belong to this purchase.")
    with transaction.atomic():
        locked = _lock_draft(purchase, verb="edit items on")
        item = PurchaseItem.objects.select_for_update().get(pk=item.pk)
        old_costs = (item.unit_cost_paid, item.unit_cost_invoiced)
        for field in ("quantity", "unit_cost_paid", "unit_cost_invoiced", "price_discrepancy_note"):
            if field in changes:
                setattr(item, field, changes[field])
        _validate_discrepancy_note(item.unit_cost_paid, item.unit_cost_invoiced, item.price_discrepancy_note)

        if item.line_kind == PurchaseItem.LineKind.BUNDLE:
            if "bundle_name" in changes:
                item.bundle_name = " ".join((changes["bundle_name"] or "").split())
                if not item.bundle_name:
                    raise ValidationError({"bundle_name": "Name the bundle."})
            components = changes.get("components")
            if components is None and (item.unit_cost_paid, item.unit_cost_invoiced) != old_costs:
                components = [
                    {"product": c.product, "qty_per_bundle": c.qty_per_bundle}
                    for c in item.components.select_related("product").order_by("component_id")
                ]
            if components is not None:
                prepared = _prepare_components(components)
                allocations = _allocations(prepared, item.unit_cost_paid, item.unit_cost_invoiced)
                item.components.all().delete()
                _write_components(item, prepared, allocations)
        elif "units_per_pack" in changes or "line_kind" in changes:
            item.line_kind, item.units_per_pack = _normalise_kind(
                changes.get("line_kind", item.line_kind), changes.get("units_per_pack", item.units_per_pack),
            )

        item.subtotal_paid = item.quantity * item.unit_cost_paid
        item.subtotal_invoiced = item.quantity * item.unit_cost_invoiced
        item.save()
        _recompute_purchase_totals(locked)
    return item


def recent_products_for_supplier(supplier, limit=20):
    """The last ``limit`` distinct products bought from a supplier, newest first.

    Pack lines and bundle components count as their single-unit products, with
    per-unit costs. Cancelled purchases don't count; drafts do (they are what's
    being typed in now). Rows: {product, purchase, units, unit_cost_paid,
    unit_cost_invoiced}.
    """
    seen, rows = set(), []
    lines = (
        PurchaseItem.objects.filter(purchase__supplier=supplier)
        .exclude(purchase__status=Purchase.Status.CANCELLED)
        .select_related("product", "purchase")
        .prefetch_related("components__product")
        .order_by("-purchase__purchase_date", "-purchase_id", "-purchase_item_id")
    )
    for line in lines.iterator(chunk_size=200):
        if line.line_kind == PurchaseItem.LineKind.BUNDLE:
            entries = [
                (c.product, line.quantity * c.qty_per_bundle, *component_unit_costs(c))
                for c in line.components.all()
            ]
        else:
            entries = [(line.product, line.quantity * line.units_per_pack, *line_unit_costs(line))]
        for product, units, paid, invoiced in entries:
            if product.pk in seen:
                continue
            seen.add(product.pk)
            rows.append({
                "product": product, "purchase": line.purchase, "units": units,
                "unit_cost_paid": paid, "unit_cost_invoiced": invoiced,
            })
            if len(rows) == limit:
                return rows
    return rows


def _stock_entries(items):
    """Per-unit stock entries for a purchase's lines:
    [(product, units, unit_paid_cost, source)] — one per single/pack line and one
    per bundle component."""
    entries = []
    for item in items:
        if item.line_kind == PurchaseItem.LineKind.BUNDLE:
            for component in item.components.select_related("product").order_by("component_id"):
                entries.append((
                    component.product, item.quantity * component.qty_per_bundle,
                    component_unit_costs(component)[0], ("purchase_item_component", component.pk),
                ))
        else:
            entries.append((
                item.product, item.quantity * item.units_per_pack,
                line_unit_costs(item)[0], ("purchase_item", item.pk),
            ))
    return entries


def _lock_inventories(products):
    """Lock (creating if needed) one inventory per product, in product-id order."""
    inventories = {}
    for product_id in sorted(products):
        inventories[product_id], _ = Inventory.objects.select_for_update().get_or_create(
            product=products[product_id], defaults={"quantity_in_stock": 0}
        )
    return inventories


def cancel_purchase(purchase, *, user=None):
    with transaction.atomic():
        locked = Purchase.objects.select_for_update().get(pk=purchase.pk)
        if locked.status == Purchase.Status.CANCELLED:
            raise ValidationError("This purchase is already cancelled.")

        if locked.status == Purchase.Status.RECEIVED:
            entries = _stock_entries(locked.items.select_related("product").order_by("pk"))
            quantities, products = {}, {}
            for product, units, _cost, _source in entries:
                quantities[product.pk] = quantities.get(product.pk, 0) + units
                products[product.pk] = product

            # Lock every affected inventory row up front and verify the stock this
            # purchase brought in hasn't already moved on (e.g. been sold) before
            # reversing anything — a partial reversal would desync stock silently.
            inventories = _lock_inventories(products)
            shortfalls = [
                f"{products[pid].name} (only {inventories[pid].quantity_in_stock} left, "
                f"{quantity} would need to be reversed)"
                for pid, quantity in sorted(quantities.items())
                if inventories[pid].quantity_in_stock < quantity
            ]
            if shortfalls:
                raise ValidationError(
                    "Cannot cancel: stock from this purchase has already moved for "
                    + "; ".join(shortfalls)
                )

            for product, units, unit_cost, source in entries:
                record_movement(
                    inventories[product.pk], StockMovement.Bucket.IN_STOCK, -units,
                    StockMovement.MovementType.PURCHASE_CANCEL, source, user,
                    reason=f"Purchase #{locked.pk} cancelled", unit_cost=unit_cost,
                )

        locked.status = Purchase.Status.CANCELLED
        locked.save(update_fields=["status"])
    return locked


def receive_purchase(purchase, *, user=None):
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Only a draft purchase can be received.")
    with transaction.atomic():
        purchase = Purchase.objects.select_for_update().get(pk=purchase.pk)
        if purchase.status != Purchase.Status.DRAFT:
            raise ValidationError("Only a draft purchase can be received.")
        items = list(purchase.items.select_related("product").order_by("pk"))
        if not items:
            raise ValidationError("Cannot receive a purchase with no line items.")
        entries = _stock_entries(items)
        if not entries:
            raise ValidationError("Cannot receive a purchase with no line items.")
        inventories = _lock_inventories({product.pk: product for product, *_ in entries})
        for product, units, unit_cost, source in entries:
            record_movement(
                inventories[product.pk], StockMovement.Bucket.IN_STOCK, units,
                StockMovement.MovementType.PURCHASE_RECEIPT, source, user,
                reason=f"Purchase #{purchase.pk} received", unit_cost=unit_cost,
            )
        purchase.status = Purchase.Status.RECEIVED
        purchase.save(update_fields=["status"])
    return purchase
