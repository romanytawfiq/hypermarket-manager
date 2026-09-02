# Nexa Retail

نكسا ريتيل — منصة إدارة التجزئة والكافيه

Nexa Retail is a **full-stack Retail & Café Management Platform** designed for supermarkets and cafés. It helps employees manage day-to-day operations without requiring advanced computer skills.

The platform is **Arabic-first**: the default locale is `ar-EG` and the default text direction is **RTL**. All user-facing interfaces are designed for Arabic from the beginning, not translated afterward.

> **Status: Phase 11 Production Hardening Complete**
> Phases 0–7.1, Phase 8 (Printing), Phase 9 (Online Store & Delivery), and the Phase 10/11 financial-integrity & security audits are implemented. Phase 8 delivers Arabic RTL browser thermal printing (58mm/80mm) for sales, café, and payment receipts via a dedicated non-indexable print route. Phase 9 delivers a public Arabic-first `/store` front (guest cart, checkout, COD/online payment), an online-order state machine with inventory reservation, a DELIVERY role and delivery board, admin order management, guest tracking, SEO and rate limiting. See [Development Status](#development-status).

---

## Table of Contents

- [Project Overview](#project-overview)
- [Business Goals](#business-goals)
- [Main Users](#main-users)
- [Main Modules](#main-modules)
- [Core Workflows](#core-workflows)
- [Technology Stack](#technology-stack)
- [Architecture Overview](#architecture-overview)
- [UI/UX Direction](#uiux-direction)
- [Printing](#printing)
- [Online Store](#online-store)
- [Documentation](#documentation)
- [Development Status](#development-status)

---

## Project Overview

Nexa Retail supports the full retail and café operation of a supermarket:

- Point of sale (POS) and cashier operations
- Cashier shifts with cash reconciliation
- Multiple payment methods on a single transaction
- Customer credit / receivables
- Supplier accounts / payables
- Purchases and receiving
- Inventory, expiry tracking, and replenishment
- Café orders and barista workflow
- Thermal receipt printing
- Online store and delivery
- Daily, monthly, and yearly reporting
- Role-based access for employees

The platform is designed as a **production business application**, not a demo dashboard. Every feature is built around a real business workflow.

---

## Business Goals

The system reduces everyday operational problems such as:

- Forgotten café orders
- Inventory mistakes and stockouts
- Cash discrepancies at shift close
- Supplier-account confusion
- Customer-credit confusion
- Manual reporting
- Expired stock
- Unnecessary work when receiving supplier deliveries

Specifically, the platform handles:

| Area | What the system enables |
|------|-------------------------|
| **Cashier operations** | Fast, reliable point-of-sale with barcode and search. |
| **Cashier shifts** | Shift open with opening cash, expected vs actual cash, and variance tracking at close. |
| **Mixed payments** | A single sale settled with multiple methods (e.g., Cash + Visa + Vodafone Cash). |
| **Customer credit** | Credit sales, partial payments, and outstanding receivables. |
| **Supplier balances** | Outstanding payables derived from recorded purchases and payments. |
| **Purchasing** | Purchase recording and stock receiving with accepted/rejected quantities. |
| **Inventory** | Transaction-driven stock tracking that is fully auditable. |
| **Expiry tracking** | Batch/lot tracking for products that require expiry management. |
| **Replenishment** | Suggestions for what to reorder from a supplier. |
| **Café / Barista workflow** | Order creation by the cashier and a dedicated barista order board. |
| **Thermal printing** | Arabic RTL receipts for 58mm and 80mm thermal printers. |
| **Online store** | Public catalog, cart, checkout, and order tracking sharing the same product domain. |
| **Delivery** | Explicit delivery statuses and order fulfillment. |
| **Reporting** | Daily, weekly, monthly, and yearly reports generated from real transactions. |

---

## Main Users

| Role | Primary needs |
|------|---------------|
| **Owner** | Business overview, sales/profit reports, inventory visibility, supplier balances, customer debts, employee activity, monthly and yearly reports. |
| **Manager** | Operational monitoring, shift management, inventory, supplier receiving, returns, approvals, reports. |
| **Cashier** | Fast POS, barcode/product search, multiple payment methods, customer credit, shift open/close, receipt printing, café order creation. |
| **Accountant** | Invoices, supplier accounts, customer accounts, payments, expenses, financial reports. |
| **Warehouse Employee** | Stock receiving, stock movements, expiry monitoring, stock counts, purchase suggestions. |
| **Barista** | New orders, preparing orders, ready orders, completed orders. |
| **Online Customer** | Product browsing, search, cart, checkout, delivery address, order tracking. |

---

## Main Modules

The platform is organized into the following major domains:

1. **Authentication & Authorization** — roles and permissions.
2. **Dashboard** — role-aware business overview with KPIs, sales trends, inventory alerts, financial summaries, and quick actions.
3. **POS** — retail checkout and payments.
4. **Cashier Shifts** — opening cash, transactions, closing reconciliation.
5. **Inventory** — products, stock, stock movements, expiry, adjustments.
6. **Suppliers** — supplier accounts, purchases, payments, balances.
7. **Customers** — customer profiles, credit sales, payments, balances.
8. **Accounting** — expenses, receivables, payables, reports.
9. **Café** — orders and the barista workflow.
10. **Printing** — receipts and printable business documents.
11. **Online Store** — public catalog, cart, checkout, orders.
12. **Delivery** — delivery status and order fulfillment.
13. **Reports** — daily, weekly, monthly, yearly, product, cashier, supplier, customer, and payment reports.

---

## Core Workflows

The most important business workflows include:

- **Cashier shift** — login → open shift with opening cash → process sales → record cash movements → close shift → calculate expected cash → enter actual cash → compute variance.
- **Retail sale** — scan/search product → add item → set quantity → choose payment method(s) → server validation → create sale → create payments → create inventory movements → print receipt.
- **Mixed payment** — a single sale settled with multiple methods whose sum equals the payable total (unless it is explicitly a credit or partial sale).
- **Credit sale** — create sale → select customer → check credit rules → create receivable → update inventory.
- **Customer payment** — find customer → view outstanding balance → record payment → reduce receivable.
- **Supplier visit / receiving** — find supplier → create receiving session → enter invoice → add products → confirm quantities → create purchase → increase stock → update payable.
- **Supplier payment** — view outstanding balance → record payment → reduce payable.
- **Inventory review** — view current stock → filter low/out-of-stock/expiring/expired → review stock history → take action.
- **Replenishment** — identify low-stock products → generate suggestions → employee reviews and converts to a purchase.
- **Customer return** — find original sale → validate returned quantity → create return → apply inventory and financial effects → record refund.
- **Café order** — cashier creates order → barista board shows it → NEW → PREPARING → READY → COMPLETED.
- **Online order** — browse → cart → checkout → address → payment → order → delivery statuses.

---

## Technology Stack

The approved technology stack is defined in `AGENTS.md`:

- **Framework:** Next.js (App Router)
- **Language:** TypeScript (strict)
- **UI:** React, Tailwind CSS, shadcn/ui
- **Database:** MongoDB with Mongoose ODM
- **Forms:** React Hook Form + Zod validation
- **Client state:** Zustand (client/transient state only)
- **Tables:** TanStack Table
- **Charts:** Recharts
- **Dates:** date-fns
- **Notifications:** sonner
- **Architecture:** Server Components by default; Client Components only where interactivity is required; Server Actions for mutations.

---

## Architecture Overview

The recommended architecture follows a clear layered separation (per `AGENTS.md` and `docs/architecture.md`):

```
UI (Server/Client Components)
→ Server Action / Route Handler
→ Service (domain/application logic)
→ Repository / Data Access
→ Mongoose Model
```

Key architectural principles:

- **Arabic-first, RTL-first** from the beginning.
- **Server authority** — the server is the source of truth for totals, balances, stock, payment validity, and permissions. Client calculations are for UX only.
- **Historical integrity** — completed financial transactions are never silently overwritten; corrections use returns, refunds, reversals, and adjustments.
- **Transaction-driven inventory** — stock changes are represented through auditable stock movements, not isolated editable numbers.
- **Ledger-derived balances** — customer and supplier balances are derived from recorded transactions, never trusted from client input or blindly cached.
- **Server authorization** — UI visibility is never the security boundary; permissions are enforced server-side at every boundary.

The full analysis, including every architectural decision with rationale and trade-offs, is in [docs/architecture.md](docs/architecture.md).

---

## UI/UX Direction

The user-facing experience is designed for employees with limited computer experience and for online customers browsing on mobile.

- **Arabic-first** — Arabic is the default language; layouts are **RTL** from the beginning.
- **Professional Modern Standard Arabic** — no slang or dialect in the product UI.
- **Clarity over decoration** — simple, fast, clear, trustworthy interfaces with strong visual hierarchy.
- **Accessibility** — targets WCAG AA quality, with keyboard navigation, visible focus, accessible labels, and non-color status communication.
- **`ui-ux-pro-max`** — the installed design skill is used for design-system, typography, color, accessibility, and screen reviews.
- **No generic AI-generated UI** — the design deliberately avoids excessive gradients, glassmorphism, decorative blobs, oversized rounded cards, and unnecessary animation.

---

## Printing

Thermal receipt printing is a first-class feature.

- Support for **58mm** and **80mm** thermal printers.
- Receipts support **Arabic RTL**.
- Print layouts are optimized for narrow paper.
- Printable documents are rendered from persisted transaction data (never from uncommitted cart state) through a server-derived `ReceiptViewModel`.
- Printable types: **sales receipts**, **café order receipts** (order items + sugar/note + linked invoice), and **customer payment receipts**.
- Receipts print on a dedicated authenticated, non-indexable route with auto-print and manual print fallback; previews are shown in the app before printing.
- Reprints reuse the stored invoice/order number and never create a new transaction.
- Printing is permission-controlled server-side (`receipts.print` + the relevant read permission); the store identity on receipts is configurable at runtime.
- The strategy is phased: HTML/CSS browser printing first, with native ESC/POS printing as a later enhancement. Physical validation against real thermal printers is still outstanding.

---

## Online Store

The online store **shares the same product/catalog domain** as internal operations. Product data is not duplicated.

- Online products reference the same core product domain as internal sales.
- Online visibility is a product setting; availability respects internal inventory rules.
- Online orders follow an explicit order lifecycle and are stored in the same business platform used by employees.
- The public store is mobile-first, while internal POS screens are desktop/tablet-first.

---

## Documentation

The project is documented across the `docs/` folder:

| Document | Purpose |
|----------|---------|
| [docs/product-overview.md](docs/product-overview.md) | Product vision, users, and modules. |
| [docs/requirements.md](docs/requirements.md) | Functional requirements (REQ-*). |
| [docs/business-rules.md](docs/business-rules.md) | Business rules (BR-*) that must remain consistent. |
| [docs/workflows.md](docs/workflows.md) | Business workflows. |
| [docs/domain-model.md](docs/domain-model.md) | Conceptual domain model. |
| [docs/ui-ux-guidelines.md](docs/ui-ux-guidelines.md) | Arabic-first RTL UI/UX guidelines. |
| [docs/architecture.md](docs/architecture.md) | Architecture analysis and decisions. |
| [AGENTS.md](AGENTS.md) | Engineering conventions and project rules. |

---

## Development Status

Phases 0–9 are implemented and the test suite passes (226 tests across 23 files). Phase 8 (Thermal Printing, browser-based) and Phase 9 (Online Store & Delivery) are complete. The Phase 10/11 financial-integrity & production-hardening audits are complete. Native ESC/POS printing and physical thermal-printer validation are deferred (see [Printing](#printing)).

| Phase | Status |
|-------|--------|
| **0 — Foundation** | ✅ Complete |
| **1 — Identity & RBAC** | ✅ Complete |
| **2 — Catalog & Inventory Core** | ✅ Complete |
| **3 — Suppliers & Purchasing** | ✅ Complete |
| **4 — POS, Payments & Cashier Shifts** | ✅ Complete |
| **5 — Customer Credit & Receivables** | ✅ Complete |
| **6 — Expenses & Accounting** | ✅ Complete |
| **Dashboard Overview** | ✅ Complete |
| **7 — Café / KDS** | ✅ Complete |
| **7.1 — Café Payment Integration & Per-Cup Sugar** | ✅ Complete |
| **8 — Printing (browser)** | ✅ Complete |
| **9 — Online Store & Delivery** | ✅ Complete |
| **10 — Reports & Audit** | ✅ Complete |
| **11 — Production Hardening** | ✅ Complete |

### Phase 2 — Catalog & Inventory Core (Implemented)

- **Catalog:** Product, Category, and Brand CRUD with deactivation (not deletion). Sparse-unique barcode/SKU, configurable pricing, minimum stock, expiry tracking, online visibility.
- **Inventory:** Transaction-driven — every change writes an append-only `StockMovement` plus an atomic, versioned `InventoryState` update (optimistic concurrency) inside a MongoDB transaction. Adjustments, counts, damage, expiry disposal, low/out/replenishment, expiry monitoring, movement history.
- **Validation:** Shared Zod schemas re-validated server-side. **Authorization:** enforced at the service boundary.

### Phase 3 — Suppliers & Purchasing (Implemented)

Supplier accounts, purchases and receiving (stock in), supplier ledger + outstanding payable (ledger-derived), supplier payments (cash or credit), supplier returns.

### Phase 4 — POS, Payments & Cashier Shifts (Implemented)

Full cashier POS: product search/scan, cart and quantities, mixed payments across methods (cash, cards, InstaPay, Vodafone Cash), cash tendered + change, thermal receipt, sequential invoices. Cashier shifts: open with opening cash, expected-cash reconciliation, CASH_IN/CASH_OUT/EXPENSE/ADJUSTMENT movements, close variance. A POS completeness audit confirmed the end-to-end flow (login → open shift → sell → pay → receipt → new sale). **Barcode scanning** supports both USB/keyboard scanners and a real device-camera scanner (`@zxing/browser`) — both funnel through one common handler into the same cart; scans decode locally in the browser and are never uploaded or stored.

### Phase 5 — Customer Credit & Receivables (Implemented)

Customer management, credit sales, customer ledger (source of truth for balances), customer payments, credit limits enforced server-side.

### Phase 6 — Expenses & Accounting (Implemented)

Configurable expense categories and an expenses log (`EXP-YYYYMMDD-NNNN`, idempotency-protected). A cash expense linked to an OPEN shift records an `EXPENSE` cash movement so shift reconciliation accounts for it. An accounting overview aggregates the real persisted transactions (no second ledger): sales total/collected/count + payment-method breakdown, purchases, expenses, gross & net profit (preliminary), current receivables/payables, and physical cash flow (cash strictly separated from card/wallet/Instapay). Access gated by `expenses.*` / `accounting.read` permissions.

### Phase 7 — Café / KDS (Implemented)

Cashier café-order creation and a barista **Kitchen Display System** (`/kds`) with a three-column board (جديد / قيد التحضير / جاهز), large touch actions, and a live 1-second age timer. The server is authoritative: a server-enforced state machine (`NEW → PREPARING → READY → COMPLETED`, plus permission-checked `CANCELLED`) with optimistic concurrency, and realtime delivery through a transactional outbox + SSE that resumes by monotonic sequence and dedupes by `eventId`, reconciling full server state on reconnect. Café permissions are role-gated (`cafe.orders.*` / `cafe.kds.view`).

### Phase 7.1 — Café Payment Integration & Per-Cup Sugar (Implemented)

Creating a café order now posts the **financial Sale** in the same MongoDB transaction as the order: payments (full payment; mixed methods supported, cash tendered + change), sellable-stock deduction, customer snapshot, and the cashier-shift effect all commit atomically — no second ledger, and `CafeOrder.totalAmount` can never diverge from `Sale.total`. The order stores a stable `saleId` link + the invoice number (`INV-…`). **Per-cup sugar** is a first-class structured option (سادة / ريحة / مزبوط / مانو / زيادة / فوق الزيادة / كراميل): different-sugar cups are always separate order lines (never merged) and products must advertise `supportsSugarOptions` to accept a sugar choice. Cancellation remains operational — the linked Sale is never mutated.

### Phase 8 — Printing (Implemented)

Receipts are a first-class, print-optimized feature (see [Printing](#printing)):

- **Browser HTML/CSS printing** for **58mm** and **80mm** thermal paper, with
  dedicated `@media print` styles, `@page` sizing, and dark-on-light ink styling
  so receipts read well on thermal paper.
- **Arabic RTL** receipts with correct right-aligned layout, the store identity
  from a runtime configurable source, and responsive wrapping (products/notes now
  wrap and `overflow-wrap` instead of overflowing narrow paper).
- Printable documents — **sales receipts**, **café order receipts** (items +
  sugar/note + linked invoice), and **customer payment receipts** — are rendered
  from **persisted transaction data** via a server-derived `ReceiptViewModel`
  (never from uncommitted cart state).
- Printing happens on a **dedicated authenticated, non-indexable route**
  (`/print/sale|cafe|payment/[id]`) with auto-print on load and a manual print
  fallback; in-app previews render the same document.
- **Reprints reuse the stored invoice/order number and never create a new
  transaction.**
- **Server-side permission control** (`receipts.print` + the relevant read
  permission) guards every print action.
- The strategy is phased: HTML/CSS browser printing is complete; **native ESC/POS
  printing** and **physical validation against real thermal printers** remain
  outstanding (deferred milestone).

### Phase 9 — Online Store & Delivery (Implemented)

A public, Arabic-first (RTL) online storefront at `/store` sharing the same product/catalog domain. Guest cart (Zustand + localStorage) and one-page checkout with **Cash on Delivery** (COD only in this phase). Orders follow an explicit server-validated state machine (`PENDING → CONFIRMED → PREPARING → READY_FOR_DELIVERY → OUT_FOR_DELIVERY → DELIVERED`, any active → `CANCELLED`) with optimistic concurrency and an immutable `statusHistory`. **Inventory is reserved at checkout and committed at delivery** via a new `InventoryReservation` ledger (no overselling; cancelled orders release stock). A dedicated **DELIVERY** role drives the delivery board (`/delivery`): dispatch, and **COD collection posts the financial Sale into the collector's open cashier shift** (repurposing `createSaleWithSession`) so the collected cash enters shift accounting — the order stays unpaid until that real Sale exists. Admin order management at `/online-orders`, guest order tracking via a server-generated token (no IDOR), SEO (robots/sitemap, indexable store vs noindex dashboard), and a rate limiter on checkout. See [docs/online-store.md](docs/online-store.md).

The phased development roadmap is defined in [docs/architecture.md](docs/architecture.md#development-roadmap).

---

## Getting Started (Developer)

The project uses [Next.js](https://nextjs.org) with the App Router.

```bash
# Install dependencies (first time)
npm install

# Seed permissions, roles, and the development Owner
# (idempotent — safe to re-run; also self-heals a corrupted Owner password)
# Re-running adds any newly-introduced phase permissions to already-seeded
# roles (additive merge) without removing manual role edits.
npm run seed

# Seed the online store catalogue (1065 realistic supermarket/café products,
# 959 visible online, with initial stock via PURCHASE movements).
# Idempotent — safe to re-run; new products are added without overwriting
# existing ones. Includes: Egyptian brands, expiry tracking, Arabic names,
# deterministic EAN-13 barcodes, and repeatable inventory profiles.
npm run seed:store

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Default development login

The first run of `npm run seed` bootstraps a development Owner from the
environment (see `.env.example` / `.env.local`):

- Username: `SEED_OWNER_USERNAME` (default `admin`)
- Password: `SEED_OWNER_PASSWORD` (set this locally; never commit a real password)

The Owner is only created/repaired when `SEED_OWNER_PASSWORD` is set, and it is
skipped entirely in production. Re-running `npm run seed` verifies the existing
Owner's password hash and re-hashes it if the stored value cannot be verified,
so a corrupted/plaintext hash is repaired automatically.

> The application is Arabic-first and RTL. Phases 0–7 are implemented; the foundation, identity/RBAC, catalog/inventory, suppliers/purchasing, POS & shifts, customer credit, expenses & accounting, and café orders / barista KDS features are functional.

### Phase 9.1 — Store catalogue seed (Implemented)

`npm run seed:store` seeds a realistic Egyptian supermarket & café catalogue
(1065 products, 959 visible online) so the public store instantly has
content. It is **idempotent and non-destructive**: products are matched by
their deterministic EAN-13 barcode, so re-runs only add what's missing and
never overwrite existing products, stock, or prices. Initial stock is recorded
through the same invariants the inventory service enforces for a real purchase
receipt — `InventoryState.onHand` set to the received quantity, an append-only
`PURCHASE` `StockMovement`, and future-dated `ProductBatch` rows for
expiry-tracked items — so product stock equals `InventoryState.onHand` and the
ledger stays auditable. Bulk writes keep a 1000+ product catalogue fast and
reliable even on standalone local MongoDB. See [docs/online-store.md](docs/online-store.md#store-catalogue-seed).
