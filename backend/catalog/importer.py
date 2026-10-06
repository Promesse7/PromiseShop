"""Opening stock import (release Module E3).

A CSV of products is checked row by row (a dry run writes nothing), then
committed in one transaction: missing categories, products, a current price
(wholesale = cost_price), inventory, and one ``opening`` stock movement per
row with stock, at the row's cost. Rows that match a product already in the
catalog (same barcode/alias or same normalised name) are flagged and skipped.
"""
import csv
import io
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from catalog.models import Category, Product, ProductBarcodeAlias, ProductPricing
from catalog.search import normalise_text
from catalog.services import generate_barcode

COLUMNS = [
    "category_code", "name", "brand", "model", "barcode", "retail_price", "cost_price",
    "opening_qty", "reorder_level", "vat", "warranty_months", "unit",
]
REQUIRED_COLUMNS = ["category_code", "name", "retail_price", "cost_price"]
MAX_ROWS = 2000
MAX_BYTES = 2_000_000
TEMPLATE_EXAMPLE = "AUD,JBL Flip 6,JBL,FLIP6,,145000,100000,8,3,B,12,pcs"
OPENING_REASON = "Opening stock import"


def template_csv():
    return ",".join(COLUMNS) + "\n" + TEMPLATE_EXAMPLE + "\n"


@dataclass
class ImportRow:
    line: int
    raw: dict
    status: str = "valid"  # valid | error | skip
    errors: dict = field(default_factory=dict)
    match: dict | None = None
    values: dict = field(default_factory=dict)
    product_id: int | None = None

    def as_dict(self):
        data = {
            "line": self.line,
            "status": self.status,
            "name": (self.raw.get("name") or "").strip(),
            "category_code": (self.raw.get("category_code") or "").strip().upper(),
            "barcode": (self.raw.get("barcode") or "").strip() or None,
            "opening_qty": self.values.get("opening_qty"),
            "errors": self.errors,
            "match": self.match,
        }
        if self.product_id is not None:
            data["product_id"] = self.product_id
        return data


def _decimal(raw, label, errors, *, required, minimum=Decimal("0"), positive=False):
    text = (raw or "").strip().replace(",", "")
    if text == "":
        if required:
            errors[label] = "Required."
        return None
    try:
        value = Decimal(text)
    except InvalidOperation:
        errors[label] = "Must be a number."
        return None
    if not value.is_finite() or value < minimum or (positive and value <= 0):
        errors[label] = "Must be more than 0." if positive else "Can't be negative."
        return None
    if value.as_tuple().exponent < -2:
        errors[label] = "At most 2 decimal places."
        return None
    return value


def _integer(raw, label, errors, *, default):
    text = (raw or "").strip()
    if text == "":
        return default
    try:
        value = int(text)
    except ValueError:
        errors[label] = "Must be a whole number."
        return None
    if value < 0:
        errors[label] = "Can't be negative."
        return None
    return value


def _text(raw, label, errors, max_length, *, required=False):
    value = " ".join((raw or "").split())
    if required and not value:
        errors[label] = "Required."
    elif len(value) > max_length:
        errors[label] = f"At most {max_length} characters."
    return value


def parse_csv(text):
    """Read the CSV text into raw row dicts keyed by lowercase column name."""
    if not isinstance(text, str) or not text.strip():
        raise ValidationError("The file is empty.")
    if len(text.encode("utf-8")) > MAX_BYTES:
        raise ValidationError("The file is too large (2 MB at most).")
    text = text.lstrip("﻿")
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise ValidationError("The file is empty.")
    reader.fieldnames = [(name or "").strip().lower() for name in reader.fieldnames]
    missing = [c for c in REQUIRED_COLUMNS if c not in reader.fieldnames]
    if missing:
        raise ValidationError(f"Missing column(s): {', '.join(missing)}. Download the template for the layout.")
    rows = []
    for raw in reader:
        if not any((v or "").strip() for k, v in raw.items() if k is not None and isinstance(v, str)):
            continue  # blank line
        rows.append(ImportRow(line=reader.line_num, raw={k: v for k, v in raw.items() if k is not None}))
        if len(rows) > MAX_ROWS:
            raise ValidationError(f"Too many rows ({MAX_ROWS} at most per import).")
    if not rows:
        raise ValidationError("The file has a header but no product rows.")
    return rows


def check_rows(rows):
    """Validate every row and mark matches with the catalog. Writes nothing."""
    categories = {c.code.upper(): c for c in Category.objects.all()}
    product_by_barcode = {b.lower(): (pid, name) for pid, b, name in Product.objects.values_list("product_id", "barcode", "name")}
    for barcode, pid, name in ProductBarcodeAlias.objects.values_list("barcode", "product_id", "product__name"):
        product_by_barcode.setdefault(barcode.lower(), (pid, name))
    product_by_name = {}
    for pid, normalized, name in Product.objects.order_by("product_id").values_list("product_id", "normalized_name", "name"):
        product_by_name.setdefault(normalized, (pid, name))

    seen_barcodes, seen_names = set(), set()
    for row in rows:
        raw, errors = row.raw, {}
        code = (raw.get("category_code") or "").strip().upper()
        if not code:
            errors["category_code"] = "Required."
        elif len(code) > 10:
            errors["category_code"] = "At most 10 characters."
        name = _text(raw.get("name"), "name", errors, 150, required=True)
        brand = _text(raw.get("brand"), "brand", errors, 80)
        model = _text(raw.get("model"), "model", errors, 80)
        barcode = (raw.get("barcode") or "").strip()
        if len(barcode) > 50:
            errors["barcode"] = "At most 50 characters."
        retail = _decimal(raw.get("retail_price"), "retail_price", errors, required=True, positive=True)
        cost = _decimal(raw.get("cost_price"), "cost_price", errors, required=True)
        qty = _integer(raw.get("opening_qty"), "opening_qty", errors, default=0)
        reorder = _integer(raw.get("reorder_level"), "reorder_level", errors, default=5)
        warranty = _integer(raw.get("warranty_months"), "warranty_months", errors, default=0)
        vat = (raw.get("vat") or "B").strip().upper()
        if vat not in (Product.TaxCategory.EXEMPT, Product.TaxCategory.STANDARD):
            errors["vat"] = "Use A (exempt) or B (standard 18%)."
        unit = _text(raw.get("unit"), "unit", errors, 20) or "pcs"

        normalized = normalise_text(name)
        existing = product_by_barcode.get(barcode.lower()) if barcode else None
        if existing is None and normalized:
            existing = product_by_name.get(normalized)

        if errors:
            row.status, row.errors = "error", errors
        elif existing is not None:
            row.status = "skip"
            row.match = {"product_id": existing[0], "name": existing[1]}
        elif barcode and barcode.lower() in seen_barcodes:
            row.status, row.errors = "error", {"barcode": "Repeated in this file."}
        elif normalized in seen_names:
            row.status, row.errors = "error", {"name": "Repeated in this file."}
        if row.status == "valid":
            seen_names.add(normalized)
            if barcode:
                seen_barcodes.add(barcode.lower())
        row.values = {
            "category_code": code, "category": categories.get(code), "name": name, "brand": brand,
            "model_number": model, "barcode": barcode, "retail_price": retail, "cost_price": cost,
            "opening_qty": qty, "reorder_level": reorder, "warranty_months": warranty,
            "tax_category": vat, "unit": unit,
        }
    return rows


def summarise(rows, *, created=None):
    valid = [r for r in rows if r.status == "valid"]
    new_categories = sorted({r.values["category_code"] for r in valid if r.values.get("category") is None})
    summary = {
        "rows": len(rows),
        "valid": len(valid),
        "errors": sum(r.status == "error" for r in rows),
        "skipped": sum(r.status == "skip" for r in rows),
        "new_categories": new_categories,
    }
    if created is not None:
        summary["created"] = created
    return summary


def dry_run(text):
    rows = check_rows(parse_csv(text))
    return {"dry_run": True, "summary": summarise(rows), "rows": [r.as_dict() for r in rows]}


class ImportHasErrors(Exception):
    def __init__(self, result):
        super().__init__("The file has rows with errors; nothing was imported.")
        self.result = result


def commit_import(text, user):
    """Create everything for the valid rows in one transaction, or nothing."""
    from stock.models import Inventory, StockMovement
    from stock.services import record_movement

    with transaction.atomic():
        # Lock the category table's rows we read so a concurrent product create
        # can't race the dry-run checks; then re-check inside the transaction.
        list(Category.objects.select_for_update().all())
        rows = check_rows(parse_csv(text))
        if any(r.status == "error" for r in rows):
            raise ImportHasErrors({"dry_run": True, "summary": summarise(rows), "rows": [r.as_dict() for r in rows]})

        valid = [r for r in rows if r.status == "valid"]
        categories = {c.code.upper(): c for c in Category.objects.all()}
        for row in valid:
            code = row.values["category_code"]
            if code not in categories:
                name = code
                if Category.objects.filter(name__iexact=name).exists():
                    name = f"{code} (imported)"
                categories[code] = Category.objects.create(name=name, code=code)

        today = timezone.localdate()
        # Rows that bring their own barcode go first, so a generated barcode can
        # never take a number a later row asked for.
        ordered = sorted(valid, key=lambda r: (not r.values["barcode"], r.line))
        for row in ordered:
            v = row.values
            category = categories[v["category_code"]]
            product = Product.objects.create(
                category=category,
                barcode=v["barcode"] or generate_barcode(category),
                name=v["name"], brand=v["brand"], model_number=v["model_number"],
                reorder_level=v["reorder_level"], warranty_months=v["warranty_months"],
                tax_category=v["tax_category"], unit=v["unit"],
            )
            ProductPricing.objects.create(
                product=product, wholesale_price=v["cost_price"], retail_price=v["retail_price"],
                effective_date=today, is_current=True,
            )
            inventory, _ = Inventory.objects.get_or_create(product=product)
            if v["opening_qty"]:
                inventory = Inventory.objects.select_for_update().get(pk=inventory.pk)
                record_movement(
                    inventory, StockMovement.Bucket.IN_STOCK, v["opening_qty"],
                    StockMovement.MovementType.OPENING, ("product_import", product.pk), user,
                    reason=OPENING_REASON, unit_cost=v["cost_price"],
                )
            row.product_id = product.pk

    return {
        "dry_run": False,
        "summary": summarise(rows, created=len(valid)),
        "rows": [r.as_dict() for r in rows],
    }


# --- single product -----------------------------------------------------------

def opening_stock_status(product):
    """Whether "Set opening stock" is allowed: never received, and no ledger
    movement except the system ledger-start rows."""
    from purchasing.models import Purchase, PurchaseItem
    from stock.models import Inventory, StockMovement

    in_stock = Inventory.objects.filter(product=product).values_list("quantity_in_stock", flat=True).first() or 0
    if PurchaseItem.objects.filter(product=product, purchase__status=Purchase.Status.RECEIVED).exists():
        return {"eligible": False, "reason": "This product has already been received on a purchase.", "in_stock": in_stock}
    real_movements = StockMovement.objects.filter(product=product).exclude(
        movement_type=StockMovement.MovementType.OPENING, created_by__isnull=True
    )
    if real_movements.exists():
        return {
            "eligible": False,
            "reason": "This product already has stock movements; use a count correction instead.",
            "in_stock": in_stock,
        }
    return {"eligible": True, "reason": None, "in_stock": in_stock}


def set_opening_stock(product, quantity, unit_cost, user, reason=""):
    """Set a never-received product's opening count (in stock) at a known cost."""
    from stock.models import Inventory, StockMovement
    from stock.services import record_movement

    with transaction.atomic():
        inventory, _ = Inventory.objects.get_or_create(product=product)
        inventory = Inventory.objects.select_for_update().get(pk=inventory.pk)
        status = opening_stock_status(product)
        if not status["eligible"]:
            raise ValidationError(status["reason"])
        delta = quantity - inventory.quantity_in_stock
        if delta <= 0:
            raise ValidationError(
                f"There are already {inventory.quantity_in_stock} in stock. Enter a higher opening count, "
                "or use a count correction to lower it."
            )
        return record_movement(
            inventory, StockMovement.Bucket.IN_STOCK, delta, StockMovement.MovementType.OPENING,
            ("opening_stock", product.pk), user,
            reason=(reason or "").strip() or "Opening stock", unit_cost=unit_cost,
        )
