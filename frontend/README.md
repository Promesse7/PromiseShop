# Promise Electronic Shop — Frontend

Next.js 15 (App Router) + TypeScript frontend for the Promise Electronic Shop inventory/POS
system, built against the Django REST backend in `../backend`.

## Setup

1. Copy the environment template:
   ```bash
   cp .env.local.example .env.local
   ```
2. Ensure the Django backend is running (`cd ../backend && docker compose up -d`).
3. Install dependencies and run the dev server:
   ```bash
   npm install
   npm run dev
   ```
   The app is now at `http://localhost:3000`.

## Testing

- `npm run test` — Vitest component and BFF route handler tests.
- `npm run test:e2e` — Playwright E2E smoke tests (requires the Django backend running with
  `staff1`/`staffpass` and `admin1`/`adminpass` fixture employees — see Phase 1's plan for the
  exact creation command). The checkout e2e test additionally requires a fixture product
  (`PES-E2E-00001`) — see the comment at the top of `e2e/checkout.spec.ts` for the exact
  creation command. `products.spec.ts` reuses the same `PES-E2E-00001` fixture — no new fixture
  needed.

## Architecture

- `app/` — Next.js App Router pages and API routes (the BFF).
- `app/api/auth/` — login/logout/session routes; hold JWTs in httpOnly cookies, never expose
  them to browser JS.
- `app/api/proxy/[...path]/` — generic authenticated proxy to the Django API; every domain
  page's data fetching goes through this, not directly to Django.
- `components/ui/` — the Nocturne-themed component library (Button, Card, Field, Tag, Table,
  Dialog, SegmentedToggle, Toast) — reused across every phase.
- `components/layout/` — Nav, the role-gating logic, `Providers` (wraps the app in the
  TanStack Query client) and `ToastProvider` (app-wide toast notifications).
- `components/pos/` — the POS checkout screen: `PosCheckout` (orchestrator), `ScanSearchField`,
  `CartTable`/`CartCards` (responsive cart views), and `Receipt`.
- `components/products/` — the product catalog screens: `ProductTable`, six product-detail cards
  (`StockCard`, `PricingCard`, `CatalogInfoCard`, `InfoSheetCard`, `SpecificationsCard`,
  `PriceHistoryCard`), and two dialogs (`ProductFormDialog` for create/edit, `SetPriceDialog`).
- `lib/products/` — `useCatalogProducts`/`useProductDetail` (data hooks, sharing the POS
  checkout's TanStack Query cache keys) and `productForm.ts` (create/edit payload + validation).
- `lib/` — `auth.ts` (session/cookie helpers), `api-client.ts` (fetch wrapper for TanStack
  Query), `query-client.ts`, `types.ts`.

## Phase 1 (Foundation) — complete

Project scaffold, Nocturne design tokens ported into Tailwind, core UI component library, auth
BFF with token-refresh retry, login screen, role-gated nav shell.

## Phase 2 (Sales/Checkout) — complete

`/checkout` is a real feature: scan a barcode or search by name, build a cart, pick a payment
method, and complete a sale against the Django API, ending on a printable receipt with a "New
sale" reset. `/dashboard` remains a minimal "Coming soon" stub. Other domain screens (purchases,
stock/equipment, finance, notifications, admin dashboard) are not yet built. The nav already
links to some of their routes (`/purchases`, `/stock`, `/sales`, `/employees`) — these currently
404 until a later phase adds the corresponding pages.

## Phase 3 (Catalog) — complete

`/products` (search, category filtering, role-gated create) and `/products/[id]` (stock, pricing
— admin only, catalog info with derived "track serials", usage info sheet with real print,
specifications, price history, admin-gated edit) are real features. Purchases, stock/equipment,
finance, notifications, and the admin dashboard are not yet built; the nav still links to some of
those routes (`/purchases`, `/stock`, `/sales`, `/employees`), which currently 404.
