# Nexa Retail

نكسا ريتيل — منصة إدارة التجزئة والكافيه

Nexa Retail is a **full-stack Retail & Café Management Platform** designed for supermarkets and cafés. It helps employees manage day-to-day operations without requiring advanced computer skills.

The platform is **Arabic-first**: the default locale is `ar-EG` and the default text direction is **RTL**. All user-facing interfaces are designed for Arabic from the beginning, not translated afterward.

> **Status: Phase 2 Complete**
> Phases 0, 1, and 2 are implemented. See [Development Status](#development-status).

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
2. **POS** — retail checkout and payments.
3. **Cashier Shifts** — opening cash, transactions, closing reconciliation.
4. **Inventory** — products, stock, stock movements, expiry, adjustments.
5. **Suppliers** — supplier accounts, purchases, payments, balances.
6. **Customers** — customer profiles, credit sales, payments, balances.
7. **Accounting** — expenses, receivables, payables, reports.
8. **Café** — orders and the barista workflow.
9. **Printing** — receipts and printable business documents.
10. **Online Store** — public catalog, cart, checkout, orders.
11. **Delivery** — delivery status and order fulfillment.
12. **Reports** — daily, weekly, monthly, yearly, product, cashier, supplier, customer, and payment reports.

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
- Printable documents are rendered from persisted transaction data (never from uncommitted cart state).
- The strategy is phased: HTML/CSS browser printing first, with native ESC/POS printing as a later enhancement.

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

Phases 0, 1, and 2 are implemented and the test suite passes (7 files, 53 tests).

| Phase | Status |
|-------|--------|
| **0 — Foundation** | ✅ Complete |
| **1 — Identity & RBAC** | ✅ Complete |
| **2 — Catalog & Inventory Core** | ✅ Complete |
| **3 — Suppliers & Purchasing** | Planned |
| **4 — POS, Payments & Cashier Shifts** | Planned |
| **5 — Customer Credit & Receivables** | Planned |
| **6 — Expenses & Accounting** | Planned |
| **7 — Café / KDS** | Planned |
| **8 — Printing** | Planned |
| **9 — Online Store & Delivery** | Planned |
| **10 — Reports & Audit** | Planned |
| **11 — Production Hardening** | Planned |

### Phase 2 — Catalog & Inventory Core (Implemented)

Phase 2 delivers the product catalog and transaction-driven inventory engine:

- **Catalog:** Product, Category, and Brand CRUD with deactivation (not deletion) to preserve historical references. Products have sparse-unique barcode/SKU, required category, optional brand, configurable pricing, minimum stock threshold, expiry tracking flag, and online visibility flag.
- **Inventory strategy:** Transaction-driven — stock is never an isolated editable number. Every change creates an append-only `StockMovement` record plus an atomic, versioned `InventoryState` update with optimistic concurrency (`version` field). Multi-document changes run in a MongoDB transaction.
- **Sellable stock:** Non-expiry products → `InventoryState.onHand`. Expiry-tracked products → sum of non-expired `ProductBatch` quantities.
- **Inventory operations:** Manual adjustment (signed delta), physical stock count (reconciliation), damage recording (`onHand` → `nonSellable`), expiry disposal (only expired batches), low-stock / out-of-stock / replenishment queries, expiry batch monitoring, paginated movement history, product batch listing.
- **Stock rules:** `EXPIRING_SOON_DAYS = 30`; low-stock = `sellable <= minimumStock`; out-of-stock = `sellable <= 0`; replenishment = `max(0, minimumStock - sellable)`.
- **Permissions:** Granular Phase 2 permissions (`products.*`, `categories.*`, `brands.*`, `inventory.*`) with role defaults: MANAGER and WAREHOUSE_EMPLOYEE have full access; ACCOUNTANT has read-only access; CASHIER and BARISTA have none. Authorization enforced server-side.
- **Validation:** Shared Zod schemas (`src/lib/validations/catalog.ts`, `src/lib/validations/inventory.ts`) with server-side re-validation.
- **UI:** Arabic-first RTL pages for products, categories, brands, inventory overview, movements, expiry, and replenishment under `src/app/(dashboard)/` with components in `src/components/catalog/` and `src/components/inventory/`.
- **Tests:** `catalog.test.ts` and `inventory.test.ts`; full suite (7 files, 53 tests) passes.

The phased development roadmap is defined in [docs/architecture.md](docs/architecture.md#development-roadmap).

---

## Getting Started (Developer)

The project uses [Next.js](https://nextjs.org) with the App Router.

```bash
# Install dependencies (first time)
npm install

# Seed permissions, roles, and the development Owner
# (idempotent — safe to re-run; also self-heals a corrupted Owner password)
npm run seed

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

> The application is Arabic-first and RTL. Phases 0–2 are implemented; the foundation, identity/RBAC, and catalog/inventory features are functional.
