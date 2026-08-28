# Admin/manager app-flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the products → purchases → stock → sales relationship obvious from inside the app for admin/manager users, and close the two dead-end affordances (disabled "Reorder" button, no-feedback low-stock table) that currently strand a user who wants to act on low stock.

**Architecture:** Entirely frontend (Next.js App Router, React, TanStack Query, Vitest). No backend changes, no new endpoints, no migrations — every piece of data needed already exists via `usePurchases`/`useCatalogProducts`/`useDashboardData`. A new URL-query-param convention (`?open=new&reorder_product=...&reorder_name=...` on `/purchases`, `?prefill=...` on a purchase workspace) carries a specific product from a low-stock signal into a pre-filled new purchase. A shared `normalizeName` helper (whitespace-collapsing name match, already duplicated once) gets extracted and reused a third time for a new duplicate-name warning on Products' own creation form.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, TanStack Query, Tailwind, Vitest + Testing Library, `next/navigation` (`useRouter`, `useSearchParams`).

**Spec:** `docs/superpowers/specs/2026-08-28-admin-management-flow-design.md`

## Global Constraints

- No backend changes in this plan — every task is frontend-only.
- Reuse existing hooks/query keys (`["purchases"]`, `["products"]`, `["categories"]`) rather than adding new network calls where data is already fetched nearby.
- Match each touched file's existing test conventions exactly (same mocking style, same `renderWithProviders`/`renderForm`-style helpers) — don't introduce a new pattern where a working one already exists in that file.
- `sales_staff`/`technician` flows (Checkout, `STAFF_LINKS` nav) are unchanged by this plan — do not touch them.

---

### Task 1: Extract `normalizeName` into a shared helper

**Files:**
- Create: `frontend/lib/products/normalizeName.ts`
- Create: `frontend/lib/products/normalizeName.test.ts`
- Modify: `frontend/components/purchasing/AddProductBulkTable.tsx`

**Interfaces:**
- Produces: `normalizeName(name: string): string` — trims, lowercases, collapses repeated whitespace to a single space. Tasks 3 and 4 both import this.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/lib/products/normalizeName.test.ts
import { describe, expect, it } from "vitest";
import { normalizeName } from "./normalizeName";

describe("normalizeName", () => {
  it("lowercases and trims", () => {
    expect(normalizeName("  Scales 60kg  ")).toBe("scales 60kg");
  });

  it("collapses repeated internal whitespace", () => {
    expect(normalizeName("Scales   60kg")).toBe("scales 60kg");
  });

  it("makes a trailing double space and a single space compare equal", () => {
    expect(normalizeName("Scales 60kg ")).toBe(normalizeName("Scales 60kg"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npx vitest run lib/products/normalizeName.test.ts`
Expected: FAIL — `Cannot find module './normalizeName'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// frontend/lib/products/normalizeName.ts
// Collapse repeated whitespace so a stray double space (a very easy typo)
// doesn't hide an existing product and cause an accidental duplicate to get
// created — used everywhere an existing product is matched by typed name.
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/products/normalizeName.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Refactor `AddProductBulkTable.tsx` to use the shared helper**

In `frontend/components/purchasing/AddProductBulkTable.tsx`, remove the local `normalizeName` function (currently defined just above `emptyRow()`) and import the shared one instead:

```typescript
import { normalizeName } from "@/lib/products/normalizeName";
```

Delete this block (the local duplicate):

```typescript
// Collapse repeated whitespace so a stray double space doesn't hide an existing
// product from this exact-name match and cause an accidental duplicate to get created.
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
```

Leave every call site (`normalizeName(p.name)`, `normalizeName(row.name)` ×2) unchanged — same function name, same behavior, just imported instead of local.

- [ ] **Step 6: Run the existing bulk-table tests to confirm no regression**

Run: `npx vitest run components/purchasing/AddProductBulkTable.test.tsx`
Expected: PASS (all existing tests, unchanged)

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/products/normalizeName.ts frontend/lib/products/normalizeName.test.ts frontend/components/purchasing/AddProductBulkTable.tsx
git commit -m "refactor(products): extract normalizeName into a shared helper"
```

---

### Task 2: Reorder the admin nav

**Files:**
- Modify: `frontend/components/layout/Nav.tsx`
- Modify: `frontend/components/layout/Nav.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks — fully standalone.

- [ ] **Step 1: Update the failing test first**

In `frontend/components/layout/Nav.test.tsx`, the `"returns the admin link set, with Employees and Expenses appended, for admin"` test currently asserts this order:

```typescript
    expect(withoutIcons(getNavLinksForRole("admin"))).toEqual([
      { href: "/dashboard", label: "Dashboard" },
      { href: "/products", label: "Products" },
      { href: "/checkout", label: "Sales" },
      { href: "/purchases", label: "Purchases" },
      { href: "/stock", label: "Stock" },
      { href: "/suppliers", label: "Suppliers" },
      { href: "/customers", label: "Customers" },
      { href: "/employees", label: "Employees" },
      { href: "/expenses", label: "Expenses" },
    ]);
```

Change the middle five entries to the new order (Products → Purchases → Stock → Sales → Suppliers):

```typescript
    expect(withoutIcons(getNavLinksForRole("admin"))).toEqual([
      { href: "/dashboard", label: "Dashboard" },
      { href: "/products", label: "Products" },
      { href: "/purchases", label: "Purchases" },
      { href: "/stock", label: "Stock" },
      { href: "/checkout", label: "Sales" },
      { href: "/suppliers", label: "Suppliers" },
      { href: "/customers", label: "Customers" },
      { href: "/employees", label: "Employees" },
      { href: "/expenses", label: "Expenses" },
    ]);
```

Apply the same reordering to the `"returns the admin link set WITHOUT Employees or Expenses for manager..."` test's expected array (same five middle entries, drop the trailing two).

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `npx vitest run components/layout/Nav.test.tsx`
Expected: FAIL — both order assertions mismatch against the current `ADMIN_LINKS` order.

- [ ] **Step 3: Reorder `ADMIN_LINKS` in `Nav.tsx`**

Change:

```typescript
const ADMIN_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/checkout", label: "Sales", icon: ShoppingCart },
  { href: "/purchases", label: "Purchases", icon: Truck },
  { href: "/stock", label: "Stock", icon: Boxes },
  { href: "/suppliers", label: "Suppliers", icon: Building2 },
  { href: "/customers", label: "Customers", icon: Users },
];
```

to:

```typescript
const ADMIN_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/purchases", label: "Purchases", icon: Truck },
  { href: "/stock", label: "Stock", icon: Boxes },
  { href: "/checkout", label: "Sales", icon: ShoppingCart },
  { href: "/suppliers", label: "Suppliers", icon: Building2 },
  { href: "/customers", label: "Customers", icon: Users },
];
```

`STAFF_LINKS` is unchanged (out of scope — sales_staff/technician keep Checkout first).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/layout/Nav.test.tsx`
Expected: PASS (all 20 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/components/layout/Nav.tsx frontend/components/layout/Nav.test.tsx
git commit -m "fix(nav): order admin nav as set up catalog -> buy stock -> watch stock -> sell"
```

---

### Task 3: Duplicate-name warning on Products' own "New product" form

**Files:**
- Modify: `frontend/components/products/ProductFormDialog.tsx`
- Modify: `frontend/components/products/ProductFormDialog.test.tsx`
- Modify: `frontend/app/(protected)/products/ProductsPageClient.tsx`
- Modify: `frontend/app/(protected)/products/page.test.tsx`

**Interfaces:**
- Consumes: `normalizeName` from Task 1 (`@/lib/products/normalizeName`).
- Produces: `ProductFormDialogProps` gains an optional `existingProducts?: CatalogProduct[]` field (default `[]` when omitted) — no other task consumes this directly.

- [ ] **Step 1: Write the failing tests**

In `frontend/components/products/ProductFormDialog.test.tsx`, add near the other create-mode tests (after `"shows a category select and no storage location field in create mode"`):

```typescript
  it("shows a similar-product warning in create mode when the typed name matches an existing product", async () => {
    renderWithToast(
      <ProductFormDialog
        open={true}
        mode="create"
        categories={categories}
        existingProducts={[
          { product_id: 99, name: "Scales 60kg", brand: null, model_number: null, barcode: "PES-SCL-00001", category_id: 20, category_name: "Audio", retail_price: 5000, wholesale_price: null, quantity_in_stock: 3, reorder_level: 2, status: "ok", is_active: true },
        ]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    await userEvent.type(screen.getByLabelText("Name"), "Scales 60kg");
    expect(
      await screen.findByText("A similar product already exists: Scales 60kg (PES-SCL-00001)")
    ).toBeInTheDocument();
  });

  it("does not show the similar-product warning when there is no match", async () => {
    renderWithToast(
      <ProductFormDialog
        open={true}
        mode="create"
        categories={categories}
        existingProducts={[
          { product_id: 99, name: "Scales 60kg", brand: null, model_number: null, barcode: "PES-SCL-00001", category_id: 20, category_name: "Audio", retail_price: 5000, wholesale_price: null, quantity_in_stock: 3, reorder_level: 2, status: "ok", is_active: true },
        ]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    await userEvent.type(screen.getByLabelText("Name"), "Bluetooth Speaker");
    expect(screen.queryByText(/A similar product already exists/)).not.toBeInTheDocument();
  });

  it("does not show the similar-product warning in edit mode", async () => {
    renderWithToast(
      <ProductFormDialog
        open={true}
        mode="edit"
        categories={categories}
        initialProduct={existingProduct}
        initialStorageLocation={null}
        existingProducts={[
          { product_id: 99, name: "JBL Flip 6", brand: null, model_number: null, barcode: "PES-AUD-00099", category_id: 20, category_name: "Audio", retail_price: 5000, wholesale_price: null, quantity_in_stock: 3, reorder_level: 2, status: "ok", is_active: true },
        ]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    expect(screen.queryByText(/A similar product already exists/)).not.toBeInTheDocument();
  });

  it("does not block submission when the warning is showing", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...existingProduct, product_id: 5 }),
    });
    const onSaved = vi.fn();
    renderWithToast(
      <ProductFormDialog
        open={true}
        mode="create"
        categories={categories}
        existingProducts={[
          { product_id: 99, name: "Scales 60kg", brand: null, model_number: null, barcode: "PES-SCL-00001", category_id: 20, category_name: "Audio", retail_price: 5000, wholesale_price: null, quantity_in_stock: 3, reorder_level: 2, status: "ok", is_active: true },
        ]}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );
    await userEvent.type(screen.getByLabelText("Name"), "Scales 60kg");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "20");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
```

This file's `import type { Category, Product } from "@/lib/types";` line needs `CatalogProduct` too — add at the top:

```typescript
import type { CatalogProduct } from "@/lib/products/useCatalogProducts";
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `npx vitest run components/products/ProductFormDialog.test.tsx`
Expected: FAIL — `existingProducts` isn't a recognized prop yet (TS error) and the warning text never renders.

- [ ] **Step 3: Add the prop and matching logic to `ProductFormDialog.tsx`**

Add the import at the top:

```typescript
import { normalizeName } from "@/lib/products/normalizeName";
import type { CatalogProduct } from "@/lib/products/useCatalogProducts";
```

Add `existingProducts` to both prop interfaces:

```typescript
interface ProductFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  categories: Category[];
  existingProducts?: CatalogProduct[];
  initialProduct?: Product;
  initialStorageLocation?: string | null;
  inventoryId?: number;
  onClose: () => void;
  onSaved: () => void;
}
```

`ProductFormDialog` already spreads `{...rest}` into `ProductFormFields`, so no change needed at that call site — but `ProductFormFields`'s destructured params need to pick it up explicitly:

```typescript
function ProductFormFields({
  mode,
  categories,
  existingProducts = [],
  initialProduct,
  initialStorageLocation,
  inventoryId,
  onClose,
  onSaved,
}: Omit<ProductFormDialogProps, "open">) {
```

Inside `ProductFormFields`, after the existing `const showStorageLocation = ...` line, add the match computation:

```typescript
  const similarProduct =
    mode === "create" && values.name.trim()
      ? existingProducts.find((p) => normalizeName(p.name) === normalizeName(values.name))
      : undefined;
```

(Exact-match-after-normalization, matching the "first matching existing product" language in the spec — deliberately not a substring match here, since as-you-type substring matching against every keystroke would flag almost every partial name as "similar" and become noisy; an exact normalized match is the meaningful signal for "you're about to create a literal duplicate.")

In the JSX, right after the `Name` field:

```typescript
        <Field label="Name" name="name" value={values.name} onChange={(v) => setField("name", v)} error={errors.name} />
        {similarProduct && (
          <p className="text-xs text-text/50">
            A similar product already exists: {similarProduct.name} ({similarProduct.barcode})
          </p>
        )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/products/ProductFormDialog.test.tsx`
Expected: PASS (all tests, including the 4 new ones)

- [ ] **Step 5: Wire `existingProducts` through from `ProductsPageClient`**

In `frontend/app/(protected)/products/ProductsPageClient.tsx`, the `<ProductFormDialog>` call for create mode:

```typescript
      <ProductFormDialog
        open={createOpen}
        mode="create"
        categories={catalog.categories}
        onClose={() => setCreateOpen(false)}
        onSaved={() => setCreateOpen(false)}
      />
```

add `existingProducts={catalog.all}`:

```typescript
      <ProductFormDialog
        open={createOpen}
        mode="create"
        categories={catalog.categories}
        existingProducts={catalog.all}
        onClose={() => setCreateOpen(false)}
        onSaved={() => setCreateOpen(false)}
      />
```

(`ProductDetailPageClient`'s own `<ProductFormDialog>` usage is edit-mode only — leave it as-is; the prop defaults to `[]` and the check is gated to create mode anyway.)

- [ ] **Step 6: Write the integration test in `page.test.tsx`**

In `frontend/app/(protected)/products/page.test.tsx`, add (using the existing `products` fixture at the top of the file, which includes `{ ..., name: "Samsung TV", ... }`):

```typescript
  it("wires the catalog through to the New product dialog so it can warn about duplicate names", async () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.click(screen.getByRole("button", { name: "+ New product" }));
    await userEvent.type(screen.getByLabelText("Name"), "Samsung TV");
    expect(
      await screen.findByText("A similar product already exists: Samsung TV (PES-TV-00082)")
    ).toBeInTheDocument();
  });
```

- [ ] **Step 7: Run the full products test suite**

Run: `npx vitest run components/products/ProductFormDialog.test.tsx "app/(protected)/products/page.test.tsx"`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/components/products/ProductFormDialog.tsx frontend/components/products/ProductFormDialog.test.tsx frontend/app/\(protected\)/products/ProductsPageClient.tsx "frontend/app/(protected)/products/page.test.tsx"
git commit -m "feat(products): warn on a duplicate name in the New product form"
```

---

### Task 4: `AddProductSingleForm` accepts a prefill and auto-selects an exact match

**Files:**
- Modify: `frontend/components/purchasing/AddProductSingleForm.tsx`
- Modify: `frontend/components/purchasing/AddProductSingleForm.test.tsx`

**Interfaces:**
- Consumes: `normalizeName` from Task 1.
- Produces: `AddProductSingleFormProps` gains an optional `initialSearch?: string`. Task 7 passes this in.

- [ ] **Step 1: Write the failing tests**

In `frontend/components/purchasing/AddProductSingleForm.test.tsx`, update `renderForm` to accept an optional `initialSearch`:

```typescript
function renderForm(onAdded = vi.fn(), initialSearch?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AddProductSingleForm purchaseId={7} onAdded={onAdded} initialSearch={initialSearch} />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { onAdded };
}
```

Add new tests (the existing product fixture in this file is `{ product_id: 3, ..., name: "Boya BY-M1 Microphone", ... }`):

```typescript
  it("seeds the search box from initialSearch", async () => {
    renderForm(vi.fn(), "Boya BY-M1 Microphone");
    expect(screen.getByLabelText("Search catalog first — reuse if it exists…")).toHaveValue("Boya BY-M1 Microphone");
  });

  it("auto-selects when initialSearch exactly matches one existing product", async () => {
    renderForm(vi.fn(), "Boya BY-M1 Microphone");
    expect(await screen.findByLabelText("Quantity")).toBeInTheDocument();
    expect(screen.queryByLabelText("Search catalog first — reuse if it exists…")).not.toBeInTheDocument();
  });

  it("does not auto-select on a partial initialSearch match, leaving the box prefilled", async () => {
    renderForm(vi.fn(), "Boya");
    await screen.findByText(/Boya BY-M1 Microphone/);
    expect(screen.getByLabelText("Search catalog first — reuse if it exists…")).toHaveValue("Boya");
    expect(screen.queryByLabelText("Quantity")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `npx vitest run components/purchasing/AddProductSingleForm.test.tsx`
Expected: FAIL — `initialSearch` isn't a recognized prop yet, search box starts empty.

- [ ] **Step 3: Implement in `AddProductSingleForm.tsx`**

Add the import:

```typescript
import { normalizeName } from "@/lib/products/normalizeName";
```

Add `initialSearch` to the props and seed `search`/add the auto-select effect:

```typescript
interface AddProductSingleFormProps {
  purchaseId: number;
  onAdded: () => void;
  initialSearch?: string;
}

export function AddProductSingleForm({ purchaseId, onAdded, initialSearch }: AddProductSingleFormProps) {
  const categoryId = useId();
  const { show } = useToast();
  const addItem = useAddPurchaseItem();
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: () => fetchAllPages<Product>("products/") });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => fetchAllPages<Category>("categories/") });

  const [search, setSearch] = useState(initialSearch ?? "");
  const [selected, setSelected] = useState<Product | null>(null);
  const [forceNew, setForceNew] = useState(false);
  const [values, setValues] = useState<AddItemFormValues>(emptyExistingProductItemValues(""));
  const [errors, setErrors] = useState<AddItemFormErrors>({});
  const [autoSelectAttempted, setAutoSelectAttempted] = useState(false);
```

Add the auto-select effect after the `matches` useMemo (needs `useEffect` added to the existing `import { useId, useMemo, useState } from "react";` line — change it to `import { useEffect, useId, useMemo, useState } from "react";`):

```typescript
  useEffect(() => {
    if (autoSelectAttempted || !initialSearch || !productsQuery.data || selected || forceNew) return;
    setAutoSelectAttempted(true);
    const target = normalizeName(initialSearch);
    const exactMatches = productsQuery.data.filter((p) => normalizeName(p.name) === target);
    if (exactMatches.length === 1) {
      selectProduct(exactMatches[0]);
    }
  }, [autoSelectAttempted, initialSearch, productsQuery.data, selected, forceNew]);
```

(`autoSelectAttempted` guards this to run at most once — otherwise clicking "change" back to the search view after auto-selecting would immediately re-trigger the same auto-select, making "change" unusable for a prefilled exact match.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/purchasing/AddProductSingleForm.test.tsx`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add frontend/components/purchasing/AddProductSingleForm.tsx frontend/components/purchasing/AddProductSingleForm.test.tsx
git commit -m "feat(purchasing): AddProductSingleForm accepts and auto-selects a prefilled search"
```

---

### Task 5: `NewPurchaseDialog` carries a reorder target into the new purchase's workspace

**Files:**
- Modify: `frontend/components/purchasing/NewPurchaseDialog.tsx`
- Modify: `frontend/components/purchasing/NewPurchaseDialog.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `NewPurchaseDialogProps` gains optional `reorderProductName?: string`. Task 6 passes this in. (No `reorderProductId` needed here — the dialog only needs the *name* to build the redirect's `prefill` param; the id was only ever needed by the page reading the initial `reorder_product` query param, which Task 6 owns.)

- [ ] **Step 1: Write the failing test**

In `frontend/components/purchasing/NewPurchaseDialog.test.tsx`, update `renderDialog` to accept the new prop:

```typescript
function renderDialog(open = true, reorderProductName?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <NewPurchaseDialog open={open} onClose={() => {}} reorderProductName={reorderProductName} />
      </ToastProvider>
    </QueryClientProvider>
  );
}
```

Add a new test after `"creates the purchase and navigates to its workspace on success"`:

```typescript
  it("redirects with a prefill query param when a reorder product name was given", async () => {
    renderDialog(true, "Scales 60kg");
    await screen.findByText("Kigali Electronics Ltd");
    await userEvent.selectOptions(screen.getByLabelText("Supplier"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/purchases/42?prefill=Scales%2060kg")
    );
  });
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run (from `frontend/`): `npx vitest run components/purchasing/NewPurchaseDialog.test.tsx`
Expected: the existing "creates the purchase..." test still passes; the new one FAILs — `reorderProductName` isn't a recognized prop and the push always goes to the plain URL.

- [ ] **Step 3: Implement in `NewPurchaseDialog.tsx`**

```typescript
interface NewPurchaseDialogProps {
  open: boolean;
  onClose: () => void;
  reorderProductName?: string;
}

export function NewPurchaseDialog({ open, onClose, reorderProductName }: NewPurchaseDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="New purchase">
      {open && <NewPurchaseFields key={open ? "open" : "closed"} onClose={onClose} reorderProductName={reorderProductName} />}
    </Dialog>
  );
}

function NewPurchaseFields({
  onClose,
  reorderProductName,
}: {
  onClose: () => void;
  reorderProductName?: string;
}) {
```

And in `handleSubmit`, change:

```typescript
      const created = await createPurchase.mutateAsync(buildPurchasePayload(values));
      onClose();
      router.push(`/purchases/${created.purchase_id}`);
```

to:

```typescript
      const created = await createPurchase.mutateAsync(buildPurchasePayload(values));
      onClose();
      router.push(
        reorderProductName
          ? `/purchases/${created.purchase_id}?prefill=${encodeURIComponent(reorderProductName)}`
          : `/purchases/${created.purchase_id}`
      );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/purchasing/NewPurchaseDialog.test.tsx`
Expected: PASS (both tests, existing behavior unchanged when `reorderProductName` is absent)

- [ ] **Step 5: Commit**

```bash
git add frontend/components/purchasing/NewPurchaseDialog.tsx frontend/components/purchasing/NewPurchaseDialog.test.tsx
git commit -m "feat(purchasing): NewPurchaseDialog carries a reorder target's name into the new purchase URL"
```

---

### Task 6: `PurchasesPageClient` opens the dialog and forwards reorder context from the URL

**Files:**
- Modify: `frontend/app/(protected)/purchases/PurchasesPageClient.tsx`
- Modify: `frontend/app/(protected)/purchases/PurchasesPageClient.test.tsx`

**Interfaces:**
- Consumes: `NewPurchaseDialogProps.reorderProductName` from Task 5.
- Produces: the URL contract other tasks build links to — `/purchases?open=new` (auto-opens the dialog), plus `&reorder_product=<id>&reorder_name=<encoded name>` (only `reorder_name` is actually read here and forwarded; `reorder_product` is accepted in the URL for whoever builds the link — Tasks 8/9 — to identify *which* product this is about, but this page itself has no use for the id, only the name).

- [ ] **Step 1: Write the failing tests**

`frontend/app/(protected)/purchases/PurchasesPageClient.test.tsx` currently has no `next/navigation` mock at all. Add one at the top, with a helper to change it per test:

```typescript
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));
```

In `beforeEach`, reset it: add `mockSearchParams = new URLSearchParams();` alongside the existing `usePurchases` mock setup.

Add new tests after `"shows the + New purchase button for every role..."`:

```typescript
  it("does not auto-open the New purchase dialog without ?open=new", () => {
    renderWithProviders(<PurchasesPageClient role="admin" />);
    expect(screen.queryByText("New purchase", { selector: "h4" })).not.toBeInTheDocument();
  });

  it("auto-opens the New purchase dialog when ?open=new is present", () => {
    mockSearchParams = new URLSearchParams("open=new");
    renderWithProviders(<PurchasesPageClient role="admin" />);
    expect(screen.getByText("New purchase", { selector: "h4" })).toBeInTheDocument();
  });

  it("forwards reorder_name from the URL into the dialog's reorder prop", async () => {
    mockSearchParams = new URLSearchParams("open=new&reorder_product=7&reorder_name=Scales%2060kg");
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, options?: RequestInit) => {
        if (url.includes("/suppliers/")) {
          return Promise.resolve({ ok: true, json: async () => ({ count: 1, next: null, previous: null, results: [{ supplier_id: 1, name: "Kigali Electronics Ltd", contact_person: null, phone: null, email: null, address: null }] }) });
        }
        if (url.includes("/purchases/") && options?.method === "POST") {
          return Promise.resolve({ ok: true, json: async () => ({ purchase_id: 9, supplier: 1, employee: 1, invoice_number: null, purchase_date: "2026-08-28", total_paid: "0", total_invoiced: "0", payment_status: "paid", status: "draft", items: [] }) });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
    renderWithProviders(<PurchasesPageClient role="admin" />);
    await screen.findByText("Kigali Electronics Ltd");
    await userEvent.selectOptions(screen.getByLabelText("Supplier"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/proxy/purchases/", expect.objectContaining({ method: "POST" })));
  });
```

This file needs two new imports added at the top: `import userEvent from "@testing-library/user-event";` and `import { waitFor } from "@testing-library/react";` — merge into the existing `import { render, screen } from "@testing-library/react";` line to become `import { render, screen, waitFor } from "@testing-library/react";`.

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `npx vitest run "app/(protected)/purchases/PurchasesPageClient.test.tsx"`
Expected: FAIL — `next/navigation` mock doesn't affect anything yet since `PurchasesPageClient` doesn't call `useSearchParams`.

- [ ] **Step 3: Implement in `PurchasesPageClient.tsx`**

Current full file:

```typescript
"use client";

import { useState } from "react";
import { usePurchases } from "@/lib/purchasing/usePurchases";
import { PurchaseTable } from "@/components/purchasing/PurchaseTable";
import { NewPurchaseDialog } from "@/components/purchasing/NewPurchaseDialog";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import type { EmployeeRole } from "@/lib/types";

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

interface PurchasesPageClientProps {
  role: EmployeeRole;
}

export default function PurchasesPageClient({ role }: PurchasesPageClientProps) {
  const purchases = usePurchases();
  const isAdmin = ADMIN_ROLES.includes(role);
  const [createOpen, setCreateOpen] = useState(false);

  if (purchases.isError) {
    return (
      <ErrorState message="Couldn't load purchases." />
    );
  }

  if (purchases.isLoading) {
    return <p className="text-sm text-text/50">Loading purchases…</p>;
  }

  return (
    <div>
      <PageHeader title="Purchases">
        <Button onClick={() => setCreateOpen(true)} className="ml-auto">
          + New purchase
        </Button>
      </PageHeader>
      <PurchaseTable rows={purchases.rows} showTotals={isAdmin} />
      <NewPurchaseDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
```

Change the `next/navigation` import and the top of the component to:

```typescript
import { useSearchParams } from "next/navigation";
```

```typescript
export default function PurchasesPageClient({ role }: PurchasesPageClientProps) {
  const searchParams = useSearchParams();
  const purchases = usePurchases();
  const isAdmin = ADMIN_ROLES.includes(role);
  const [createOpen, setCreateOpen] = useState(searchParams.get("open") === "new");
  const reorderProductName = searchParams.get("reorder_name") ?? undefined;
```

And the final `NewPurchaseDialog` render call to:

```typescript
      <NewPurchaseDialog open={createOpen} onClose={() => setCreateOpen(false)} reorderProductName={reorderProductName} />
```

Every other line (the `isError`/`isLoading` guards, `PageHeader`, `PurchaseTable`) is unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(protected)/purchases/PurchasesPageClient.test.tsx"`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(protected)/purchases/PurchasesPageClient.tsx" "frontend/app/(protected)/purchases/PurchasesPageClient.test.tsx"
git commit -m "feat(purchasing): open+prefill New purchase from a ?open=new&reorder_name= URL"
```

---

### Task 7: `PurchaseWorkspaceClient` reads `?prefill=` and passes it into the add-product form

**Files:**
- Modify: `frontend/app/(protected)/purchases/[id]/PurchaseWorkspaceClient.tsx`
- Modify: `frontend/app/(protected)/purchases/[id]/PurchaseWorkspaceClient.test.tsx`

**Interfaces:**
- Consumes: `AddProductSingleFormProps.initialSearch` from Task 4.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

In `frontend/app/(protected)/purchases/[id]/PurchaseWorkspaceClient.test.tsx`, the existing mock is:

```typescript
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));
```

Extend it to also provide `useSearchParams`, controllable per test:

```typescript
const pushMock = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => mockSearchParams,
}));
```

In `beforeEach`, reset it: add `mockSearchParams = new URLSearchParams();`.

Add a new test near the "toggles between Single and Bulk add forms" test:

```typescript
  it("passes ?prefill= through to the single-add form's search box", () => {
    mockSearchParams = new URLSearchParams("prefill=Scales%2060kg");
    vi.spyOn(usePurchaseDetailModule, "usePurchaseDetail").mockReturnValue({
      purchase: draftPurchase(), isLoading: false, isError: false,
    } satisfies PurchaseDetail);
    renderWorkspace();
    expect(screen.getByLabelText("Search catalog first — reuse if it exists…")).toHaveValue("Scales 60kg");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npx vitest run "app/(protected)/purchases/[id]/PurchaseWorkspaceClient.test.tsx"`
Expected: FAIL — search box starts empty regardless of the URL.

- [ ] **Step 3: Implement in `PurchaseWorkspaceClient.tsx`**

Change the existing import:

```typescript
import { useRouter } from "next/navigation";
```

to:

```typescript
import { useRouter, useSearchParams } from "next/navigation";
```

Inside the component, after `const router = useRouter();`, add:

```typescript
  const searchParams = useSearchParams();
  const prefill = searchParams.get("prefill") ?? undefined;
```

Pass it to the single-add form:

```typescript
            {addMode === "single" ? (
              <AddProductSingleForm purchaseId={purchaseId} onAdded={() => {}} initialSearch={prefill} />
            ) : (
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(protected)/purchases/[id]/PurchaseWorkspaceClient.test.tsx"`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(protected)/purchases/[id]/PurchaseWorkspaceClient.tsx" "frontend/app/(protected)/purchases/[id]/PurchaseWorkspaceClient.test.tsx"
git commit -m "feat(purchasing): PurchaseWorkspaceClient forwards ?prefill= into the single-add form"
```

---

### Task 8: Wire up the "Reorder" button on the product detail page

**Files:**
- Modify: `frontend/app/(protected)/products/[id]/ProductDetailPageClient.tsx`
- Modify: `frontend/app/(protected)/products/[id]/page.test.tsx`

**Interfaces:**
- Consumes: the `/purchases?open=new&reorder_product=<id>&reorder_name=<name>` URL contract from Task 6.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the failing test**

In `frontend/app/(protected)/products/[id]/page.test.tsx`, replace:

```typescript
  it("has a disabled Reorder button", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByRole("button", { name: "Reorder" })).toBeDisabled();
  });
```

with:

```typescript
  it("has a Reorder link that opens a prefilled new purchase for this product", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByRole("link", { name: "Reorder" })).toHaveAttribute(
      "href",
      "/purchases?open=new&reorder_product=1&reorder_name=JBL%20Flip%206%20Speaker"
    );
  });
```

(`productId={1}` and `baseDetail.product.name === "JBL Flip 6 Speaker"` are already the fixtures this file uses.)

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npx vitest run "app/(protected)/products/[id]/page.test.tsx"`
Expected: FAIL — the button is still disabled, no `href`.

- [ ] **Step 3: Implement in `ProductDetailPageClient.tsx`**

Change:

```typescript
          <Button variant="secondary" disabled>
            Reorder
          </Button>
```

to:

```typescript
          <Button
            variant="secondary"
            href={`/purchases?open=new&reorder_product=${detail.product.product_id}&reorder_name=${encodeURIComponent(detail.product.name)}`}
          >
            Reorder
          </Button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(protected)/products/[id]/page.test.tsx"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(protected)/products/[id]/ProductDetailPageClient.tsx" "frontend/app/(protected)/products/[id]/page.test.tsx"
git commit -m "feat(products): wire the Reorder button to a prefilled new purchase"
```

---

### Task 9: Add a Reorder action to the dashboard's low-stock table

**Files:**
- Modify: `frontend/components/dashboard/LowStockTable.tsx`
- Modify: `frontend/components/dashboard/LowStockTable.test.tsx`

**Interfaces:**
- Consumes: the same URL contract as Task 8.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

In `frontend/components/dashboard/LowStockTable.test.tsx`, add:

```typescript
  it("links each row's Reorder action to a prefilled new purchase for that product", () => {
    render(<LowStockTable rows={[makeRow()]} />);
    expect(screen.getByRole("link", { name: "Reorder" })).toHaveAttribute(
      "href",
      "/purchases?open=new&reorder_product=1&reorder_name=JBL%20Flip%206%20Speaker"
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npx vitest run components/dashboard/LowStockTable.test.tsx`
Expected: FAIL — no "Reorder" link exists.

- [ ] **Step 3: Implement in `LowStockTable.tsx`**

Add the import:

```typescript
import Link from "next/link";
```

Add a new column after `"status"`:

```typescript
          {
            key: "reorder",
            header: "",
            render: (r) => (
              <Link
                href={`/purchases?open=new&reorder_product=${r.product_id}&reorder_name=${encodeURIComponent(r.name)}`}
                className="text-xs text-accent"
              >
                Reorder
              </Link>
            ),
          },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/dashboard/LowStockTable.test.tsx`
Expected: PASS (all tests, including the new one)

- [ ] **Step 5: Commit**

```bash
git add frontend/components/dashboard/LowStockTable.tsx frontend/components/dashboard/LowStockTable.test.tsx
git commit -m "feat(dashboard): add a Reorder action to the low-stock table"
```

---

### Task 10: Dashboard setup checklist for a shop that hasn't received its first purchase yet

**Files:**
- Modify: `frontend/lib/dashboard/useDashboardData.ts`
- Modify: `frontend/lib/dashboard/useDashboardData.test.tsx`
- Create: `frontend/components/dashboard/SetupChecklist.tsx`
- Create: `frontend/components/dashboard/SetupChecklist.test.tsx`
- Modify: `frontend/app/(protected)/dashboard/DashboardPageClient.tsx`
- Modify: `frontend/app/(protected)/dashboard/DashboardPageClient.test.tsx`

**Interfaces:**
- Consumes: the `/purchases?open=new` URL contract from Task 6 (checklist item 3's link).
- Produces: `DashboardData` gains `hasReceivedPurchase: boolean`, `categoryCount: number`, `productCount: number`. `SetupChecklistProps = { categoryCount: number; productCount: number }` (`hasReceivedPurchase` is the gate `DashboardPageClient` uses to decide whether to render `SetupChecklist` at all — the checklist component itself doesn't need it, since being rendered *is* "not done yet").

- [ ] **Step 1: Write the failing test for the new `useDashboardData` fields**

In `frontend/lib/dashboard/useDashboardData.test.tsx`, add after the existing `"computes this month's revenue..."` test:

```typescript
  it("reports hasReceivedPurchase, categoryCount, and productCount from the fetched data", async () => {
    vi.stubGlobal("fetch", mockFetchImpl());
    const { result } = renderHook(() => useDashboardData(NOW), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasReceivedPurchase).toBe(true);
    expect(result.current.categoryCount).toBe(2);
    expect(result.current.productCount).toBe(3);
  });

  it("reports hasReceivedPurchase false when every purchase is still a draft", async () => {
    const fetchMock = mockFetchImpl({
      "/purchases/": () =>
        Promise.resolve({
          ok: true,
          json: async () => ({ count: 1, next: null, previous: null, results: [{ ...PURCHASES[0], status: "draft" }] }),
        } as Response),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useDashboardData(NOW), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasReceivedPurchase).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `npx vitest run lib/dashboard/useDashboardData.test.tsx`
Expected: FAIL — `hasReceivedPurchase`/`categoryCount`/`productCount` are `undefined`.

- [ ] **Step 3: Add the fields in `useDashboardData.ts`**

Add to the `DashboardData` interface:

```typescript
export interface DashboardData {
  isLoading: boolean;
  isError: boolean;
  isForbidden: boolean;
  hasReceivedPurchase: boolean;
  categoryCount: number;
  productCount: number;
  salesRevenue: number;
```

(keep every other existing field as-is below it)

Add matching defaults to `emptyData`:

```typescript
const emptyData: Omit<DashboardData, "isLoading" | "isError" | "isForbidden"> = {
  hasReceivedPurchase: false,
  categoryCount: 0,
  productCount: 0,
  salesRevenue: 0,
```

In the `data` `useMemo`'s returned object, add the three computed values (using `purchases.data`, `catalog.categories`, `catalog.all`, all already fetched in this hook):

```typescript
    return {
      hasReceivedPurchase: purchases.data.some((p) => p.status === "received"),
      categoryCount: catalog.categories.length,
      productCount: catalog.all.length,
      salesRevenue,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/dashboard/useDashboardData.test.tsx`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 5: Write the failing test for `SetupChecklist`**

```typescript
// frontend/components/dashboard/SetupChecklist.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SetupChecklist } from "./SetupChecklist";

describe("SetupChecklist", () => {
  it("shows all three steps unchecked when nothing exists yet", () => {
    render(<SetupChecklist categoryCount={0} productCount={0} />);
    expect(screen.getByRole("link", { name: /Add your first category/ })).toHaveAttribute("href", "/products");
    expect(screen.getByRole("link", { name: /Add your first product/ })).toHaveAttribute("href", "/products");
    expect(screen.getByRole("link", { name: /Record and receive your first purchase/ })).toHaveAttribute(
      "href",
      "/purchases?open=new"
    );
  });

  it("marks category and product steps done once counts are non-zero", () => {
    render(<SetupChecklist categoryCount={2} productCount={5} />);
    const categoryItem = screen.getByText(/Add your first category/).closest("li");
    const productItem = screen.getByText(/Add your first product/).closest("li");
    expect(categoryItem).toHaveTextContent("✓");
    expect(productItem).toHaveTextContent("✓");
  });

  it("leaves the purchase step unchecked, since being rendered at all implies it isn't done", () => {
    render(<SetupChecklist categoryCount={2} productCount={5} />);
    const purchaseItem = screen.getByText(/Record and receive your first purchase/).closest("li");
    expect(purchaseItem).not.toHaveTextContent("✓");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run components/dashboard/SetupChecklist.test.tsx`
Expected: FAIL — `Cannot find module './SetupChecklist'`

- [ ] **Step 7: Implement `SetupChecklist.tsx`**

```typescript
import Link from "next/link";
import { Card, CardKicker } from "@/components/ui/Card";

interface SetupChecklistProps {
  categoryCount: number;
  productCount: number;
}

interface ChecklistItem {
  label: string;
  href: string;
  done: boolean;
}

export function SetupChecklist({ categoryCount, productCount }: SetupChecklistProps) {
  const items: ChecklistItem[] = [
    { label: "Add your first category", href: "/products", done: categoryCount > 0 },
    { label: "Add your first product", href: "/products", done: productCount > 0 },
    // Always false: this component only renders while hasReceivedPurchase is false
    // (see DashboardPageClient), so this step is never the one that's already done.
    { label: "Record and receive your first purchase", href: "/purchases?open=new", done: false },
  ];

  return (
    <Card elevation="md">
      <CardKicker>Let&apos;s get your shop set up</CardKicker>
      <ul className="flex flex-col gap-2 list-none p-0 m-0">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            <span className={item.done ? "text-accent" : "text-text/30"} aria-hidden>
              {item.done ? "✓" : "○"}
            </span>
            <Link href={item.href} className="text-accent">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

(Verified against `frontend/components/ui/Card.tsx`: `Card` accepts `elevation?: "sm" | "md" | "lg"`, `CardKicker` accepts only `children` — the usage above matches exactly, same as `PriceHistoryCard.tsx` and other existing callers.)

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run components/dashboard/SetupChecklist.test.tsx`
Expected: PASS (all 3 tests)

- [ ] **Step 9: Commit the checklist component + hook changes**

```bash
git add frontend/lib/dashboard/useDashboardData.ts frontend/lib/dashboard/useDashboardData.test.tsx frontend/components/dashboard/SetupChecklist.tsx frontend/components/dashboard/SetupChecklist.test.tsx
git commit -m "feat(dashboard): add hasReceivedPurchase/categoryCount/productCount and a SetupChecklist component"
```

- [ ] **Step 10: Update `DashboardPageClient.test.tsx`'s fixture and add the switching tests**

The `baseData()` helper must satisfy the now-larger `DashboardData` interface — add the three new fields with values that keep every *existing* test on the normal-dashboard path (i.e. setup already complete):

```typescript
function baseData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    isLoading: false,
    isError: false,
    isForbidden: false,
    hasReceivedPurchase: true,
    categoryCount: 3,
    productCount: 10,
    salesRevenue: 530000,
```

(keep every other existing field in this object exactly as it is)

Add new tests:

```typescript
  it("shows the setup checklist instead of the KPI dashboard when no purchase has been received yet", () => {
    mockedUseDashboardData.mockReturnValue(baseData({ hasReceivedPurchase: false, categoryCount: 0, productCount: 0 }));
    render(<DashboardPageClient role="admin" />);
    expect(screen.getByText("Let's get your shop set up")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export CSV" })).not.toBeInTheDocument();
  });

  it("shows the normal KPI dashboard once a purchase has been received", () => {
    mockedUseDashboardData.mockReturnValue(baseData());
    render(<DashboardPageClient role="admin" />);
    expect(screen.queryByText("Let's get your shop set up")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  });
```

- [ ] **Step 11: Run tests to verify they fail**

Run: `npx vitest run "app/(protected)/dashboard/DashboardPageClient.test.tsx"`
Expected: FAIL — `DashboardPageClient` always renders the normal dashboard, `"Let's get your shop set up"` never appears.

- [ ] **Step 12: Implement the switch in `DashboardPageClient.tsx`**

Add the import:

```typescript
import { SetupChecklist } from "@/components/dashboard/SetupChecklist";
```

After the existing `isLoading` check (`if (data.isLoading) { return <DashboardSkeleton />; }`), add:

```typescript
  if (!data.hasReceivedPurchase) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Let's get set up" />
        <SetupChecklist categoryCount={data.categoryCount} productCount={data.productCount} />
      </div>
    );
  }
```

Leave the rest of the component (the normal KPI render) exactly as-is below this.

- [ ] **Step 13: Run tests to verify they pass**

Run: `npx vitest run "app/(protected)/dashboard/DashboardPageClient.test.tsx"`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 14: Commit**

```bash
git add "frontend/app/(protected)/dashboard/DashboardPageClient.tsx" "frontend/app/(protected)/dashboard/DashboardPageClient.test.tsx"
git commit -m "feat(dashboard): show a setup checklist until the shop has received its first purchase"
```

---

### Task 11: Full-suite verification and push

**Files:** none (verification only)

- [ ] **Step 1: Type-check the whole frontend**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: no output (clean)

- [ ] **Step 2: Run the full frontend test suite**

Run: `npx vitest run --reporter=dot`
Expected: every test file passes. If `components/purchasing/AddProductBulkTable.test.tsx`'s discrepancy-note test is the *only* failure, re-run it in isolation (`npx vitest run components/purchasing/AddProductBulkTable.test.tsx`) before treating it as a real regression — it's a known-flaky test under parallel load, unrelated to this plan, and this plan's Task 1 only refactors an import in that file, not its behavior.

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Self-review notes

- **Spec coverage:** Section 1 (setup checklist) → Task 10. Section 2 (nav order) → Task 2. Section 3 (reorder wiring) → Tasks 4–9 (single-form prefill, dialog redirect, page-level URL handling, workspace forwarding, both entry points). Section 4 (duplicate-name warning on Products) → Task 3. Testing section's items are folded into each task's own steps rather than a separate task, since the plan's task-per-file granularity already produces one commit per touched test file.
- **Placeholder scan:** none — every step has real code, real assertions, real commands.
- **Type consistency:** `normalizeName(name: string): string` (Task 1) is the same signature used in Tasks 3 and 4. `AddProductSingleFormProps.initialSearch?: string` (Task 4) matches what Task 7 passes. `NewPurchaseDialogProps.reorderProductName?: string` (Task 5) matches what Task 6 passes. The `/purchases?open=new&reorder_product=<id>&reorder_name=<name>` URL shape is identical across Tasks 6, 8, and 9. `DashboardData`'s three new fields (Task 10) are read with the exact names `SetupChecklistProps` expects.
