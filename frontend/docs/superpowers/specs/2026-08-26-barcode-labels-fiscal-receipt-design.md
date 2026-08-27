# Barcode labels + fiscal-style receipt redesign

Date: 2026-08-26
Status: approved for planning

## Context

Two related gaps in the deployed app:

1. Products and serialized equipment units have a `barcode`/`serial_number` string but no visual barcode rendering and no way to print a label for shelf/asset tagging.
2. The POS receipt (`components/pos/Receipt.tsx`) is a bare itemized total with a hardcoded shop name and a literal `[Shop Address]` placeholder. The user wants it restructured to match a Rwanda RRA/EBM-style fiscal receipt (business header, itemized tax breakdown, SDC/MRC info, QR code, signature block), based on a reference image.

Recon of both the frontend and the sibling Django backend (`../backend`) confirmed:
- `Product.barcode` is a backend-generated SKU string (`PES-<CATEGORY_CODE>-#####`, `catalog/services.py:generate_barcode`), alphanumeric, not EAN/UPC-compatible. Never user-edited.
- `EquipmentUnit.serial_number` is a freeform, user-typed, unique string — no generation logic.
- `Sale`/`SaleItem` (frontend and backend) have no tax, discount, or fiscal metadata fields at all.
- No barcode or QR rendering library is installed anywhere.
- Print today is `window.print()` + a CSS `visibility` trick keyed on a single `-print` class at a time (`.receipt-print`, and a second independent flow `.info-sheet-print`). Nothing supports more than one print target concurrently.
- No `ShopProfile`/business-settings model exists on the backend.

**Important constraint, explicitly discussed with the user:** the reference image's "SDC Information" / "Internal Data" / QR / "END OF LEGAL RECEIPT" block is Rwanda's real EBM fiscal-receipt format, normally produced by a certified government tax device. This shop has no such certification or integration. The user chose to include this block now with placeholder data (to be wired to a real EBM/SDC integration later) rather than wait. To avoid a printed receipt ever being mistaken for a real certified fiscal document, that block must carry an explicit **"SAMPLE — pending EBM/SDC certification"** marker and obviously-placeholder values (not realistic-looking fake ones).

## Goals

- Visual barcode rendering for product SKUs and equipment serial numbers.
- Printable labels: per-item, bulk (multi-select → sheet), and immediately after registering a new serialized unit.
- A larger, better-structured POS receipt: real business info, itemized tax breakdown by category, and a clearly-marked placeholder fiscal block.
- A tax model that is real and useful (Rwanda VAT: 0% exempt / 18% standard), not itself a placeholder.
- A print mechanism that supports receipt, info-sheet, and label printing without the three fighting each other.

## Non-goals

- Real EBM/SDC device integration, real MRC issuance, or real digital signatures. That requires a certified third-party integration this project doesn't have.
- Configurable/multiple tax rates beyond Rwanda's two statutory categories (A: exempt 0%, B: standard 18%). If the rate changes by law, it's a constant to update, not a UI to build.
- Thermal label printer support. Labels target a standard A4 sheet printed via the browser print dialog.

## Backend changes (`../backend`)

### New model: `finance.ShopProfile`

Placed in the existing `finance` app (business/financial identity, not a cross-cutting concern like `core`). Singleton (`pk=1` enforced via a `save()` override, matching a common Django singleton pattern), fields: `business_name`, `tin` (taxpayer ID), `po_box`, `phone`, `email`, `address`. Seeded with a data migration containing the current hardcoded values ("Promise Electronic Shop", etc.) so behavior doesn't regress. Editable via Django admin only — no new frontend admin UI. Exposed read-only via `GET /api/shop-profile/` (confirmed against `config/urls.py`: every app's URLs are flatly namespaced under `/api/`, e.g. `expenses/` → `/api/expenses/`, not nested per-app), registered in `finance/urls.py` alongside its existing routes.

### `Product.tax_category`

`CharField` with `TextChoices`: `A_EXEMPT = "A", "Exempt (0%)"` / `B_STANDARD = "B", "Standard (18%)"`, default `B`. Added to `ProductSerializer` (read/write) and the frontend `ProductFormDialog` as a new field (a two-option `SegmentedToggle`, consistent with existing form patterns).

### `SaleItem.tax_category` + `SaleItem.tax_amount`

Captured at sale-creation time in `sales/services.py`, the same way `unit_price`/`subtotal` are already captured from the product's current state — `tax_category` copied from `product.tax_category`, `tax_amount` computed as `subtotal * RATE[tax_category]` where `RATE = {"A": 0, "B": Decimal("0.18")}` is a module constant, not a DB-configurable value (per non-goals). `Sale.total_amount` continues to mean the same thing it does today (line subtotals); the receipt sums `tax_amount` across items to show the breakdown — no new persisted field on `Sale` itself, since it's cheaply derivable from `items`.

### Frontend type/API mirrors

`lib/types.ts`: add `tax_category: "A" | "B"` to `Product`; add `tax_category` and `tax_amount: string` to `SaleItem`; add a `ShopProfile` interface and a `useShopProfile` hook (`lib/settings/useShopProfile.ts`, same `useQuery` pattern as `useSuppliers`/`useCustomers`) fetching the new endpoint.

## Print mechanism refactor

Replace the two hand-duplicated blocks in `app/globals.css` with one reusable pattern:

```css
@media print {
  body * { visibility: hidden; }
  body:has(.print-target) .print-target,
  body:has(.print-target) .print-target * { visibility: visible; }
  .print-target { position: absolute; top: 0; left: 0; width: 100%; }
}
```

`Receipt.tsx`'s `.receipt-print` and `InfoSheetCard.tsx`'s `.info-sheet-print` both become `.print-target` (the class name is generic on purpose — only one is ever mounted/visible at a time in practice, same as today, so a single shared class is sufficient and removes the duplication). The new label print flow uses the same `.print-target` class. A dedicated `@page` rule sized for the label sheet (see below) applies only within the label-printing component's own scope via a wrapping class, so it doesn't affect receipt/info-sheet printing.

## Barcode rendering

New dependency: **`jsbarcode`** (Code128 — supports the full alphanumeric range both `PES-XXX-#####` SKUs and freeform serial numbers need; EAN/UPC are numeric-only and don't fit either format).

`components/ui/Barcode.tsx`: a thin wrapper rendering into an inline `<svg>` via a ref and `JsBarcode(ref.current, value, options)` in a `useEffect`. Props: `value: string`, optional `height`/`width`/`fontSize`. No visual redesign of existing barcode/serial *text* displays is in scope — this is additive (used inside the new label components), not a replacement of every existing text display.

## Label printing

New dependency: **`qrcode`** is *not* needed here (that's for the receipt) — labels are barcode-only.

- `components/products/ProductLabel.tsx`: product name (truncated), retail price, `Barcode` with the SKU, human-readable code beneath (jsbarcode's default).
- `components/stock/UnitLabel.tsx`: product name, `Barcode` with the serial number, serial number as human-readable text beneath.
- `components/ui/LabelSheet.tsx`: generic grid wrapper (3×8, ~63.5×33.9mm cells — standard A4 Avery-style layout) with its own `@page` CSS scoped via a wrapper class, rendering `.print-target` content and accepting any array of label elements as children.

Entry points:
1. **Per-item** — a "Print label" icon action added to `ProductCardGrid` cards, and to `SerializedUnitsTable` rows (corrected during planning: `StockOverviewCardGrid` only has product-level aggregates — `quantity_in_stock`/`quantity_in_use`/etc. — with no `serial_number` field; the actual serial numbers only exist on `SerializedUnitsTable`'s rows, shown once a product is selected on the Stock page). Opens a single-label `LabelSheet` and calls `window.print()`.
2. **Bulk** — checkbox selection added to `ProductCardGrid` (Products page) and `SerializedUnitsTable` (Stock page, for the currently-selected product's units), with a "Print N labels" action bar appearing when 1+ are selected, rendering the full sheet.
3. **Post-registration** — `RegisterUnitDialog` gets a "Print label now" option after a successful save, printing that one unit's label immediately (fits the physical workflow of tagging an item as it's received).

Assumption to confirm in the plan/implementation: standard A4 office label sheet, 3×8 grid. Flag if a specific thermal label printer/roll size is actually in use — that's a different `@page` size, cheap to swap.

## Receipt redesign

`components/pos/Receipt.tsx` restructured, larger and more structured, in this order:
1. **Business header** — from `useShopProfile()`: business name, TIN, PO box, phone, email, address (replaces the hardcoded name and `[Shop Address]` literal).
2. **Items** — unchanged data, larger/clearer typography (matches the reference image's larger line-item block).
3. **Tax summary** — grouped by `tax_category`: subtotal and tax for category A (exempt) and category B (standard), then grand total. Computed client-side by grouping `sale.items` by `tax_category` (real data, from the backend changes above).
4. **Payment/cashier/timestamp** — unchanged data, restyled.
5. **Fiscal placeholder block** — visually modeled on the reference image's "SDC Information" / "Internal Data" / QR / signature section, but:
   - A visible banner: **"SAMPLE RECEIPT — pending EBM/SDC certification"**.
   - Placeholder values that read as placeholders (`MRC: PENDING-SETUP`, `SDC ID: NOT-CERTIFIED`), not realistic-looking fake ones.
   - A QR code (new dependency: **`qrcode`**) encoding a short string that itself states this is a sample (e.g. `SAMPLE RECEIPT #{sale_id} — NOT FISCALLY VALID`), so scanning it doesn't produce something misleadingly official either.
   - No "END OF LEGAL RECEIPT" text — that specific phrase asserts legal fiscal status this receipt doesn't have; omitted rather than reproduced.

## Testing

- Backend: model/migration tests for `ShopProfile` and `Product.tax_category`; a service-level test asserting `SaleItem.tax_amount` is computed correctly for both categories on sale creation (existing `sales/tests` pattern).
- Frontend: `Barcode` renders an SVG for a given value; `ProductLabel`/`UnitLabel` render expected text + a barcode; `LabelSheet` renders the right cell count; `Receipt` test updated for the new business-header/tax-summary/fiscal-block content (existing fixture data extended with `tax_category`/`tax_amount`); print-CSS class rename covered implicitly by existing `Receipt`/`InfoSheetCard` tests continuing to pass against the new shared `.print-target` class.

## Files touched (indicative, not exhaustive — the plan will finalize this)

**Backend:** `finance/models.py` (+`ShopProfile`) + migration + seed data migration, `finance/serializers.py`, `finance/views.py` + `finance/urls.py`, `finance/admin.py` (register `ShopProfile`), `catalog/models.py` (+`Product.tax_category`) + migration + `catalog/serializers.py`, `sales/models.py` (+`SaleItem.tax_category`/`tax_amount`) + migration, `sales/services.py` (tax computation at sale creation).

**Frontend:** `package.json` (+`jsbarcode`, `+qrcode`), `lib/types.ts`, new `lib/settings/useShopProfile.ts`, `app/globals.css` (print mechanism), `components/ui/Barcode.tsx`, `components/ui/LabelSheet.tsx`, `components/products/ProductLabel.tsx`, `components/stock/UnitLabel.tsx`, `components/pos/Receipt.tsx` (+ test), `components/products/ProductFormDialog.tsx` (tax category field), `components/products/ProductCardGrid.tsx` (print-label action + selection), `components/stock/SerializedUnitsTable.tsx` (print-label action + selection), `components/stock/RegisterUnitDialog.tsx` (print-after-save), `app/(protected)/products/ProductsPageClient.tsx` (bulk selection state + action bar), `app/(protected)/stock/StockPageClient.tsx` (bulk selection state + action bar), `components/products/InfoSheetCard.tsx` (class rename only).
