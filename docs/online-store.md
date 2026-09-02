# Phase 9 — Online Store & Delivery

Public, Arabic-first (ar-EG, RTL) online storefront with guest checkout, COD and
**optional online (Kashier) payment**, an explicit server-validated order state
machine, inventory reservation, server-side catalog search/filtering/pagination,
delivery workflow with a dedicated DELIVERY role, admin order management, guest
tracking, SEO, and rate limiting.

This document describes the implemented Phase 9 slice (9.0/9.1/9.2) of **Nexa
Retail**. It builds on the existing catalog, inventory, sales, cashier-shift,
café, auth and RBAC domains rather than creating parallel structures.

---

## 1. Goals & scope

- Expose a subset of the internal catalog (products flagged `onlineVisible`)
  on a public, indexable storefront under `/store`.
- Guest cart (Zustand + localStorage) and one-page checkout.
- Payments:
  - **Cash on Delivery (COD)** — default, always available.
  - **Online (electronic)** via the **Kashier** gateway (Payment Sessions API
    v3) — optional, only offered when the merchant supplies Kashier credentials
    (see §4.5). No fabricated payment success: capture is confirmed by a verified
    server webhook.
- Server-side catalog search, category filtering, and pagination with bounded,
    indexed queries (the full catalogue is never loaded into the browser).
- Explicit order lifecycle enforced by a server-side state machine.
- Inventory is **reserved at checkout and committed at delivery** via a new
  reservation ledger; no overselling.
- Delivery workflow for a dedicated DELIVERY role.
- Admin order management for Owner/Manager.
- Server is authoritative for every price, total, stock, and state. No
  client-trusted values.

---

## 2. Terminology / route map

| Route | Purpose | Auth |
| --- | --- | --- |
| `/store` | Product catalog (grid + search/filter/pagination) | public |
| `/store/products/[id]` | Product detail | public |
| `/store/cart` | Cart review | public |
| `/store/checkout` | Checkout (address + payment method) | public |
| `/store/payment/return` | Post-Kashier redirect acknowledgment (UX only) | public |
| `/store/track` | Guest order tracking | public (token) |
| `/api/payments/kashier-webhook` | Kashier server notification (authoritative) | webhook signature |
| `/online-orders` | Admin order management (dashboard) | `online.orders.read` |
| `/online-orders/[id]` | Order detail (customer, address, items, totals, payment, history) | `online.orders.read` |
| `/delivery` | Delivery workflow board | `delivery.orders.read` |

The storefront lives in the `(store)` route group; the internal app in the
`(dashboard)` group. The dashboard layout stays `robots: noindex`; the store is
indexable.

---

## 2.5 Admin order dashboard

The `الطلبات` (`/online-orders`) dashboard is a server-driven, RTL management
table. It is gated server-side by `online.orders.read` and never loads the full
order set into the browser:

- **Server-side filtering + pagination.** `listOnlineOrdersPage(actor, query)`
  accepts `status`, `paymentState` (`PAYMENT_PENDING`/`PAID_ONLINE`/
  `PAID_AT_DELIVERY`), `paymentMethod` (`COD`/`ONLINE`), a `from`/`to` created
  date range, and a free-text `search` across order number, customer name, and
  customer phone (literal-regex, escaped, anchored). Page size is clamped to
  `ONLINE_ORDERS_PAGE_MAX` (100); the default is 20. An out-of-range page is
  clamped to the last page. Returns `{ items, total, page, pageSize, totalPages }`.

- **Client controls are thin.** The dashboard column (order number, customer,
  phone, created date/time, payable total, payment method/state, order status)
  only sends validated filter/page values to the action; all rows and totals are
  the server's persisted snapshot (`OnlineOrderDto`). Loading, empty, and error
  states are shown; pagination re-queries the server.

- **Status changes go through the state machine.** The "تقدم" (advance) and
  "إلغاء" (cancel) buttons call `transitionOnlineOrderAction`, which re-validates
  `ALLOWED_NEXT` and the actor's permission server-side. No arbitrary client
  status value is accepted; a forwarded step that needs `delivery.orders.update`
  (e.g. `READY_FOR_DELIVERY → OUT_FOR_DELIVERY`) is re-authorized there.

- **Detail view.** `/online-orders/[id]` is a server component that re-checks
  `online.orders.read` (redirects a non-holder home, `notFound()` on a missing
  or invalid id) and renders the full persisted order: customer info, delivery
  address, line items with quantity / unit price / line total, subtotal, delivery
  fee, payable total, payment method & state, order status, created timestamp,
  and the append-only `statusHistory`. Transition actions appear only when the
  caller holds `online.orders.manage` (admin ladder) and the order is not terminal.

---

## 3. Domain model (new)

### `OnlineOrder` (`src/models/online-order.ts`)

A guest order. COD means it is created unpaid and stays `PAYMENT_PENDING` until
a delivery employee collects cash at delivery. An ONLINE order is captured by
the verified Kashier webhook (`PAID_ONLINE`).

- **Order number**: `ON-YYYYMMDD-NNNN` via the shared `nextSequenceValue`
  atomic counter.
- **Status** (`OnlineOrderStatus`):
  `PENDING → CONFIRMED → PREPARING → READY_FOR_DELIVERY → OUT_FOR_DELIVERY → DELIVERED`,
  any active state → `CANCELLED`.
  `TERMINAL_ONLINE_STATUSES = [DELIVERED, CANCELLED]`.
- **Payment method** (`OnlineOrderPaymentMethod`): `COD` (default) | `ONLINE`;
  recorded on the order document at checkout.
- **Payment** (`OnlinePaymentState`):
  `PAYMENT_PENDING | PAID_AT_DELIVERY | PAID_ONLINE`; `paymentCollected` boolean.
  - `PAID_AT_DELIVERY` — COD cash collected at delivery.
  - `PAID_ONLINE` — set only by the verified Kashier webhook
    (`markOnlineOrderPaid`); `onlinePayment` records the gateway transaction.
  - Phase 9.3: for ONLINE orders a **pending payment reference** is persisted
    when the Kashier session is created — `onlinePayment {
    sessionId, paymentToken, initiatedAt, transactionId, status, paidAt }`.
    `sessionId`/`paymentToken`/`initiatedAt` survive a redirect/refresh and are
    never forged by the client; `transactionId`/`status`/`paidAt` are populated
    only by the verified webhook capture.
- **Items** snapshot product id, name, unit price, quantity, line total and
  `reservedQuantity` at creation.
- `deliveryAddress` snapshot (`fullName/phone/city/area/street/landmark/notes`).
- `trackingToken`: a per-order secret returned **once** at checkout so guests
  track their own order without login and without exposing other customers (no
  IDOR).
- `assignedTo` a delivery employee { id, username }.
- `saleId` (sparse-unique), `invoiceNumber`, `codCollectedAt` record the
  immutable Sale posted at delivery (COD cash or ONLINE non-cash).
- `version`: optimistic-concurrency counter bumped on every transition.
- `statusHistory`: full, immutable audit trail (idempotent, replay-safe).
- `idempotencyKey` (sparse-unique): prevents duplicate checkout submissions and
  duplicate Sale posting.
- Indexes: `{status, createdAt}`, `{trackingToken, orderNumber}`,
  `{assignedTo, status}`, plus `orderNumber` (unique) and `saleId`/`idempotencyKey`
  sparse uniques.

### `InventoryReservation` (`src/models/inventory-reservation.ts`)

A ledger row that holds stock for an online order between checkout and
delivery/cancel. Statuses: `RESERVED | FULFILLED | RELEASED | EXPIRED`.

- One reservation per unique product per order, with a 1-hour `expiresAt` TTL
  on abandoned checkouts (status/computation treats expired `RESERVED` rows as
  inactive).
- `reservationKey` = the order's tracking token.
- Index: `{product, status, expiresAt}`.

Availability is computed as:

```
available = currentSellable − sum(active RESERVED reservations)  (never negative)
```

where `currentSellable` comes from the existing inventory rules (non-expiry:
`InventoryState.onHand`; expiry-tracked: sum of non-expired batches).

---

## 4. Architecture decisions

### 4.1 Online order ↔ Sale / payment relationship

The `OnlineOrder` is **not** a `Sale` at creation. Until the payment is
collected/captured the order holds *no* financial documents — no fabricated
payment success is ever recorded (BR: no fabricated payment success).

At **delivery**, a real `Sale` is posted through the existing
`createSaleWithSession`, against the delivering employee's **open cashier
shift**, so the revenue enters the daily shift accounting and inventory
consumption happens through the normal SALE stock movement. This mirrors the
Phase 7.1 café integration. The payment recorded on that Sale depends on the
order's method:

- **COD** (`collectCodAndDeliver`): a single `CASH` payment.
- **ONLINE** (`deliverPaidOnlineOrder`): a single non-cash `ONLINE` payment —
  the money was already captured by the gateway, so recording it as a non-cash
  method records revenue into Sale-based reporting without ever touching the
  till's expected cash.

Both delivery functions run entirely inside one MongoDB transaction:
1. Validates the order is `OUT_FOR_DELIVERY` and not already
   delivered/terminal; ONLINE additionally requires `paymentState === PAID_ONLINE`
   and `paymentCollected`.
2. Calls `createSaleWithSession` (shift-bound, idempotency-keyed
   `cod-{orderNumber}-{orderId}` for COD / `online-{orderNumber}-{orderId}` for
   ONLINE). It throws `افتح وردية أولاً…` when the deliverer has no open shift.
3. Marks the order `DELIVERED` (retaining `PAID_AT_DELIVERY` for COD or
   `PAID_ONLINE` for online), linking `saleId`/`invoiceNumber`/`codCollectedAt`.
4. Marks the order's reservations `FULFILLED`.
5. Audits `online.order.collected` / `online.order.delivered`.

The Order + Sale + inventory + reservations commit or roll back together.

### 4.2 Inventory strategy — reserve at checkout, commit at delivery

- **Checkout**: validates availability (sellable − active reservations) in the
  transaction, creates the order, and writes `RESERVED` reservations (1h TTL).
- **Delivery (COD)**: the posted Sale consumes the reserved stock and the
  reservations become `FULFILLED`.
- **Cancellation**: reservations become `RELEASED`, returning the stock to the
  available pool.

Reservations do **not** decrement `InventoryState.onHand` — they only reduce
*online* availability. Actual stock is consumed by the Sale at delivery.

**Known limitation (documented):** the reservation protects against *online*
double-spend. `createSaleWithSession` validates `stock.sellable >= qty` against
`onHand`/batches (not reservation-aware), so a concurrent POS retail sale could
consume stock that an online order holds reserved. Recommended future work: a
POS-reservation check or a unified reservation-aware stock reservation layer
(see §8).

### 4.3 Payment representation

- **COD** is modelled as `paymentState = PAYMENT_PENDING` until a real `Sale`
  records the cash receipt at delivery. There is no "fake paid" state;
  `paymentCollected` becomes true exactly when the Sale is posted. Re-collection
  is rejected.
- **ONLINE** is modelled as `paymentState = PAYMENT_PENDING` at checkout, then
  `PAID_ONLINE` set **only** by the verified Kashier webhook
  (`markOnlineOrderPaid`), which also captures the gateway `transactionId`. The
  browser redirect-return page never marks an order paid. `paymentCollected`
  flips to true at webhook capture; delivery then posts the non-cash Sale.

### 4.4 Delivery authorization

- The **DELIVERY** role is granted `delivery.orders.read`,
  `delivery.orders.update`, `online.orders.read`, `receipts.print`, and — so a
  delivery employee can open a shift and collect cash — `sales.create`,
  `sales.read`, `shifts.open`, `shifts.read`.
- `listDeliveryOrders` scope: Owner/Manager see `READY_FOR_DELIVERY | OUT_FOR_DELIVERY`;
  a DELIVERY employee sees orders assigned to them (non-terminal) plus
  `READY_FOR_DELIVERY` unassigned.
- Status transitions:
  - Any target requires `online.orders.manage`, **except** dispatching an order
    (`target = OUT_FOR_DELIVERY`) which requires `delivery.orders.update`.
  - A delivery employee cannot mark an order `DELIVERED` directly — that requires
    `online.orders.manage` or the financial delivery functions
    `collectCodAndDeliver` / `deliverPaidOnlineOrder` (which require
    `delivery.orders.update` **or** `online.orders.manage`, plus `sales.create`
    enforced inside `createSaleWithSession`).

### 4.5 Online (Kashier) payment gateway — Phase 9.2

The optional electronic payment uses the official **Kashier Payment Sessions
API v3**. Design rules (see `src/lib/kashier.ts`):

- **Disabled by default.** All of `KASHIER_API_KEY`, `KASHIER_SECRET_KEY` and
  `KASHIER_MERCHANT_ID` must be set for online checkout to be offered
  (`isKashierConfigured()`). `KASHIER_MODE` (`test|live`, default `test`)
  selects the API base. No other feature changes when the gateway is off — COD
  remains the default.
- **Session created after commit.** Checkout creates the `OnlineOrder` +
  reservations in a transaction, then — only for ONLINE — creates a Kashier
  session **after** the transaction commits, so the DB transaction is never held
  open across an external HTTP call. The browser is redirected to the returned
  hosted payment page (HPP).
- **Authoritative capture is the webhook.** `POST /api/payments/kashier-webhook`
  verifies the payload's HMAC-SHA256 signature (constant-time, over the payload's
  own ordered `signatureKeys`, using the webhook signing key with a secret-key
  fallback) and, only on match, calls `markOnlineOrderPaid`. The route is
  idempotent and acks 200 for verified notifications.
- **Redirect return is UX only.** `/store/payment/return` verifies the redirect
  signature and reports status/link to tracking, but never marks paid.
- **Pending payment reference (Phase 9.3).** When the session is created the
  server persists `onlinePayment { sessionId, paymentToken, initiatedAt }` on
  the order *before* the redirect, so a pending electronic-payment reference
  survives a redirect/refresh and is never forged by the client. The order stays
  `PAYMENT_PENDING` until the verified webhook captures it.
- **Config-aware, honest method surfaces (Phase 9.3).** The storefront offers
  **one** electronic option, labelled «الدفع الإلكتروني عبر كاشير», only when
  the gateway is configured — it is never fabricated and specific wallets/cards
  (Vodafone Cash, InstaPay, …) are **not** hard-coded or faked. When the gateway
  is unconfigured the checkout shows a clear message that electronic payment is
  unavailable and only COD is offered. This is the **root-cause of "only COD"**
  installing a fresh copy: `onlinePaymentAvailableAction() → isKashierConfigured()`
  returns `false` until the merchant supplies `KASHIER_API_KEY` /
  `KASHIER_SECRET_KEY` / `KASHIER_MERCHANT_ID`. The customer already inside
  Kashier's HPP chooses the actual method there (card/wallet) per their account.
- **Init-failure is never success.** If the session cannot be created (gateway
  unreachable) the order persists unpaid (`PAYMENT_PENDING`) and the customer is
  told clearly; no fabricated payment success is recorded.
- **Non-cash accounting.** `ONLINE` was added to `PAYMENT_METHODS` as a non-cash
  method (label «دفع إلكتروني»), so online revenue flows into Sale-based reports
  and dashboards without affecting a till's expected cash.
- **Amount integrity.** `markOnlineOrderPaid` rejects a captured amount that
  does not match the order's `payableAmount`.
- **Contracts.** Session POST to `{base}/v3/payment/sessions` with headers
  `Authorization: {secret_key}`, `api-key: {api_key}`,
  `Content-Type: application/json`; body uses `redirectUrl`, `serverWebhook`,
  `order.orderReference = orderNumber`, `allowedMethods: "card,wallet"`. Session
  and webhook signature verification are covered by pure unit tests in
  `src/test/kashier.test.ts`.

---

## 5. State machine

`s transitionOnlineOrder`, guarded by optimistic concurrency
(`findOneAndUpdate` on `{_id, version}`; rejects stale writers) and re-validated
against `ALLOWED_NEXT`. `statusHistory` appends every transition.

```
PENDING ──→ CONFIRMED ──→ PREPARING ──→ READY_FOR_DELIVERY ──→ OUT_FOR_DELIVERY ──→ DELIVERED
   │           │             │                 │                      │
   └───────────┴─────────────┴─────────────────┴──────────────────────┴───────────→ CANCELLED
```

- `CANCELLED` releases `RESERVED` reservations → `RELEASED`.
- `DELIVERED` via plain `transitionOnlineOrder` is the non-financial path
  (admin). The cash workflow uses `collectCodAndDeliver`, which requires the
  order to be `OUT_FOR_DELIVERY`.

---

## 6. Public storefront notes

- Server Components call `searchOnlineProducts` (bounded: `pageSize` default 24,
  max 48, `page` max 1000, anchored prefix regex on name, category filter by
  `ObjectId`, backed by the `{onlineVisible, active, category, name}` index) and
  `getOnlineCategories`. The full catalogue is **never** loaded into the browser;
  `/store` pages via `search?=`/`category=`/`page=` query params. `getOnlineProduct`
  drives product detail.
- `AddToCartButton` / cart / checkout are client components using the Zustand
  guest cart (localStorage `nexa-store-cart`). The cart holds display price for
  UX only; the server recomputes and re-validates all totals at checkout.
- Checkout validates `onlineCheckoutSchema` (Zod) client **and** server side.
  The payment selector shows COD (default) plus ONLINE only when the gateway is
  configured (`onlinePaymentAvailableAction`). For ONLINE, checkout stores
  `{orderNumber, token}` in `sessionStorage` (survives the cross-origin round
  trip) and redirects to the Kashier HPP; the cart is cleared on confirmed
  payment. For COD it clears the cart and redirects to tracking.
- A guest receives the order number + tracking token once after checkout
  (redirect to `/store/track?orderNumber=…&token=…`).
- **Brand display (Phase 9.3).** The storefront product card and product detail
  render the product's brand name + logo through a small `BrandBadge`
  (`src/components/store/brand-badge.tsx`). The brand logo is stored inline on
  the `Brand` document as a **data-URI** image (no external upload/hosting infra,
  no added dependencies), validated server-side (supported raster mime + ≤ 512 KB
  decoded). A product without a logo shows a text-initial tile; a product without
  a brand renders no badge. `OnlineProductDto` carries `brandName`/`brandLogo`,
  populated via selective `.populate("brand", "name logo")` in the three bounded
  online catalog queries — brand info is added without N+1 lookups and without
  loading the whole catalog.

---

## 7. SEO & rate limiting

- `src/app/robots.ts`: allows `/store`, `/store/products`, `/store/track`;
  disallows internal routes; publishes `sitemap.xml`.
- `src/app/sitemap.ts`: public store entry points (no Mongo dependency at build).
- Product pages carry title/OG metadata via the store layout.
- `src/lib/rate-limit.ts`: minimal in-memory sliding-window limiter applied to
  `createOnlineOrderAction` (20 orders/min per client). Documented as a
  single-instance first-line guard; replace with a platform limiter in
  multi-instance/edge deployments.

---

## 8. Known limitations / deferred

- POS sales are not reservation-aware (see §4.2).
- Online payment depends on the merchant configuring their Kashier credentials;
  electronic checkout is hidden until then (see §4.5).
- Brand logos are stored inline as data-URI strings (≤ 512 KB each, validated),
  which is simple and dependency-free but adds to the `Brand` document size and
  is not ideal for high-volume imagery; a hosted/object-storage upload pipeline
  is deferred (product images are already a noted Phase 9 item).
- `InventoryReservation.EXPIRED` rows are treated as inactive in availability
  computations but are not garbage-collected; add a TTL/cleanup job.
- Delivery scope on `transitionOnlineOrder` is enforced by the state machine +
  permission, not by per-employee-order ownership on the direct id path; the
  UI only exposes eligible orders via `listDeliveryOrders`.
- Online order receipt/print on the posted Sale invoice is deferred (printing
  baseline already exists for the Sale).

---

## 9. Verification

See `src/test/online-store.test.ts` (32 tests covering catalog visibility,
availability/reservations, oversell rejection, idempotency, server price
authority, tracking token protection, admin ladder + illegal transitions,
cancellation release, assignment, delivery scope, delivery RBAC, COD financial
integration incl. shift requirement and re-collection rejection, bounded catalog
search/filter/pagination, the ONLINE webhook-capture + non-cash delivery flow,
the Phase 9.3 pending-payment-reference persistence, the Phase 9.3
storefront brand name/logo projection incl. the no-brand fallback, and the
Phase 9.3 admin dashboard listing — server filters by status/payment
state/method, search by number/name/phone, date-range, clamped pagination,
`online.orders.read` enforcement, and cancel-through-transition).
Kashier signature contracts are covered by `src/test/kashier.test.ts`
(13 tests: redirect + webhook signing/verification, order-sensitivity,
tamper/short-key rejection, legacy signature fallback, order reference
extraction, and paid-status detection).

---

## 10. Store catalogue seed (Phase 9.1)

The public store needs real products to be useful in development. `npm run
seed:store` (script `scripts/seed-store.ts`, core `src/lib/store-seed/`)
generates and loads a realistic Egyptian supermarket & café catalogue. It is a
**dev/test seed** — guarded against production and clearly labeled as seed data,
not runtime data.

### What it does

- **Generates 1065 products deterministically** from hand-maintained Egyptian
  brands, products, categories (produce, dairy, bakery, beverages, snacks,
  frozen, household, personal care, café beverages/desserts), units, accents
  like `المراعي`/`جهينة`/`الشمس`/`بيبسي`/`كوكاكولا`, Arabic descriptions, and a
  repeatable inventory profile (per-item `initialStock` with ~7% stockouts).
- **Deterministic EAN-13 barcodes** (`290...,` computed check digit) and unique
  SKUs so the seed is stable across runs and never collides.
- **Category/brand upsert** — reuses existing categories/brands by name; creates
  them only when missing.
- **Idempotent product insert** — products are matched to existing rows by
  barcode; re-running only adds the missing products and never overwrites
  existing names, prices, stock, or online visibility.
- **Initial stock** is recorded through the same invariants the inventory
  service enforces for a real purchase receipt — `InventoryState.onHand` set to
  the received quantity, an append-only `PURCHASE` `StockMovement` (with the
  Arabic reason), and future-dated `ProductBatch` rows for expiry-tracked items
  (`~2 years`, mirroring `docs/business-rules.md`). This keeps
  `product stock === InventoryState.onHand` and the ledger auditable. Bulk
  writes are used so a 1000+ product catalogue seeds quickly and reliably even
  on standalone local MongoDB (no multi-document transaction support).
- **Skip slug fields** (per project decision) — the store routes by `_id`; name
  uniqueness already exists, so no slug is introduced.

### Idempotency & resumability

- Products already present (by barcode) are not re-inserted.
- Products whose stock was already received (`InventoryState.onHand > 0`) are
  not re-stocked, so re-runs neither duplicate movements nor inflate stock.
- A run interrupted mid-way can simply be re-run to finish the work.

### Usage

```bash
npm run seed:store
```

### Verification

`src/test/store-seed.test.ts` (10 tests) covers: product counts/unique barcodes,
duplicate-free generation, correct EAN-13 check digits, category/brand wiring,
online visibility gating, idempotency (re-run adds nothing and does not
overwrite), stock-receiving equality (`InventoryState.onHand` + `PURCHASE`
movements match the generated catalogue), expiry batches, seed-actor audit
fields, and that visible products have positive stock while hidden stockout
lines are excluded.
