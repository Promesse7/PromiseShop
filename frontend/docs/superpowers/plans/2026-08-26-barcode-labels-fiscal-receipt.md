# Barcode Labels + Fiscal-Style Receipt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual barcode rendering + printable barcode labels for products and serialized equipment units, and redesign the POS receipt into a larger, tax-itemized, business-branded printout with a clearly-marked sample fiscal block.

**Architecture:** Backend (`../backend`, Django/DRF): a new `finance.ShopProfile` singleton for business info, `Product.tax_category` (Rwanda VAT: A=exempt/0%, B=standard/18%), and `SaleItem.tax_category`/`tax_amount` computed at sale time. Frontend (Next.js): a generalized `.print-target` print mechanism shared by receipt/info-sheet/labels, a `Barcode` (jsbarcode) and `QrCode` (qrcode) component, `LabelSheet`/`ProductLabel`/`UnitLabel` for printable labels with three entry points (per-item, bulk, post-registration), and a redesigned `Receipt` consuming the new tax and business-profile data.

**Tech Stack:** Django 5 / DRF (backend, via `docker compose run --rm web ...`), Next.js/React/TypeScript, Tailwind CSS, TanStack Query, Vitest + Testing Library, `jsbarcode` (Code128 barcode rendering), `qrcode` (QR code rendering).

**Spec:** `docs/superpowers/specs/2026-08-26-barcode-labels-fiscal-receipt-design.md`

## Global Constraints

- No real EBM/SDC integration. The fiscal block (SDC ID, MRC, QR, signature-style section) uses obviously-placeholder values and a visible "SAMPLE RECEIPT — pending EBM/SDC certification" banner. Never render the phrase "END OF LEGAL RECEIPT".
- Tax rates are Rwanda's two statutory VAT categories only: `A` = Exempt (0%), `B` = Standard (18%), as module-level constants (`TAX_RATES` in `sales/services.py`) — not a DB-configurable rate.
- Label sheets assume a standard A4 office sheet, 3-column grid, 63.5mm × 33.9mm label cells — not a thermal label printer.
- All three print flows (receipt, product info sheet, labels) share one CSS mechanism: a single `.print-target` class in `app/globals.css`, replacing the previous `.receipt-print`/`.info-sheet-print` duplication.
- Backend commands run via `docker compose run --rm web ...` from the `PromiseShop` root (per `backend/README.md`); backend tests via `docker compose run --rm web pytest <path> -v`.
- Frontend tests/lint/typecheck run via `npx vitest run <path>` / `npm run lint` / `npx tsc --noEmit` with cwd `frontend/` (needed to find `package.json`; unrelated to git).
- **Git: the `PromiseShop` root directory (one level above `frontend/`) is the authoritative git repo for this entire feature — both backend and frontend changes commit there.** Run every `git add`/`git commit` in this plan with cwd at the `PromiseShop` root, using paths prefixed `frontend/...` or `backend/...` accordingly. `frontend/.git` is a separate, disconnected, shallow repo (one commit) that already-tracked frontend files also happen to sit inside of — it is not used for any commit in this plan; do not `git add`/`git commit` from within `frontend/` (that would hit the wrong repo).

---

## Task 1: Backend — `ShopProfile` model + migrations

**Files:**
- Modify: `../backend/finance/models.py`
- Create: `../backend/finance/migrations/0002_shopprofile.py` (generated)
- Create: `../backend/finance/migrations/0003_seed_shopprofile.py` (hand-written data migration)

**Interfaces:**
- Produces: `finance.models.ShopProfile` with fields `business_name: str`, `tin: str | None`, `po_box: str | None`, `phone: str | None`, `email: str | None`, `address: str | None`. Singleton — always `pk=1`.

- [ ] **Step 1: Add the `ShopProfile` model**

Append to `../backend/finance/models.py` (keep the existing `Expense` class above it):

```python
class ShopProfile(models.Model):
    business_name = models.CharField(max_length=150)
    tin = models.CharField(max_length=50, blank=True, null=True)
    po_box = models.CharField(max_length=50, blank=True, null=True)
    phone = models.CharField(max_length=30, blank=True, null=True)
    email = models.EmailField(max_length=120, blank=True, null=True)
    address = models.CharField(max_length=255, blank=True, null=True)

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        pass

    def __str__(self):
        return self.business_name
```

- [ ] **Step 2: Generate the schema migration**

Run: `docker compose run --rm web python manage.py makemigrations finance`
Expected: creates `finance/migrations/0002_shopprofile.py`. Open the generated file and confirm its class name is `Migration` with `dependencies = [("finance", "0001_initial")]` — note the exact filename for Step 3.

- [ ] **Step 3: Write the seed data migration**

Create `../backend/finance/migrations/0003_seed_shopprofile.py` (adjust the `dependencies` migration name if Step 2 generated a different filename):

```python
from django.db import migrations


def seed_shop_profile(apps, schema_editor):
    ShopProfile = apps.get_model("finance", "ShopProfile")
    ShopProfile.objects.get_or_create(
        pk=1,
        defaults={
            "business_name": "Promise Electronic Shop",
            "tin": None,
            "po_box": None,
            "phone": None,
            "email": None,
            "address": None,
        },
    )


def unseed_shop_profile(apps, schema_editor):
    ShopProfile = apps.get_model("finance", "ShopProfile")
    ShopProfile.objects.filter(pk=1).delete()


class Migration(migrations.Migration):
    dependencies = [("finance", "0002_shopprofile")]
    operations = [migrations.RunPython(seed_shop_profile, unseed_shop_profile)]
```

- [ ] **Step 4: Apply migrations and verify**

Run: `docker compose run --rm web python manage.py migrate finance`
Expected: both `0002_shopprofile` and `0003_seed_shopprofile` apply cleanly with no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/finance/models.py backend/finance/migrations/0002_shopprofile.py backend/finance/migrations/0003_seed_shopprofile.py
git commit -m "feat(finance): add ShopProfile singleton model, seeded with current business info"
```

---

## Task 2: Backend — `ShopProfile` read API

**Files:**
- Modify: `../backend/finance/serializers.py`
- Modify: `../backend/finance/views.py`
- Modify: `../backend/finance/urls.py`
- Modify: `../backend/finance/admin.py`
- Create: `../backend/finance/tests/test_shop_profile_api.py`

**Interfaces:**
- Consumes: `finance.models.ShopProfile` (Task 1).
- Produces: `GET /api/shop-profile/` → `{business_name, tin, po_box, phone, email, address}`, `IsAuthenticated`-gated (any logged-in employee, not admin-only — every POS role needs it for receipts).

- [ ] **Step 1: Write the failing API test**

Create `../backend/finance/tests/test_shop_profile_api.py`:

```python
import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from finance.models import ShopProfile

pytestmark = pytest.mark.django_db


def auth_client(employee, password):
    client = APIClient()
    response = client.post(
        "/api/auth/login/", {"username": employee.username, "password": password}, format="json"
    )
    token = response.json()["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.fixture
def staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


def test_returns_seeded_business_info(staff):
    ShopProfile.objects.filter(pk=1).update(
        business_name="Promise Electronic Shop", tin="123456789",
        po_box="PO Box 1", phone="+250700000000", email="shop@example.com",
        address="Kigali, Rwanda",
    )
    client = auth_client(staff, "staffpass")
    response = client.get("/api/shop-profile/")
    assert response.status_code == 200
    body = response.json()
    assert body["business_name"] == "Promise Electronic Shop"
    assert body["tin"] == "123456789"
    assert body["address"] == "Kigali, Rwanda"


def test_creates_default_profile_when_none_exists(staff):
    ShopProfile.objects.filter(pk=1).delete()
    client = auth_client(staff, "staffpass")
    response = client.get("/api/shop-profile/")
    assert response.status_code == 200
    assert response.json()["business_name"] == "Promise Electronic Shop"


def test_unauthenticated_request_returns_401():
    client = APIClient()
    response = client.get("/api/shop-profile/")
    assert response.status_code == 401
```

- [ ] **Step 2: Run to verify it fails**

Run: `docker compose run --rm web pytest finance/tests/test_shop_profile_api.py -v`
Expected: FAIL — `/api/shop-profile/` returns 404 (route doesn't exist yet).

- [ ] **Step 3: Add the serializer, view, URL, and admin registration**

Append to `../backend/finance/serializers.py`:

```python
from finance.models import ShopProfile


class ShopProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopProfile
        fields = ["business_name", "tin", "po_box", "phone", "email", "address"]
        read_only_fields = fields
```

(Add `ShopProfile` to the existing `from finance.models import Expense` import line rather than a second import line.)

Append to `../backend/finance/views.py`:

```python
from rest_framework.generics import RetrieveAPIView
from rest_framework.permissions import IsAuthenticated

from finance.models import ShopProfile
from finance.serializers import ShopProfileSerializer


class ShopProfileView(RetrieveAPIView):
    serializer_class = ShopProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        obj, _ = ShopProfile.objects.get_or_create(
            pk=1, defaults={"business_name": "Promise Electronic Shop"}
        )
        return obj
```

Replace `../backend/finance/urls.py` entirely with:

```python
from django.urls import path
from rest_framework.routers import DefaultRouter

from finance.views import ExpenseViewSet, ShopProfileView

router = DefaultRouter()
router.register("expenses", ExpenseViewSet, basename="expense")

urlpatterns = router.urls + [
    path("shop-profile/", ShopProfileView.as_view(), name="shop-profile"),
]
```

Replace `../backend/finance/admin.py` entirely with:

```python
from django.contrib import admin
from finance.models import Expense, ShopProfile

admin.site.register(Expense)
admin.site.register(ShopProfile)
```

- [ ] **Step 4: Run to verify it passes**

Run: `docker compose run --rm web pytest finance/tests/test_shop_profile_api.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full finance test suite to confirm no regressions**

Run: `docker compose run --rm web pytest finance/ -v`
Expected: all pass, including existing `test_expense_api.py`/`test_models.py`.

- [ ] **Step 6: Commit**

```bash
git add backend/finance/serializers.py backend/finance/views.py backend/finance/urls.py backend/finance/admin.py backend/finance/tests/test_shop_profile_api.py
git commit -m "feat(finance): expose GET /api/shop-profile/ for the sample receipt's business header"
```

---

## Task 3: Backend — `Product.tax_category`

**Files:**
- Modify: `../backend/catalog/models.py`
- Create: `../backend/catalog/migrations/0005_product_tax_category.py` (generated)
- Modify: `../backend/catalog/serializers.py`
- Modify: `../backend/catalog/tests/test_product_api.py`

**Interfaces:**
- Produces: `Product.tax_category: "A" | "B"` (default `"B"`), exposed read/write in `ProductSerializer`. `Product.TaxCategory.EXEMPT = "A"`, `Product.TaxCategory.STANDARD = "B"`.

- [ ] **Step 1: Write the failing test**

Append to `../backend/catalog/tests/test_product_api.py` (reuses the file's existing `auth_client`/`sales_staff`/`category` fixtures):

```python
def test_product_defaults_to_standard_tax_category(sales_staff, category):
    client = auth_client(sales_staff, "staffpass")
    response = client.post(
        "/api/products/", {"category": category.category_id, "name": "First"}, format="json"
    )
    assert response.json()["tax_category"] == "B"


def test_product_tax_category_can_be_set_to_exempt(sales_staff, category):
    client = auth_client(sales_staff, "staffpass")
    response = client.post(
        "/api/products/",
        {"category": category.category_id, "name": "Bread", "tax_category": "A"},
        format="json",
    )
    assert response.json()["tax_category"] == "A"
```

- [ ] **Step 2: Run to verify it fails**

Run: `docker compose run --rm web pytest catalog/tests/test_product_api.py -v -k tax_category`
Expected: FAIL — `KeyError`/missing `"tax_category"` in the response body.

- [ ] **Step 3: Add the field**

In `../backend/catalog/models.py`, inside the `Product` class, add above `unit`:

```python
    class TaxCategory(models.TextChoices):
        EXEMPT = "A", "Exempt (0%)"
        STANDARD = "B", "Standard (18%)"

    tax_category = models.CharField(max_length=1, choices=TaxCategory.choices, default=TaxCategory.STANDARD)
```

In `../backend/catalog/serializers.py`, add `"tax_category"` to `ProductSerializer.Meta.fields`, right after `"unit"`:

```python
        fields = [
            "product_id", "category", "barcode", "name", "brand", "model_number",
            "description", "specifications", "usage_instructions", "warranty_months",
            "reorder_level", "unit", "tax_category", "is_active", "created_at",
        ]
```

- [ ] **Step 4: Generate and apply the migration**

Run: `docker compose run --rm web python manage.py makemigrations catalog`
Expected: creates `catalog/migrations/0005_product_tax_category.py`.

Run: `docker compose run --rm web python manage.py migrate catalog`
Expected: applies cleanly.

- [ ] **Step 5: Run to verify it passes**

Run: `docker compose run --rm web pytest catalog/tests/test_product_api.py -v`
Expected: PASS (all tests in the file, including the two new ones).

- [ ] **Step 6: Commit**

```bash
git add backend/catalog/models.py backend/catalog/migrations/0005_product_tax_category.py backend/catalog/serializers.py backend/catalog/tests/test_product_api.py
git commit -m "feat(catalog): add Product.tax_category (Rwanda VAT: A=exempt, B=standard 18%)"
```

---

## Task 4: Backend — `SaleItem` tax fields + computation at sale time

**Files:**
- Modify: `../backend/sales/models.py`
- Create: `../backend/sales/migrations/0003_saleitem_tax_fields.py` (generated)
- Modify: `../backend/sales/services.py`
- Modify: `../backend/sales/serializers.py`
- Modify: `../backend/sales/tests/test_services.py`

**Interfaces:**
- Consumes: `Product.tax_category` (Task 3).
- Produces: `SaleItem.tax_category: "A" | "B"`, `SaleItem.tax_amount: Decimal` (2 dp), computed in `complete_sale()` from the product's tax category at sale time — same pattern as `unit_price`/`subtotal`.

- [ ] **Step 1: Write the failing test**

Append to `../backend/sales/tests/test_services.py` (reuses the file's existing `employee`/`admin`/`category`/`make_product_with_stock` fixtures):

```python
def test_complete_sale_computes_tax_for_standard_category(employee, admin, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 2}],
    )
    item = SaleItem.objects.get(sale=sale)
    assert item.tax_category == "B"
    assert item.tax_amount == Decimal("36.00")


def test_complete_sale_computes_zero_tax_for_exempt_category(employee, admin, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    product.tax_category = "A"
    product.save(update_fields=["tax_category"])
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 1}],
    )
    item = SaleItem.objects.get(sale=sale)
    assert item.tax_category == "A"
    assert item.tax_amount == Decimal("0.00")
```

- [ ] **Step 2: Run to verify it fails**

Run: `docker compose run --rm web pytest sales/tests/test_services.py -v -k tax`
Expected: FAIL — `SaleItem` has no field `tax_category`/`tax_amount`.

- [ ] **Step 3: Add the fields**

In `../backend/sales/models.py`, add the import and field to `SaleItem`:

```python
from catalog.models import Product
```

(add near the top, alongside the existing `from django.db import models`)

```python
class SaleItem(models.Model):
    sale_item_id = models.AutoField(primary_key=True)
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT, related_name="sale_items")
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    tax_category = models.CharField(max_length=1, choices=Product.TaxCategory.choices)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f"{self.product} x{self.quantity} (Sale #{self.sale_id})"
```

- [ ] **Step 4: Compute tax in `complete_sale`**

In `../backend/sales/services.py`, add the rate table near the top (after the imports):

```python
TAX_RATES = {
    "A": Decimal("0.00"),
    "B": Decimal("0.18"),
}
```

Replace the resolved-items loop and the `SaleItem.objects.create` loop inside `complete_sale`:

```python
        resolved_items = []
        total = Decimal("0.00")
        for entry in items:
            product = entry["product"]
            quantity = entry["quantity"]
            unit_price = _resolve_retail_price(product)
            subtotal = unit_price * quantity
            tax_amount = (subtotal * TAX_RATES[product.tax_category]).quantize(Decimal("0.01"))
            resolved_items.append((product, quantity, unit_price, subtotal, tax_amount))
            total += subtotal

        sale = Sale.objects.create(
            customer=customer, employee=employee, payment_method=payment_method,
            total_amount=total,
        )

        for product, quantity, unit_price, subtotal, tax_amount in resolved_items:
            SaleItem.objects.create(
                sale=sale, product=product, quantity=quantity,
                unit_price=unit_price, subtotal=subtotal,
                tax_category=product.tax_category, tax_amount=tax_amount,
            )
```

- [ ] **Step 5: Expose the new fields in the serializer**

In `../backend/sales/serializers.py`, add `"tax_category"` and `"tax_amount"` to `SaleItemSerializer.Meta.fields`:

```python
class SaleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleItem
        fields = [
            "sale_item_id", "sale", "product", "quantity", "unit_price", "subtotal",
            "tax_category", "tax_amount",
        ]
        read_only_fields = fields
```

- [ ] **Step 6: Generate and apply the migration**

Run: `docker compose run --rm web python manage.py makemigrations sales`
Expected: creates `sales/migrations/0003_saleitem_tax_fields.py`. Since `tax_category`/`tax_amount` are non-nullable with no default and the table may have existing rows in a real deployed DB, if Django's makemigrations prompts for a one-off default for existing rows, supply `"B"` for `tax_category` and `Decimal("0.00")`/`0` for `tax_amount` at the prompt (this only back-fills pre-existing sale history with a defensible default — new sales always compute real values going forward).

Run: `docker compose run --rm web python manage.py migrate sales`
Expected: applies cleanly.

- [ ] **Step 7: Run to verify it passes**

Run: `docker compose run --rm web pytest sales/ -v`
Expected: PASS — the two new tests, plus every pre-existing test in `sales/tests/` (they don't assert on tax fields, so they're unaffected by the additive change).

- [ ] **Step 8: Commit**

```bash
git add backend/sales/models.py backend/sales/migrations/0003_saleitem_tax_fields.py backend/sales/services.py backend/sales/serializers.py backend/sales/tests/test_services.py
git commit -m "feat(sales): compute SaleItem.tax_category/tax_amount at sale time from the product's VAT category"
```

---

## Task 5: Frontend — types + `useShopProfile` hook

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/settings/useShopProfile.ts`
- Create: `lib/settings/useShopProfile.test.tsx`

**Interfaces:**
- Consumes: `GET /api/shop-profile/` (Task 2), via `apiFetch<ShopProfile>("shop-profile/")`.
- Produces: `ShopProfile` type; `useShopProfile(): { data: ShopProfile | undefined; isLoading: boolean; isError: boolean }`.

- [ ] **Step 1: Update the types**

In `lib/types.ts`, add `tax_category: "A" | "B";` to the `Product` interface, right after `unit: string;`:

```ts
export interface Product {
  product_id: number;
  category: number;
  barcode: string;
  name: string;
  brand: string | null;
  model_number: string | null;
  description: string | null;
  specifications: string | null;
  usage_instructions: string | null;
  warranty_months: number | null;
  reorder_level: number;
  unit: string;
  tax_category: "A" | "B";
  is_active: boolean;
  created_at: string;
}
```

Add `tax_category: "A" | "B";` and `tax_amount: string;` to `SaleItem`, right after `subtotal: string;`:

```ts
export interface SaleItem {
  sale_item_id: number;
  sale: number;
  product: number;
  quantity: number;
  unit_price: string;
  subtotal: string;
  tax_category: "A" | "B";
  tax_amount: string;
}
```

Add a new `ShopProfile` interface (place it near `Customer`/`Supplier`, which are similarly-shaped business-record types):

```ts
export interface ShopProfile {
  business_name: string;
  tin: string | null;
  po_box: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}
```

- [ ] **Step 2: Write the failing hook test**

Create `lib/settings/useShopProfile.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useShopProfile } from "./useShopProfile";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useShopProfile", () => {
  it("fetches and exposes the shop profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            business_name: "Promise Electronic Shop",
            tin: "123456789",
            po_box: "PO Box 1",
            phone: "+250700000000",
            email: "shop@example.com",
            address: "Kigali, Rwanda",
          }),
        })
      )
    );
    const { result } = renderHook(() => useShopProfile(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.business_name).toBe("Promise Electronic Shop");
    expect(result.current.isError).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run lib/settings/useShopProfile.test.tsx`
Expected: FAIL — cannot find module `./useShopProfile`.

- [ ] **Step 4: Implement the hook**

Create `lib/settings/useShopProfile.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ShopProfile } from "@/lib/types";

export interface UseShopProfileResult {
  data: ShopProfile | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function useShopProfile(): UseShopProfileResult {
  const query = useQuery({
    queryKey: ["shop-profile"],
    queryFn: () => apiFetch<ShopProfile>("shop-profile/"),
  });

  return { data: query.data, isLoading: query.isLoading, isError: query.isError };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run lib/settings/useShopProfile.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/settings/useShopProfile.ts frontend/lib/settings/useShopProfile.test.tsx
git commit -m "feat(settings): add ShopProfile type and useShopProfile hook; add tax_category to Product/SaleItem"
```

---

## Task 6: Frontend — generalize the print CSS to `.print-target`

**Files:**
- Modify: `app/globals.css`
- Modify: `components/pos/Receipt.tsx`
- Modify: `components/products/InfoSheetCard.tsx`

**Interfaces:**
- Produces: `.print-target` CSS class, replacing `.receipt-print` and `.info-sheet-print`. Any future print flow (labels, Task 8) uses this same class.

- [ ] **Step 1: Replace the print CSS block**

In `app/globals.css`, replace the entire `@media print { ... }` block with:

```css
@media print {
  @page {
    size: A4;
    margin: 10mm;
  }
  body * {
    visibility: hidden;
  }
  body:has(.print-target) .print-target,
  body:has(.print-target) .print-target * {
    visibility: visible;
  }
  .print-target {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
  }
}
```

- [ ] **Step 2: Rename the class in both consumers**

In `components/pos/Receipt.tsx`, change:

```tsx
      <div className="receipt-print bg-surface rounded-md p-6 shadow-sm">
```

to:

```tsx
      <div className="print-target bg-surface rounded-md p-6 shadow-sm">
```

In `components/products/InfoSheetCard.tsx`, change:

```tsx
      <p className="info-sheet-print text-sm opacity-85 m-0">
```

to:

```tsx
      <p className="print-target text-sm opacity-85 m-0">
```

- [ ] **Step 3: Run the existing tests for both consumers to confirm no regression**

Run: `npx vitest run components/pos/Receipt.test.tsx components/products/InfoSheetCard.test.tsx`
Expected: PASS — neither test file asserts on the class name, only on visible text/behavior.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/globals.css frontend/components/pos/Receipt.tsx frontend/components/products/InfoSheetCard.tsx
git commit -m "refactor(print): unify receipt/info-sheet print CSS into one shared .print-target mechanism"
```

---

## Task 7: Frontend — `Barcode` component

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `components/ui/Barcode.tsx`
- Create: `components/ui/Barcode.test.tsx`

**Interfaces:**
- Produces: `<Barcode value={string} height?={number} fontSize?={number} />` — renders an inline SVG Code128 barcode with `role="img"` and an `aria-label`.

- [ ] **Step 1: Add the dependency**

Run: `npm install jsbarcode@^3.12.3`
Run: `npm install --save-dev @types/jsbarcode@^3.11.4`

- [ ] **Step 2: Write the failing test**

Create `components/ui/Barcode.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Barcode } from "./Barcode";

describe("Barcode", () => {
  it("renders an SVG barcode for the given value", () => {
    const { container } = render(<Barcode value="PES-TV-00082" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-label", "Barcode for PES-TV-00082");
    expect(svg?.querySelectorAll("rect").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run components/ui/Barcode.test.tsx`
Expected: FAIL — cannot find module `./Barcode`.

- [ ] **Step 4: Implement the component**

Create `components/ui/Barcode.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeProps {
  value: string;
  height?: number;
  fontSize?: number;
}

export function Barcode({ value, height = 40, fontSize = 12 }: BarcodeProps) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, {
      format: "CODE128",
      height,
      fontSize,
      margin: 4,
      displayValue: true,
    });
  }, [value, height, fontSize]);

  return <svg ref={ref} role="img" aria-label={`Barcode for ${value}`} />;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run components/ui/Barcode.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/components/ui/Barcode.tsx frontend/components/ui/Barcode.test.tsx
git commit -m "feat(ui): add Barcode component (jsbarcode Code128) for product SKUs and unit serials"
```

---

## Task 8: Frontend — `LabelSheet` printable grid

**Files:**
- Create: `components/ui/LabelSheet.tsx`
- Create: `components/ui/LabelSheet.test.tsx`

**Interfaces:**
- Consumes: `.print-target` (Task 6).
- Produces: `<LabelSheet>{children}</LabelSheet>` — a `.print-target` grid (3 columns, 33.9mm rows), `hidden` on screen and `grid` only under print, so mounting it never disturbs normal page layout.

- [ ] **Step 1: Write the failing test**

Create `components/ui/LabelSheet.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LabelSheet } from "./LabelSheet";

describe("LabelSheet", () => {
  it("renders its children inside a print-target grid, hidden outside of print", () => {
    const { container } = render(
      <LabelSheet>
        <div>Label A</div>
        <div>Label B</div>
      </LabelSheet>
    );
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass("print-target");
    expect(root).toHaveClass("hidden");
    expect(root.children).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/ui/LabelSheet.test.tsx`
Expected: FAIL — cannot find module `./LabelSheet`.

- [ ] **Step 3: Implement the component**

Create `components/ui/LabelSheet.tsx`:

```tsx
import type { ReactNode } from "react";

interface LabelSheetProps {
  children: ReactNode;
}

export function LabelSheet({ children }: LabelSheetProps) {
  return (
    <div className="print-target hidden print:grid grid-cols-3 auto-rows-[33.9mm] gap-0 justify-items-center">
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/ui/LabelSheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/ui/LabelSheet.tsx frontend/components/ui/LabelSheet.test.tsx
git commit -m "feat(ui): add LabelSheet — a print-only A4 grid for barcode labels"
```

---

## Task 9: Frontend — `ProductLabel` and `UnitLabel`

**Files:**
- Create: `components/products/ProductLabel.tsx`
- Create: `components/products/ProductLabel.test.tsx`
- Create: `components/stock/UnitLabel.tsx`
- Create: `components/stock/UnitLabel.test.tsx`

**Interfaces:**
- Consumes: `Barcode` (Task 7).
- Produces: `<ProductLabel product={{name, barcode, retail_price}} />`, `<UnitLabel productName={string} serialNumber={string} />` — both a fixed 63.5mm × 33.9mm cell matching `LabelSheet`'s grid.

- [ ] **Step 1: Write the failing tests**

Create `components/products/ProductLabel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductLabel } from "./ProductLabel";

describe("ProductLabel", () => {
  it("renders the product name, price, and a barcode", () => {
    render(<ProductLabel product={{ name: "JBL Flip 6", barcode: "PES-AUD-00147", retail_price: 145000 }} />);
    expect(screen.getByText("JBL Flip 6")).toBeInTheDocument();
    expect(screen.getByText("RWF 145,000")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Barcode for PES-AUD-00147" })).toBeInTheDocument();
  });
});
```

Create `components/stock/UnitLabel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UnitLabel } from "./UnitLabel";

describe("UnitLabel", () => {
  it("renders the product name and a barcode for the serial number", () => {
    render(<UnitLabel productName="JBL Flip 6 Speaker" serialNumber="JBL6-KX2201" />);
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Barcode for JBL6-KX2201" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify both fail**

Run: `npx vitest run components/products/ProductLabel.test.tsx components/stock/UnitLabel.test.tsx`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement both components**

Create `components/products/ProductLabel.tsx`:

```tsx
import { Barcode } from "@/components/ui/Barcode";

interface ProductLabelProps {
  product: {
    name: string;
    barcode: string;
    retail_price: number;
  };
}

export function ProductLabel({ product }: ProductLabelProps) {
  return (
    <div className="w-[63.5mm] h-[33.9mm] flex flex-col items-center justify-center gap-0.5 p-1 border border-dashed border-neutral-300 print:border-none overflow-hidden">
      <span className="text-xs font-medium text-center truncate w-full">{product.name}</span>
      <span className="text-xs">RWF {product.retail_price.toLocaleString()}</span>
      <Barcode value={product.barcode} height={28} fontSize={10} />
    </div>
  );
}
```

Create `components/stock/UnitLabel.tsx`:

```tsx
import { Barcode } from "@/components/ui/Barcode";

interface UnitLabelProps {
  productName: string;
  serialNumber: string;
}

export function UnitLabel({ productName, serialNumber }: UnitLabelProps) {
  return (
    <div className="w-[63.5mm] h-[33.9mm] flex flex-col items-center justify-center gap-0.5 p-1 border border-dashed border-neutral-300 print:border-none overflow-hidden">
      <span className="text-xs font-medium text-center truncate w-full">{productName}</span>
      <Barcode value={serialNumber} height={28} fontSize={10} />
    </div>
  );
}
```

- [ ] **Step 4: Run to verify both pass**

Run: `npx vitest run components/products/ProductLabel.test.tsx components/stock/UnitLabel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/products/ProductLabel.tsx frontend/components/products/ProductLabel.test.tsx frontend/components/stock/UnitLabel.tsx frontend/components/stock/UnitLabel.test.tsx
git commit -m "feat: add ProductLabel and UnitLabel — single-cell printable barcode labels"
```

---

## Task 10: Frontend — `tax_category` in the product form

**Files:**
- Modify: `lib/products/productForm.ts`
- Modify: `lib/products/productForm.test.ts`
- Modify: `components/products/ProductFormDialog.tsx`
- Modify: `components/products/ProductFormDialog.test.tsx`

**Interfaces:**
- Consumes: `Product.tax_category` (Task 5).
- Produces: `ProductFormValues.tax_category: "A" | "B"`, `ProductPayload.tax_category: "A" | "B"` — always included in the payload (unlike the optional numeric fields, this always has one of two valid values).

- [ ] **Step 1: Update the form-values tests first (TDD against the new shape)**

In `lib/products/productForm.test.ts`, update the `product` fixture to include the new required field:

```ts
const product: Product = {
  product_id: 1, category: 20, barcode: "PES-AUD-00147", name: "JBL Flip 6", brand: "JBL",
  model_number: "JBLFLIP6BLK", description: null, specifications: "30W RMS",
  usage_instructions: "Hold power 2s.", warranty_months: 12, reorder_level: 4, unit: "pcs",
  tax_category: "B", is_active: true, created_at: "2026-01-01T00:00:00Z",
};
```

Update the two exact-equality tests:

```ts
describe("emptyProductFormValues", () => {
  it("returns all-blank values with no category selected", () => {
    expect(emptyProductFormValues()).toEqual({
      name: "", category: "", brand: "", model_number: "", description: "",
      specifications: "", usage_instructions: "", warranty_months: "", reorder_level: "",
      unit: "", tax_category: "B", storage_location: "",
    });
  });
});

describe("productFormValuesFromProduct", () => {
  it("converts a Product into form string values, substituting empty strings for null fields", () => {
    expect(productFormValuesFromProduct(product, "Shelf B2")).toEqual({
      name: "JBL Flip 6", category: 20, brand: "JBL", model_number: "JBLFLIP6BLK",
      description: "", specifications: "30W RMS", usage_instructions: "Hold power 2s.",
      warranty_months: "12", reorder_level: "4", unit: "pcs", tax_category: "B",
      storage_location: "Shelf B2",
    });
  });

  it("uses an empty string for storage_location when none is passed", () => {
    expect(productFormValuesFromProduct(product, null).storage_location).toBe("");
  });
});
```

Add one new test to the `buildProductPayload` describe block:

```ts
  it("always includes tax_category in the payload", () => {
    const values = { ...emptyProductFormValues(), name: "New Item", category: 20 as number | "", tax_category: "A" as const };
    const payload = buildProductPayload(values, "create");
    expect(payload.tax_category).toBe("A");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/products/productForm.test.ts`
Expected: FAIL — TS shape mismatch / `tax_category` undefined.

- [ ] **Step 3: Update `productForm.ts`**

In `lib/products/productForm.ts`, add `tax_category: "A" | "B";` to `ProductFormValues` (after `unit: string;`):

```ts
export interface ProductFormValues {
  name: string;
  category: number | "";
  brand: string;
  model_number: string;
  description: string;
  specifications: string;
  usage_instructions: string;
  warranty_months: string;
  reorder_level: string;
  unit: string;
  tax_category: "A" | "B";
  storage_location: string;
}
```

Update `emptyProductFormValues`:

```ts
export function emptyProductFormValues(): ProductFormValues {
  return {
    name: "", category: "", brand: "", model_number: "", description: "",
    specifications: "", usage_instructions: "", warranty_months: "", reorder_level: "",
    unit: "", tax_category: "B", storage_location: "",
  };
}
```

Update `productFormValuesFromProduct`:

```ts
export function productFormValuesFromProduct(
  product: Product,
  storageLocation: string | null
): ProductFormValues {
  return {
    name: product.name,
    category: product.category,
    brand: product.brand ?? "",
    model_number: product.model_number ?? "",
    description: product.description ?? "",
    specifications: product.specifications ?? "",
    usage_instructions: product.usage_instructions ?? "",
    warranty_months: product.warranty_months != null ? String(product.warranty_months) : "",
    reorder_level: String(product.reorder_level),
    unit: product.unit,
    tax_category: product.tax_category,
    storage_location: storageLocation ?? "",
  };
}
```

Add `tax_category?: "A" | "B";` to `ProductPayload`, and set it unconditionally in `buildProductPayload`:

```ts
export interface ProductPayload {
  name: string;
  category?: number;
  brand: string | null;
  model_number: string | null;
  description: string | null;
  specifications: string | null;
  usage_instructions: string | null;
  warranty_months?: number;
  reorder_level?: number;
  unit?: string;
  tax_category?: "A" | "B";
}

export function buildProductPayload(
  values: ProductFormValues,
  mode: "create" | "edit"
): ProductPayload {
  const payload: ProductPayload = {
    name: values.name.trim(),
    brand: values.brand.trim() || null,
    model_number: values.model_number.trim() || null,
    description: values.description.trim() || null,
    specifications: values.specifications.trim() || null,
    usage_instructions: values.usage_instructions.trim() || null,
    tax_category: values.tax_category,
  };
  if (mode === "create" && values.category !== "") {
    payload.category = values.category;
  }
  if (values.warranty_months.trim() !== "") {
    payload.warranty_months = Number(values.warranty_months);
  }
  if (values.reorder_level.trim() !== "") {
    payload.reorder_level = Number(values.reorder_level);
  }
  if (values.unit.trim() !== "") {
    payload.unit = values.unit.trim();
  }
  return payload;
}
```

- [ ] **Step 4: Run to verify `productForm.test.ts` passes**

Run: `npx vitest run lib/products/productForm.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `ProductFormDialog.test.tsx`'s fixtures and the payload assertion**

In `components/products/ProductFormDialog.test.tsx`, add `tax_category: "B",` to the `existingProduct` fixture (after `unit: "pcs",`):

```ts
const existingProduct: Product = {
  product_id: 1, category: 20, barcode: "PES-AUD-00147", name: "JBL Flip 6", brand: "JBL",
  model_number: "JBLFLIP6BLK", description: null, specifications: null, usage_instructions: null,
  warranty_months: 12, reorder_level: 4, unit: "pcs", tax_category: "B", is_active: true,
  created_at: "2026-01-01T00:00:00Z",
};
```

Update the parsed-body assertion in `"posts to /api/proxy/products/ and calls onSaved on successful create"` to include the new field:

```ts
    expect(JSON.parse(options.body as string)).toEqual({
      name: "New Widget", category: 20, brand: null, model_number: null,
      description: null, specifications: null, usage_instructions: null, tax_category: "B",
    });
```

- [ ] **Step 6: Add the field to the form UI**

In `components/products/ProductFormDialog.tsx`, add the import:

```tsx
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
```

Add the toggle right after the "Unit" field and before the `showStorageLocation` block:

```tsx
        <Field label="Unit" name="unit" value={values.unit} onChange={(v) => setField("unit", v)} />
        <div className="flex flex-col gap-1">
          <label className="block text-xs text-text/70">Tax category</label>
          <SegmentedToggle
            name="tax_category"
            options={[
              { value: "B", label: "Standard (18%)" },
              { value: "A", label: "Exempt (0%)" },
            ]}
            value={values.tax_category}
            onChange={(v) => setField("tax_category", v as "A" | "B")}
          />
        </div>
```

- [ ] **Step 7: Run to verify `ProductFormDialog.test.tsx` passes**

Run: `npx vitest run components/products/ProductFormDialog.test.tsx`
Expected: PASS (all tests, including the updated payload assertion).

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/products/productForm.ts frontend/lib/products/productForm.test.ts frontend/components/products/ProductFormDialog.tsx frontend/components/products/ProductFormDialog.test.tsx
git commit -m "feat(products): add a tax category toggle (Standard 18% / Exempt) to the product form"
```

---

## Task 11: Frontend — `Receipt` redesign

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `components/ui/QrCode.tsx`
- Create: `components/ui/QrCode.test.tsx`
- Modify: `components/pos/Receipt.tsx`
- Modify: `components/pos/Receipt.test.tsx`

**Interfaces:**
- Consumes: `useShopProfile` (Task 5), `Barcode` (Task 7), `SaleItem.tax_category`/`tax_amount` (Task 4/5).
- Produces: `<QrCode value={string} size?={number} />`; a redesigned `Receipt` with business header, itemized tax summary by category, and a marked-placeholder fiscal block.

- [ ] **Step 1: Add the QR dependency**

Run: `npm install qrcode@^1.5.4`
Run: `npm install --save-dev @types/qrcode@^1.5.6`

- [ ] **Step 2: Write the failing `QrCode` test**

Create `components/ui/QrCode.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QrCode } from "./QrCode";

describe("QrCode", () => {
  it("renders a QR code image once generated", async () => {
    render(<QrCode value="SAMPLE RECEIPT #841 — NOT FISCALLY VALID" />);
    const img = await screen.findByRole("img", { name: "QR code: SAMPLE RECEIPT #841 — NOT FISCALLY VALID" });
    expect(img).toHaveAttribute("src", expect.stringContaining("data:image"));
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run components/ui/QrCode.test.tsx`
Expected: FAIL — cannot find module `./QrCode`.

- [ ] **Step 4: Implement `QrCode`**

Create `components/ui/QrCode.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface QrCodeProps {
  value: string;
  size?: number;
}

export function QrCode({ value, size = 96 }: QrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1 }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) return null;
  // A generated data: URL, not a static asset — next/image can't optimize this, so a plain
  // img is the correct choice here rather than a lint workaround.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dataUrl} width={size} height={size} alt={`QR code: ${value}`} />;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run components/ui/QrCode.test.tsx`
Expected: PASS.

- [ ] **Step 6: Update `Receipt.test.tsx` for the new data shape and assertions**

Replace the top of `components/pos/Receipt.test.tsx` (imports and fixtures) with:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Receipt } from "./Receipt";
import * as useShopProfileModule from "@/lib/settings/useShopProfile";
import type { CartLine } from "@/lib/pos/cart";
import type { Sale } from "@/lib/types";

const sale: Sale = {
  sale_id: 841, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
  payment_method: "cash", total_amount: "590000.00", status: "completed",
  items: [
    { sale_item_id: 1, sale: 841, product: 1, quantity: 1, unit_price: "385000.00", subtotal: "385000.00", tax_category: "B", tax_amount: "58728.81" },
    { sale_item_id: 2, sale: 841, product: 2, quantity: 1, unit_price: "145000.00", subtotal: "145000.00", tax_category: "B", tax_amount: "22118.64" },
  ],
};

const lines: CartLine[] = [
  {
    product: {
      product_id: 1, barcode: "PES-TV-00082", name: "Samsung 43\" TV", brand: "Samsung",
      model_number: "UA43DU7000", category_name: "Televisions", retail_price: 385000, quantity_in_stock: 11,
    },
    quantity: 1,
  },
  {
    product: {
      product_id: 2, barcode: "PES-AUD-00147", name: "JBL Flip 6", brand: "JBL",
      model_number: "JBLFLIP6BLK", category_name: "Audio", retail_price: 145000, quantity_in_stock: 1,
    },
    quantity: 1,
  },
];

describe("Receipt", () => {
  beforeEach(() => {
    vi.spyOn(useShopProfileModule, "useShopProfile").mockReturnValue({
      data: {
        business_name: "Promise Electronic Shop", tin: "123456789", po_box: "PO Box 1",
        phone: "+250700000000", email: "shop@example.com", address: "Kigali, Rwanda",
      },
      isLoading: false,
      isError: false,
    });
  });

  it("renders the sale id, payment method, line items, and total", () => {
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={vi.fn()} />);
    expect(screen.getAllByText("#S-841").length).toBeGreaterThan(0);
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("e.mugisha")).toBeInTheDocument();
    expect(screen.getByText('Samsung 43" TV × 1')).toBeInTheDocument();
    expect(screen.getByText("JBL Flip 6 × 1")).toBeInTheDocument();
    expect(screen.getByText("RWF 590,000")).toBeInTheDocument();
  });

  it("renders the business info from the shop profile", () => {
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={vi.fn()} />);
    expect(screen.getByText("Promise Electronic Shop")).toBeInTheDocument();
    expect(screen.getByText("TIN 123456789")).toBeInTheDocument();
  });

  it("renders a tax summary grouped by category", () => {
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={vi.fn()} />);
    expect(screen.getByText("TOTAL B — Standard (18%)")).toBeInTheDocument();
    expect(screen.getByText("TOTAL TAX")).toBeInTheDocument();
  });

  it("shows the sample-receipt disclaimer, never a real legal-receipt claim", () => {
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={vi.fn()} />);
    expect(screen.getByText("SAMPLE RECEIPT — pending EBM/SDC certification")).toBeInTheDocument();
    expect(screen.queryByText(/END OF LEGAL RECEIPT/)).not.toBeInTheDocument();
  });

  it("calls onPrint when Print receipt is clicked", async () => {
    const onPrint = vi.fn();
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={onPrint} onNewSale={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Print receipt" }));
    expect(onPrint).toHaveBeenCalled();
  });

  it("calls onNewSale when New sale is clicked", async () => {
    const onNewSale = vi.fn();
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={onNewSale} />);
    await userEvent.click(screen.getByRole("button", { name: "New sale" }));
    expect(onNewSale).toHaveBeenCalled();
  });

  it("shows an em dash for payment method when none is set", () => {
    render(
      <Receipt
        sale={{ ...sale, payment_method: null }}
        lines={lines}
        servedBy="e.mugisha"
        onPrint={vi.fn()}
        onNewSale={vi.fn()}
      />
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run components/pos/Receipt.test.tsx`
Expected: FAIL — `Receipt` doesn't call `useShopProfile` yet, business-info/tax-summary/disclaimer text isn't rendered.

- [ ] **Step 8: Redesign `Receipt.tsx`**

Replace `components/pos/Receipt.tsx` entirely with:

```tsx
"use client";

import { Button } from "@/components/ui/Button";
import { Barcode } from "@/components/ui/Barcode";
import { QrCode } from "@/components/ui/QrCode";
import { useShopProfile } from "@/lib/settings/useShopProfile";
import type { CartLine } from "@/lib/pos/cart";
import type { PaymentMethod, Sale } from "@/lib/types";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  mobile_money: "Mobile Money",
  bank_transfer: "Bank Transfer",
};

const TAX_CATEGORY_LABELS: Record<"A" | "B", string> = {
  A: "A — Exempt (0%)",
  B: "B — Standard (18%)",
};

interface ReceiptProps {
  sale: Sale;
  lines: CartLine[];
  servedBy: string;
  onPrint: () => void;
  onNewSale: () => void;
}

interface TaxGroupTotal {
  category: "A" | "B";
  subtotal: number;
  tax: number;
}

function taxGroupTotals(sale: Sale): TaxGroupTotal[] {
  const totals = new Map<"A" | "B", TaxGroupTotal>();
  for (const item of sale.items) {
    const existing = totals.get(item.tax_category) ?? { category: item.tax_category, subtotal: 0, tax: 0 };
    existing.subtotal += Number(item.subtotal);
    existing.tax += Number(item.tax_amount);
    totals.set(item.tax_category, existing);
  }
  return Array.from(totals.values()).sort((a, b) => a.category.localeCompare(b.category));
}

export function Receipt({ sale, lines, servedBy, onPrint, onNewSale }: ReceiptProps) {
  const shopProfile = useShopProfile();
  const saleDate = new Date(sale.sale_date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const groups = taxGroupTotals(sale);
  const totalTax = groups.reduce((sum, g) => sum + g.tax, 0);
  const qrPayload = `SAMPLE RECEIPT #${sale.sale_id} — NOT FISCALLY VALID`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5 p-3 rounded-md bg-accent-900 text-accent-100 text-sm shadow-sm">
        <span className="w-2 h-2 rounded-full bg-accent" />
        Sale #S-{sale.sale_id} completed — stock updated, admin notified by email.
      </div>
      <div className="print-target bg-surface rounded-md p-6 shadow-sm text-sm max-w-[420px] mx-auto w-full">
        <div className="text-center mb-4">
          <div className="font-sans font-medium text-xl">
            {shopProfile.data?.business_name ?? "Promise Electronic Shop"}
          </div>
          {shopProfile.data?.tin && <div className="text-xs text-text/50">TIN {shopProfile.data.tin}</div>}
          {shopProfile.data?.po_box && <div className="text-xs text-text/50">{shopProfile.data.po_box}</div>}
          <div className="text-xs text-text/50">
            {[shopProfile.data?.phone, shopProfile.data?.email].filter(Boolean).join(" · ") || "—"}
          </div>
          {shopProfile.data?.address && <div className="text-xs text-text/50">{shopProfile.data.address}</div>}
        </div>

        <div className="flex justify-between">
          <span className="text-text/55">Receipt</span>
          <span className="font-mono">#S-{sale.sale_id}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text/55">Date</span>
          <span>{saleDate}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text/55">Served by</span>
          <span>{servedBy}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text/55">Payment</span>
          <span>{sale.payment_method ? PAYMENT_LABELS[sale.payment_method] : "—"}</span>
        </div>

        <hr className="border-divider my-3" />

        {sale.items.map((item) => {
          const line = lines.find((l) => l.product.product_id === item.product);
          return (
            <div key={item.sale_item_id} className="flex justify-between py-0.5">
              <span>
                {line?.product.name ?? `Product #${item.product}`} × {item.quantity}
              </span>
              <span>{Number(item.subtotal).toLocaleString()}</span>
            </div>
          );
        })}

        <hr className="border-divider my-3" />

        {groups.map((g) => (
          <div key={g.category} className="flex justify-between text-xs text-text/60">
            <span>TOTAL {TAX_CATEGORY_LABELS[g.category]}</span>
            <span>{g.subtotal.toLocaleString()}</span>
          </div>
        ))}
        <div className="flex justify-between text-xs text-text/60">
          <span>TOTAL TAX</span>
          <span>{totalTax.toLocaleString()}</span>
        </div>

        <div className="flex justify-between font-sans font-medium text-xl mt-2">
          <span>Total</span>
          <span>RWF {Number(sale.total_amount).toLocaleString()}</span>
        </div>

        <hr className="border-divider my-3" />

        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-center py-1 text-[11px] font-medium mb-2">
          SAMPLE RECEIPT — pending EBM/SDC certification
        </div>
        <div className="flex justify-between text-xs text-text/50">
          <span>SDC ID</span>
          <span>NOT-CERTIFIED</span>
        </div>
        <div className="flex justify-between text-xs text-text/50">
          <span>MRC</span>
          <span>PENDING-SETUP</span>
        </div>
        <div className="flex justify-center my-3">
          <QrCode value={qrPayload} size={88} />
        </div>
        <div className="flex justify-center mb-3">
          <Barcode value={`S-${sale.sale_id}`} height={28} fontSize={10} />
        </div>

        <p className="text-xs text-text/50 text-center mt-4">
          Murakoze! Thank you for shopping with us.
          <br />
          Warranty per product — keep this receipt.
        </p>
      </div>
      <div className="flex gap-2 justify-end print:hidden">
        <Button variant="secondary" onClick={onPrint}>
          Print receipt
        </Button>
        <Button onClick={onNewSale}>New sale</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Run to verify it passes**

Run: `npx vitest run components/pos/Receipt.test.tsx`
Expected: PASS (all 7 tests).

- [ ] **Step 10: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/components/ui/QrCode.tsx frontend/components/ui/QrCode.test.tsx frontend/components/pos/Receipt.tsx frontend/components/pos/Receipt.test.tsx
git commit -m "feat(pos): redesign the receipt — business header, itemized VAT summary, marked-sample fiscal block"
```

---

## Task 12: Frontend — product label printing (per-item + bulk)

**Files:**
- Modify: `components/products/ProductCardGrid.tsx`
- Modify: `components/products/ProductCardGrid.test.tsx`
- Modify: `app/(protected)/products/ProductsPageClient.tsx`
- Modify: `app/(protected)/products/page.test.tsx`

**Interfaces:**
- Consumes: `LabelSheet`, `ProductLabel` (Task 8/9).
- Produces: `ProductCardGridProps` gains optional `selectedIds?: Set<number>`, `onToggleSelect?: (productId: number) => void`, `onPrintLabel?: (product: CatalogProduct) => void` — each control only renders when its handler is provided, so existing callers without them are unaffected.

- [ ] **Step 1: Write the failing `ProductCardGrid` tests**

In `components/products/ProductCardGrid.test.tsx`, add the import:

```ts
import userEvent from "@testing-library/user-event";
```

Append these tests inside the `describe("ProductCardGrid", ...)` block:

```ts
  it("renders a select checkbox and calls onToggleSelect when provided", async () => {
    const onToggleSelect = vi.fn();
    render(
      <ProductCardGrid
        products={products}
        showWholesale={false}
        selectedIds={new Set()}
        onToggleSelect={onToggleSelect}
      />
    );
    await userEvent.click(screen.getByLabelText("Select Samsung TV"));
    expect(onToggleSelect).toHaveBeenCalledWith(1);
  });

  it("renders a Print label action and calls onPrintLabel with the product when provided", async () => {
    const onPrintLabel = vi.fn();
    render(<ProductCardGrid products={products} showWholesale={false} onPrintLabel={onPrintLabel} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Print label" })[0]);
    expect(onPrintLabel).toHaveBeenCalledWith(products[0]);
  });

  it("does not render selection or print-label controls when their handlers are omitted", () => {
    render(<ProductCardGrid products={products} showWholesale={false} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Print label" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run components/products/ProductCardGrid.test.tsx`
Expected: FAIL — no checkbox/"Print label" button exist yet.

- [ ] **Step 3: Add selection and print-label props to `ProductCardGrid`**

Replace `components/products/ProductCardGrid.tsx` entirely with:

```tsx
import Link from "next/link";
import { Card, CardKicker, CardTitle, CardMeta } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import type { CatalogProduct } from "@/lib/products/useCatalogProducts";

const STATUS_TAG: Record<CatalogProduct["status"], { label: string; variant: "accent" | "outline" | "neutral" }> = {
  ok: { label: "OK", variant: "accent" },
  low_stock: { label: "Low stock", variant: "outline" },
  out_of_stock: { label: "Out of stock", variant: "neutral" },
};

interface ProductCardGridProps {
  products: CatalogProduct[];
  showWholesale: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (productId: number) => void;
  onPrintLabel?: (product: CatalogProduct) => void;
}

export function ProductCardGrid({
  products,
  showWholesale,
  selectedIds,
  onToggleSelect,
  onPrintLabel,
}: ProductCardGridProps) {
  if (products.length === 0) {
    return <p className="text-sm text-text/50">No products found</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {products.map((p) => {
        const tag = STATUS_TAG[p.status];
        return (
          <Card key={p.product_id} elevation="sm" className="h-full">
            <div className="flex items-start gap-2">
              {onToggleSelect && (
                <input
                  type="checkbox"
                  aria-label={`Select ${p.name}`}
                  checked={selectedIds?.has(p.product_id) ?? false}
                  onChange={() => onToggleSelect(p.product_id)}
                  className="mt-1"
                />
              )}
              <CardKicker>{p.category_name}</CardKicker>
            </div>
            <CardTitle>{p.name}</CardTitle>
            <CardMeta>
              {p.brand} · {p.model_number}
            </CardMeta>
            <span className="font-mono text-xs text-text/50">{p.barcode}</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-sans font-medium text-lg">{p.retail_price.toLocaleString()}</span>
              {showWholesale && p.wholesale_price != null && (
                <span className="text-xs text-text/50">wholesale {p.wholesale_price.toLocaleString()}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-auto pt-1">
              <span className="text-xs text-text/50">{p.quantity_in_stock} in stock</span>
              <Tag variant={tag.variant} className="ml-auto">
                {tag.label}
              </Tag>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Link href={`/products/${p.product_id}`} className="text-sm text-accent">
                Open →
              </Link>
              {onPrintLabel && (
                <button
                  type="button"
                  className="text-xs text-accent underline"
                  onClick={() => onPrintLabel(p)}
                >
                  Print label
                </button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify `ProductCardGrid.test.tsx` passes**

Run: `npx vitest run components/products/ProductCardGrid.test.tsx`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 5: Write the failing `ProductsPageClient` tests**

Append to `app/(protected)/products/page.test.tsx`, inside the `describe("ProductsPageClient", ...)` block:

```ts
  it("selecting products shows a bulk print bar and prints their labels", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.click(screen.getByLabelText("Select Samsung TV"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Print 1 labels" }));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("prints a single product's label from its card", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.click(screen.getAllByRole("button", { name: "Print label" })[0]);
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
```

- [ ] **Step 6: Run to verify they fail**

Run: `npx vitest run app/\(protected\)/products/page.test.tsx`
Expected: FAIL — no selection UI or print buttons on the page yet.

- [ ] **Step 7: Wire selection, bulk bar, and label printing into `ProductsPageClient`**

In `app/(protected)/products/ProductsPageClient.tsx`, change the React import and add the new imports:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useCatalogProducts, type CatalogProduct } from "@/lib/products/useCatalogProducts";
import { ProductTable } from "@/components/products/ProductTable";
import { ProductCardGrid } from "@/components/products/ProductCardGrid";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { CardGridSkeleton } from "@/components/ui/CardGridSkeleton";
import { LabelSheet } from "@/components/ui/LabelSheet";
import { ProductLabel } from "@/components/products/ProductLabel";
import type { EmployeeRole } from "@/lib/types";
```

Add selection/print state right after the existing `useState` declarations:

```tsx
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [printQueue, setPrintQueue] = useState<CatalogProduct[] | null>(null);

  useEffect(() => {
    if (printQueue) window.print();
  }, [printQueue]);

  function toggleSelect(productId: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }
```

Add the bulk-print bar right after `</PageHeader>` and before the `{view === "grid" ? ...}` block:

```tsx
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded-md bg-accent/10 text-sm">
          <span>{selectedIds.size} selected</span>
          <Button
            variant="secondary"
            className="ml-auto"
            onClick={() => setPrintQueue(filtered.filter((p) => selectedIds.has(p.product_id)))}
          >
            Print {selectedIds.size} labels
          </Button>
        </div>
      )}
```

Wire the new props into `ProductCardGrid`, and mount the `LabelSheet` after `ProductFormDialog`:

```tsx
      {view === "grid" ? (
        <ProductCardGrid
          products={filtered}
          showWholesale={isAdmin}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onPrintLabel={(product) => setPrintQueue([product])}
        />
      ) : (
        <ProductTable products={filtered} showWholesale={isAdmin} />
      )}
      <ProductFormDialog
        open={createOpen}
        mode="create"
        categories={catalog.categories}
        onClose={() => setCreateOpen(false)}
        onSaved={() => setCreateOpen(false)}
      />
      {printQueue && (
        <LabelSheet>
          {printQueue.map((p) => (
            <ProductLabel key={p.product_id} product={p} />
          ))}
        </LabelSheet>
      )}
```

- [ ] **Step 8: Run to verify `page.test.tsx` passes**

Run: `npx vitest run "app/(protected)/products/page.test.tsx"`
Expected: PASS (all tests, including the 2 new ones).

- [ ] **Step 9: Commit**

```bash
git add frontend/components/products/ProductCardGrid.tsx frontend/components/products/ProductCardGrid.test.tsx "frontend/app/(protected)/products/ProductsPageClient.tsx" "frontend/app/(protected)/products/page.test.tsx"
git commit -m "feat(products): per-item and bulk barcode label printing from the product grid"
```

---

## Task 13: Frontend — equipment unit label printing (per-item + bulk)

**Files:**
- Modify: `components/stock/SerializedUnitsTable.tsx`
- Modify: `components/stock/SerializedUnitsTable.test.tsx`
- Modify: `app/(protected)/stock/StockPageClient.tsx`
- Modify: `app/(protected)/stock/StockPageClient.test.tsx`

**Interfaces:**
- Consumes: `LabelSheet`, `UnitLabel` (Task 8/9).
- Produces: `SerializedUnitsTableProps` gains optional `selectedIds?: Set<number>`, `onToggleSelect?: (unitId: number) => void`, `onPrintLabel?: (unit: EquipmentUnit) => void`.

- [ ] **Step 1: Write the failing `SerializedUnitsTable` tests**

In `components/stock/SerializedUnitsTable.test.tsx`, add the import:

```ts
import userEvent from "@testing-library/user-event";
```

Append inside the `describe("SerializedUnitsTable", ...)` block:

```ts
  it("renders a select checkbox and calls onToggleSelect when provided", async () => {
    const onToggleSelect = vi.fn();
    render(<SerializedUnitsTable units={units} selectedIds={new Set()} onToggleSelect={onToggleSelect} />);
    await userEvent.click(screen.getByLabelText("Select JBL6-KX2201"));
    expect(onToggleSelect).toHaveBeenCalledWith(1);
  });

  it("renders a Print label action and calls onPrintLabel with the unit when provided", async () => {
    const onPrintLabel = vi.fn();
    render(<SerializedUnitsTable units={units} onPrintLabel={onPrintLabel} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Print label" })[0]);
    expect(onPrintLabel).toHaveBeenCalledWith(units[0]);
  });
```

(This file's `vi` import must already include `vi` — confirm the top-level `import { describe, expect, it } from "vitest";` becomes `import { describe, expect, it, vi } from "vitest";`.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run components/stock/SerializedUnitsTable.test.tsx`
Expected: FAIL — no checkbox/"Print label" column exists yet.

- [ ] **Step 3: Add selection and print-label columns**

Replace `components/stock/SerializedUnitsTable.tsx` entirely with:

```tsx
"use client";

import Link from "next/link";
import { Table } from "@/components/ui/Table";
import { Tag } from "@/components/ui/Tag";
import type { EquipmentUnit, EquipmentUnitStatus } from "@/lib/types";

const STATUS_TAG: Record<EquipmentUnitStatus, { label: string; variant: "accent" | "outline" | "neutral" }> = {
  in_stock: { label: "in stock", variant: "accent" },
  in_use: { label: "in use", variant: "outline" },
  under_repair: { label: "under repair", variant: "outline" },
  damaged: { label: "damaged", variant: "neutral" },
  sold: { label: "sold", variant: "neutral" },
};

interface SerializedUnitsTableProps {
  units: EquipmentUnit[];
  selectedIds?: Set<number>;
  onToggleSelect?: (unitId: number) => void;
  onPrintLabel?: (unit: EquipmentUnit) => void;
}

export function SerializedUnitsTable({ units, selectedIds, onToggleSelect, onPrintLabel }: SerializedUnitsTableProps) {
  const columns = [
    ...(onToggleSelect
      ? [
          {
            key: "select",
            header: "",
            render: (unit: EquipmentUnit) => (
              <input
                type="checkbox"
                aria-label={`Select ${unit.serial_number}`}
                checked={selectedIds?.has(unit.unit_id) ?? false}
                onChange={() => onToggleSelect(unit.unit_id)}
              />
            ),
          },
        ]
      : []),
    {
      key: "serial_number",
      header: "Serial",
      render: (unit: EquipmentUnit) => <span className="font-mono text-xs">{unit.serial_number}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (unit: EquipmentUnit) => {
        const tag = unit.status ? STATUS_TAG[unit.status] : undefined;
        return tag ? <Tag variant={tag.variant}>{tag.label}</Tag> : "—";
      },
    },
    {
      key: "storage_location",
      header: "Location",
      render: (unit: EquipmentUnit) => unit.storage_location ?? "—",
    },
    {
      key: "condition_notes",
      header: "Condition notes",
      render: (unit: EquipmentUnit) => <span className="text-text/50">{unit.condition_notes ?? "—"}</span>,
    },
    ...(onPrintLabel
      ? [
          {
            key: "print",
            header: "",
            render: (unit: EquipmentUnit) => (
              <button
                type="button"
                className="text-xs text-accent underline"
                onClick={() => onPrintLabel(unit)}
              >
                Print label
              </button>
            ),
          },
        ]
      : []),
    {
      key: "history",
      header: "",
      render: (unit: EquipmentUnit) => (
        <Link href={`/stock/units/${unit.unit_id}`} className="text-xs text-accent">
          History
        </Link>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={units}
      rowKey={(unit) => String(unit.unit_id)}
      emptyMessage="No serialized units for this product"
    />
  );
}
```

- [ ] **Step 4: Run to verify `SerializedUnitsTable.test.tsx` passes**

Run: `npx vitest run components/stock/SerializedUnitsTable.test.tsx`
Expected: PASS (all tests, including the 2 new ones).

- [ ] **Step 5: Write the failing `StockPageClient` tests**

Append to `app/(protected)/stock/StockPageClient.test.tsx`, inside the `describe("StockPageClient", ...)` block (reuses the file's existing `rows`/mocked `useEquipmentUnits` fixture, which already includes a unit with `serial_number: "JBL6-KX2201"`):

```ts
  it("selecting units shows a bulk print bar and prints their labels", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    renderWithProviders(<StockPageClient />);
    await userEvent.click(screen.getByRole("button", { name: "4 units" }));
    await userEvent.click(screen.getByLabelText("Select JBL6-KX2201"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Print 1 labels" }));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("prints a single unit's label from its row", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    renderWithProviders(<StockPageClient />);
    await userEvent.click(screen.getByRole("button", { name: "4 units" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Print label" })[0]);
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
```

- [ ] **Step 6: Run to verify they fail**

Run: `npx vitest run "app/(protected)/stock/StockPageClient.test.tsx"`
Expected: FAIL — no selection UI or print buttons on the page yet.

- [ ] **Step 7: Wire selection, bulk bar, and label printing into `StockPageClient`**

Replace `app/(protected)/stock/StockPageClient.tsx` entirely with:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStockOverview } from "@/lib/stock/useStockOverview";
import { useEquipmentUnits } from "@/lib/stock/useEquipmentUnits";
import { StockOverviewCardGrid } from "@/components/stock/StockOverviewCardGrid";
import { SerializedUnitsTable } from "@/components/stock/SerializedUnitsTable";
import { RegisterUnitDialog } from "@/components/stock/RegisterUnitDialog";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Button } from "@/components/ui/Button";
import { CardKicker } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { CardGridSkeleton } from "@/components/ui/CardGridSkeleton";
import { LabelSheet } from "@/components/ui/LabelSheet";
import { UnitLabel } from "@/components/stock/UnitLabel";
import type { EquipmentUnit } from "@/lib/types";

type StockFilter = "all" | "low_out" | "serialized";

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "low_out", label: "Low / out" },
  { value: "serialized", label: "Serialized only" },
];

export default function StockPageClient() {
  const overview = useStockOverview();
  const [filter, setFilter] = useState<StockFilter>("all");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<number>>(new Set());
  const [printQueue, setPrintQueue] = useState<EquipmentUnit[] | null>(null);
  const selectedProductUnits = useEquipmentUnits(selectedProductId);

  useEffect(() => {
    if (printQueue) window.print();
  }, [printQueue]);

  function handleSelectProduct(productId: number) {
    setSelectedProductId(productId);
    setSelectedUnitIds(new Set());
  }

  function toggleSelectUnit(unitId: number) {
    setSelectedUnitIds((current) => {
      const next = new Set(current);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

  const filteredRows = useMemo(() => {
    if (filter === "low_out") {
      return overview.rows.filter((r) => r.flag !== "ok");
    }
    if (filter === "serialized") {
      return overview.rows.filter((r) => r.unit_count > 0);
    }
    return overview.rows;
  }, [overview.rows, filter]);

  const selectedProduct = overview.rows.find((r) => r.product_id === selectedProductId);

  if (overview.isError) {
    return (
      <ErrorState message="Couldn't load stock." />
    );
  }

  if (overview.isLoading) {
    return <CardGridSkeleton label="Loading stock…" />;
  }

  return (
    <div>
      <PageHeader title="Stock overview">
        <SegmentedToggle name="stk" options={FILTER_OPTIONS} value={filter} onChange={(v) => setFilter(v as StockFilter)} />
        <Link href="/stock/scan" className="ml-auto text-sm text-accent">
          Quick status change →
        </Link>
      </PageHeader>
      <StockOverviewCardGrid rows={filteredRows} onSelectProduct={handleSelectProduct} />
      <hr className="my-4 border-divider" />
      <div className="flex items-baseline gap-3 mb-2">
        <CardKicker>
          {selectedProduct ? `Serialized units — ${selectedProduct.name}` : "Serialized units"}
        </CardKicker>
        {selectedProduct && (
          <Button variant="ghost" className="ml-auto" onClick={() => setRegisterOpen(true)}>
            + Register unit
          </Button>
        )}
      </div>
      {selectedUnitIds.size > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded-md bg-accent/10 text-sm">
          <span>{selectedUnitIds.size} selected</span>
          <Button
            variant="secondary"
            className="ml-auto"
            onClick={() =>
              setPrintQueue(selectedProductUnits.units.filter((u) => selectedUnitIds.has(u.unit_id)))
            }
          >
            Print {selectedUnitIds.size} labels
          </Button>
        </div>
      )}
      {selectedProduct ? (
        <SerializedUnitsTable
          units={selectedProductUnits.units}
          selectedIds={selectedUnitIds}
          onToggleSelect={toggleSelectUnit}
          onPrintLabel={(unit) => setPrintQueue([unit])}
        />
      ) : (
        <p className="text-sm text-text/50">Select a product above to view its serialized units</p>
      )}
      {selectedProductId !== null && (
        <RegisterUnitDialog
          open={registerOpen}
          productId={selectedProductId}
          productName={selectedProduct?.name ?? ""}
          onClose={() => setRegisterOpen(false)}
          onSaved={() => {}}
        />
      )}
      {printQueue && (
        <LabelSheet>
          {printQueue.map((unit) => (
            <UnitLabel key={unit.unit_id} productName={selectedProduct?.name ?? ""} serialNumber={unit.serial_number} />
          ))}
        </LabelSheet>
      )}
    </div>
  );
}
```

Note: `onSaved={() => {}}` replaces the previous `onSaved={() => setRegisterOpen(false)}` — closing the dialog is now driven entirely by `onClose` (Cancel, or the new "Done" button added in Task 14's post-save view), so the dialog can show its "print now?" offer after a successful save instead of closing immediately. `productName` is a new required prop threaded through to `RegisterUnitDialog`, implemented in Task 14.

- [ ] **Step 8: Run to verify `StockPageClient.test.tsx` passes**

Run: `npx vitest run "app/(protected)/stock/StockPageClient.test.tsx"`
Expected: PASS — none of this file's tests (old or the 2 new ones) actually open `RegisterUnitDialog` through a full save flow, so the `productName` prop being passed to a component that doesn't declare it yet has no effect on `vitest` (which transpiles and strips types without type-checking; unrecognized props are simply ignored by the receiving component's destructure). This is a genuine but temporary gap: `npx tsc --noEmit` WOULD fail right now on an excess-property error for `productName`, since `RegisterUnitDialogProps` doesn't include it yet. That's expected and resolved by Task 14, Step 5 below — don't run a full typecheck between these two tasks.

- [ ] **Step 9: Commit**

```bash
git add frontend/components/stock/SerializedUnitsTable.tsx frontend/components/stock/SerializedUnitsTable.test.tsx "frontend/app/(protected)/stock/StockPageClient.tsx" "frontend/app/(protected)/stock/StockPageClient.test.tsx"
git commit -m "feat(stock): per-item and bulk barcode label printing from the serialized units table"
```

---

## Task 14: Frontend — "Print label now" after registering a unit

**Files:**
- Modify: `components/stock/RegisterUnitDialog.tsx`
- Modify: `components/stock/RegisterUnitDialog.test.tsx`

**Interfaces:**
- Consumes: `LabelSheet`, `UnitLabel` (Task 8/9).
- Produces: `RegisterUnitDialogProps` gains a required `productName: string`. After a successful save, the dialog shows a "print now?" sub-view instead of closing — `onClose` (not `onSaved`) is what actually dismisses it, via a "Done" button.

- [ ] **Step 1: Update the test harness and write the new failing tests**

In `components/stock/RegisterUnitDialog.test.tsx`, update `renderDialog` to pass `productName`:

```tsx
function renderDialog(props: Partial<React.ComponentProps<typeof RegisterUnitDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RegisterUnitDialog
          open
          productId={2}
          productName="JBL Flip 6 Speaker"
          onClose={onClose}
          onSaved={onSaved}
          {...props}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { onClose, onSaved };
}
```

Append inside the `describe("RegisterUnitDialog", ...)` block:

```tsx
  it("offers to print a label after a successful save, without auto-closing", async () => {
    const { onClose } = renderDialog();
    await userEvent.type(screen.getByLabelText("Serial number"), "JBL6-NEW01");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/JBL6-NEW01/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print label now" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes the dialog when Done is clicked after saving", async () => {
    const { onClose } = renderDialog();
    await userEvent.type(screen.getByLabelText("Serial number"), "JBL6-NEW01");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Print label now" });

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls window.print when Print label now is clicked", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    renderDialog();
    await userEvent.type(screen.getByLabelText("Serial number"), "JBL6-NEW01");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.click(await screen.findByRole("button", { name: "Print label now" }));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run components/stock/RegisterUnitDialog.test.tsx`
Expected: FAIL on the 3 new tests (no post-save print offer exists yet); the 2 pre-existing tests still pass since `onSaved` still fires the same way at this point.

- [ ] **Step 3: Implement the post-save print offer**

Replace `components/stock/RegisterUnitDialog.tsx` entirely with:

```tsx
"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { LabelSheet } from "@/components/ui/LabelSheet";
import { UnitLabel } from "@/components/stock/UnitLabel";
import { useToast } from "@/components/layout/ToastProvider";
import { useRegisterUnit } from "@/lib/stock/useRegisterUnit";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import type { EquipmentUnit } from "@/lib/types";

interface RegisterUnitDialogProps {
  open: boolean;
  productId: number;
  productName: string;
  onClose: () => void;
  onSaved: () => void;
}

export function RegisterUnitDialog({ open, productId, productName, onClose, onSaved }: RegisterUnitDialogProps) {
  const { show } = useToast();
  const registerUnit = useRegisterUnit();
  const [serialNumber, setSerialNumber] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [conditionNotes, setConditionNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState<string | null>(null);
  const [savedUnit, setSavedUnit] = useState<EquipmentUnit | null>(null);

  // Reset the form when the dialog transitions to open (or opens for a different product) —
  // adjusting state during render, not in an effect, per the react-hooks set-state-in-effect rule.
  const openKey = open ? `${productId}` : null;
  if (openKey !== null && openKey !== resetKey) {
    setResetKey(openKey);
    setSerialNumber("");
    setStorageLocation("");
    setConditionNotes("");
    setError(null);
    setSavedUnit(null);
  } else if (openKey === null && resetKey !== null) {
    setResetKey(null);
  }

  async function handleSubmit() {
    if (!serialNumber.trim()) {
      setError("Serial number is required.");
      return;
    }
    setError(null);
    try {
      const unit = await registerUnit.mutateAsync({
        product: productId,
        serial_number: serialNumber.trim(),
        storage_location: storageLocation.trim() || null,
        condition_notes: conditionNotes.trim() || null,
      });
      show("Unit registered.", "success");
      setSavedUnit(unit);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(extractErrorMessage(err.body));
      } else {
        show("Something went wrong — try again.", "error");
      }
    }
  }

  if (savedUnit) {
    return (
      <Dialog open={open} onClose={onClose} title="Unit registered">
        <div className="flex flex-col gap-3 min-w-[320px]">
          <p className="text-sm">
            <span className="font-mono">{savedUnit.serial_number}</span> saved. Print a label for it now?
          </p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
            <Button onClick={() => window.print()}>Print label now</Button>
          </div>
        </div>
        <LabelSheet>
          <UnitLabel productName={productName} serialNumber={savedUnit.serial_number} />
        </LabelSheet>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title="Register unit">
      <div className="flex flex-col gap-3 min-w-[320px]">
        <Field label="Serial number" name="serial_number" value={serialNumber} onChange={setSerialNumber} />
        <Field label="Storage location" name="storage_location" value={storageLocation} onChange={setStorageLocation} />
        <Field label="Condition notes" name="condition_notes" value={conditionNotes} onChange={setConditionNotes} />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={registerUnit.isPending}>
            {registerUnit.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run to verify `RegisterUnitDialog.test.tsx` passes**

Run: `npx vitest run components/stock/RegisterUnitDialog.test.tsx`
Expected: PASS (all 5 tests — the 2 pre-existing plus the 3 new ones).

- [ ] **Step 5: Type-check to confirm Task 13's temporary gap is now resolved**

Run: `npx tsc --noEmit`
Expected: no errors — `RegisterUnitDialog` now declares `productName` in its props, matching what `StockPageClient` has been passing since Task 13.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/stock/RegisterUnitDialog.tsx frontend/components/stock/RegisterUnitDialog.test.tsx
git commit -m "feat(stock): offer to print a barcode label immediately after registering a unit"
```

---

## Task 15: Final verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full frontend test suite**

Run (from `frontend/`): `npm test`
Expected: all test files pass (no failures). If any test times out due to CPU contention from running multiple checks in parallel, re-run that file alone before concluding it's a real failure.

- [ ] **Step 2: Type-check the frontend**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint the frontend**

Run: `npm run lint`
Expected: no errors or warnings.

- [ ] **Step 4: Run the full backend test suite**

Run (from the `PromiseShop` root): `docker compose run --rm web pytest -v`
Expected: all tests pass, including every test added in Tasks 1–4 and every pre-existing test (none of this plan's backend changes are breaking — all are additive fields/endpoints).

- [ ] **Step 5: Manual smoke check (no automated test covers visual print layout)**

Start the stack (`docker compose up -d`, `npm run dev` in `frontend/`) and manually verify, since browser print rendering isn't exercised by the test suite:
- Products page: select 2+ products, click "Print N labels", confirm the print preview shows a grid of labels with correct barcodes (not the whole page).
- Stock page: select a product with serialized units, print a single unit's label, confirm only that one label shows in print preview.
- Register a new unit, click "Print label now", confirm the print preview shows that unit's label.
- Complete a POS sale, confirm the receipt print preview shows the business header, itemized tax summary, and the "SAMPLE RECEIPT" banner — not the whole page.
- Print the product info sheet (`/products/:id`) and confirm it still isolates only that content (regression check for Task 6's CSS refactor).

- [ ] **Step 6: Report back**

No commit for this task — it's verification-only. If any step surfaces a real failure, fix it as a follow-up task before considering the plan complete.
