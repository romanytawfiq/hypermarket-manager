# Nexa Retail — Architecture

This document records the **architecture analysis** for the Nexa Retail platform.

It is intended for:

- **Clients / stakeholders** — to understand how the system is designed and why.
- **Developers / future contributors** — to understand the boundaries, decisions, and trade-offs before building.

This is an **analysis document**, not an implementation guide. It does not contain database schemas, models, or application screens. Nothing described here is assumed to be implemented unless explicitly stated in [README.md](../README.md#development-status).

Every important decision is presented as:

- **Decision**
- **Reason**
- **Trade-offs**
- **Impact**

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Application Layers](#2-application-layers)
3. [Next.js Architecture](#3-nextjs-architecture)
4. [Server vs Client Components](#4-server-vs-client-components)
5. [Server Actions](#5-server-actions)
6. [Route Handlers](#6-route-handlers)
7. [Service Layer](#7-service-layer)
8. [Data Access Layer](#8-data-access-layer)
9. [MongoDB Strategy](#9-mongodb-strategy)
10. [Mongoose Strategy](#10-mongoose-strategy)
11. [Authentication](#11-authentication)
12. [Authorization / RBAC](#12-authorization--rbac)
13. [Validation](#13-validation)
14. [State Management](#14-state-management)
15. [Realtime Architecture](#15-realtime-architecture)
16. [Thermal Printing Architecture](#16-thermal-printing-architecture)
17. [Online Store Architecture](#17-online-store-architecture)
18. [Delivery Architecture](#18-delivery-architecture)
19. [Reporting Architecture](#19-reporting-architecture)
20. [Security Architecture](#20-security-architecture)
21. [Testing Architecture](#21-testing-architecture)
22. [Performance Considerations](#22-performance-considerations)
23. [Architectural Trade-offs](#23-architectural-trade-offs)
24. [Known Risks](#24-known-risks)
25. [Open Decisions](#25-open-decisions)
26. [Development Roadmap](#26-development-roadmap)

---

## 1. Architecture Overview

Nexa Retail is a production-oriented, full-stack Retail & Café Management Platform. It is **Arabic-first** (locale `ar-EG`, direction RTL).

The architecture follows a clean, layered separation mandated by `AGENTS.md`:

```
UI (Server / Client Components)
→ Server Action / Route Handler
→ Service (domain / application logic)
→ Repository / Data Access
→ Mongoose Model
```

The core principles that shape the entire architecture:

- **Server authority** — the server is the single source of truth for totals, balances, stock, payment validity, and permissions. Client-side calculations are for UX only.
- **Historical integrity** — completed financial transactions are never silently overwritten; corrections use explicit mechanisms (returns, refunds, reversals, adjustments).
- **Transaction-driven inventory** — stock changes are represented through auditable stock movements, not isolated editable numbers.
- **Ledger-derived balances** — customer and supplier balances are derived from recorded transactions rather than trusted from the client or blindly cached.
- **Server authorization** — UI visibility is never the security boundary; permissions are enforced server-side at every boundary.

---

## 2. Application Layers

### Decision
Separate responsibilities into distinct layers: **UI**, **application logic** (Server Actions / Route Handlers), **domain/business logic** (services), **data access** (repositories/data access modules), and **database models** (Mongoose).

### Reason
`AGENTS.md` mandates clear separation so business rules live in a service/domain layer rather than inside React components or route handlers. This makes the financial and inventory invariants enforceable in one place and testable.

### Trade-offs
- Slightly more indirection between the UI and the database.
- Requires discipline to avoid "fat" components and "fat" handlers.

### Impact
Services become the natural home for business rules, making them the primary target for automated tests. Components stay focused on rendering and interaction.

---

## 3. Next.js Architecture

### Decision
Use the **Next.js App Router** with a feature-module organization under `src/`.

Proposed layout:

```
src/
├── app/                 # App Router (routes, layouts, pages)
│   ├── (auth)/          # login
│   ├── (dashboard)/     # authenticated, role-gated layout
│   └── api/             # Route Handlers (online store, webhooks, printing)
├── components/          # shared + ui (shadcn)
├── features/            # feature modules (sales, inventory, cafe, ...)
├── lib/                 # db, env, auth, i18n, utils
├── models/              # Mongoose models
├── services/            # cross-cutting domain services
└── middleware.ts        # auth gate
```

### Reason
Feature-module organization matches the "small vertical slice" development discipline and keeps each business domain (Sales, Inventory, Café, Suppliers, Customers) self-contained. The App Router is the recommended approach for Next.js 16.

### Trade-offs
- Co-locating schemas, services, actions, and components per feature risks duplication if not disciplined.
- Mitigated by a small `lib/` and cross-cutting `services/` for shared invariants (financial engine, inventory engine, auth, audit).

### Impact
Each feature can be implemented and reviewed independently, matching the phased roadmap.

---

## 4. Server vs Client Components

### Decision
Use **Server Components by default**; use **Client Components only** for genuine interactivity, kept as leaf nodes.

### Reason
Server Components reduce the client-side JavaScript bundle and align with the data-fetching model. Only POS, payment, and café interactions genuinely require client interactivity.

### Trade-offs
- Requires discipline about where `'use client'` appears.
- POS re-render performance requires careful component splitting.

### Impact
Lower client JS, faster initial loads, and a cleaner data-fetching story. Interactive screens (POS, cafeteria board) are intentionally client-scoped.

---

## 5. Server Actions

### Decision
Use **Server Actions** for internal staff mutations.

### Reason
Internal employees are authenticated; Server Actions provide natural action-level authorization and validation with progressive enhancement, and match the mutation model for admin use.

### Trade-offs
- Distinct caching/revalidation model that must be understood.
- Public or unauthenticated flows are better served by Route Handlers.

### Impact
One consistent mutation path for staff operations, with authorization enforced at the action boundary.

---

## 6. Route Handlers

### Decision
Use **Route Handlers** for public / integration HTTP endpoints.

### Reason
The online store (public, unauthenticated, rate-limited) and webhooks need explicit HTTP endpoints. Route Handlers give an explicit security boundary separate from staff Server Actions.

### Trade-offs
- More boilerplate than Server Actions.
- Public surface requires rate limiting and validation.

### Impact
A clearly separated public API boundary for the online store and integrations.

---

## 7. Service Layer

### Decision
Place domain and application logic in **reusable services**; avoid putting complex business logic directly in components or route handlers.

### Reason
Financial and inventory invariants must be enforced once, server-side. Centralizing them in services keeps them testable and prevents inconsistent enforcement across different mutation paths.

### Trade-offs
- Introduces an extra layer of indirection.

### Impact
Business rules become unit-testable and a single source of truth for invariants.

---

## 8. Data Access Layer

### Decision
Use a **repository / data-access layer** between services and Mongoose models.

### Reason
Keeps queries and persistence details out of services, mirrors the mandated layering, and eases testing.

### Trade-offs
- Extra layer; risk of over-engineering if queries are trivial.

### Impact
Persistence is isolated, and services work against focused data-access interfaces.

---

## 9. MongoDB Strategy

### Decision
Use a **hybrid embed-or-reference** approach chosen per aggregate and query pattern.

- **Embed** when always read together, bounded in size, and not independently queried: sale items, purchase items, payments, order items, cash movements, status-transition history.
- **Reference** (with an index) when independently queried, large, or shared: product, customer, supplier, user, category.
- **Snapshot** historical facts into the owning document (e.g., sale items retain product name, unit price, and cost at sale time) so later price changes cannot corrupt history.

### Reason
The MongoDB persistence design must follow access patterns, consistency requirements, transaction boundaries, document size, reporting needs, historical integrity, and query patterns (per `docs/domain-model.md`).

### Transaction records
Use **append-only ledger / account-transaction collections** for customer and supplier financial activity. Each entry records source type, amount, sign, reference, and timestamps. **Balances are the sum of ledger entries**, which preserves historical integrity and prevents silent overwrites. A cached current balance may be kept only as an optimization, with the ledger as the source of truth.

### Inventory
Keep an **append-only StockMovement** history plus a denormalized **InventoryState** (on-hand, nonSellable, version) for fast reads. Both are updated in the same MongoDB transaction. `InventoryState.version` provides optimistic concurrency: every mutation uses `findOneAndUpdate({ product, version }, { $inc, version+1 })` to prevent silent overwrites from concurrent writers.

### Product batches / expiry
Products flagged for expiry tracking carry **batches/lots** with quantity, production/expiry dates, and purchase reference. Expired batches are excluded from sellable inventory; FEFO selection is a query over non-expired batches ordered by expiry.

### Aggregates / atomicity
- Single aggregate roots: **Sale** (items + payments + shift + customer), **Purchase** (items + accepting + payments), **CashierShift** (sales + cash movements + closing reconciliation), **CafeOrder** (items + transition history).
- Multi-document consistency (create sale + update inventory + append ledger + write audit) requires **MongoDB transactions (replica set)**. Single-node deployments cannot perform multi-document ACID transactions — this is a deployment constraint to surface.

### Concurrency
Use `findOneAndUpdate` with state filters (optimistic concurrency) for stock decrements and balance updates, then verify `matchedCount`. Use client-supplied **idempotency keys** with unique indexes to prevent duplicate operations on retry.

### Indexes
Add indexes intentionally for: barcode and SKU (unique), invoice/order numbers (unique), dates used frequently in reports, and reference identifiers used in filtering. Use compound indexes matching report hot-paths.

---

## 10. Mongoose Strategy

### Decision
Use **Mongoose** as the ODM with typed schemas and a single database-connection module.

### Reason
Mongoose is mandated by `AGENTS.md`. It supports embedded documents, transactions (with replica set), and rich indexing.

### Trade-offs
- Mongoose's default typing is loose; requires strict discipline with TypeScript generics and explicit DTO interfaces at service/data boundaries.
- Avoids introducing a non-mandated abstraction.

### Impact
Stable persistence that honors aggregate boundaries and transaction requirements.

---

## 11. Authentication

### Decision
Use **session-based authentication** with signed/encrypted HTTP-only, Secure, SameSite cookies and a server-side session store for revocability. Store passwords using a strong hashing algorithm (e.g., argon2id / bcrypt) with per-user salts.

### Reason
Session-based auth is appropriate for a same-origin internal application, supports revocation, and keeps credentials server-side. Strong hashing prevents plaintext credential storage.

### Trade-offs
- Self-hosted sessions require a store and careful cookie configuration.
- A lightweight, replaceable session primitive is preferred over a heavyweight full-auth framework unless one solves a concrete need.

### Impact
Provides the authentication foundation on which RBAC and route protection are built.

---

## 12. Authorization / RBAC

### Decision
Use **role-based access control (RBAC)** with granular **permissions**, enforced server-side at every boundary.

- **Roles:** Owner, Manager, Cashier, Accountant, Warehouse Employee, Barista (future: Delivery Employee, Customer, Branch Manager).
- **Permissions:** capabilities such as `sales.create`, `sales.cancel`, `inventory.adjust`, `purchases.create`, `suppliers.pay`, `customers.credit`, `reports.view`.
- **Prefer permission-based checks** (not role-name checks) so future roles can compose cleanly.

Authorization is enforced at three layers:

1. **Route / segment guarding** (layout + middleware) — for navigation visibility only, never the security boundary.
2. **Server Action / Route Handler authorization** — the real gate.
3. **Service-layer authorization** — for cross-cutting sensitive operations (shift close approval, credit approval, refunds) so rules cannot be bypassed through another mutation path.

### Reason
UI visibility must never grant permission (`BR-052`). Permissions must be enforced by the server regardless of what the UI shows.

### Trade-offs
- More surface area to test (each boundary must enforce permissions).
- Granular permissions add configuration overhead.

### Impact
Sensitive operations are protected server-side, and the permission model is auditable.

---

## 13. Validation

### Decision
Use **Zod schemas** shared between client and server, with **server-side re-validation of everything**.

### Reason
Never trust client-provided prices, stock quantities, user roles, permissions, totals, payment amounts, or balances. Validation rules must also run server-side (`AGENTS.md`).

### Trade-offs
- Duplication of validation work between client and server is mitigated by sharing schema definitions.

### Impact
Client mistakes are caught early in the UI; server authority guarantees correctness regardless of client behavior.

---

## 14. State Management

### Decision
Use **Zustand** for client UI / transient state only. Keep server state on the server.

| Kind | Strategy |
|------|----------|
| Server state (products, sales, reports, balances) | Server Components + Server Actions; refetch / revalidate. |
| Temporary POS state (active cart, line items) | Zustand (transient, client-local). |
| Payment-selection state | Zustand or local component state. |
| Form state | React Hook Form. |
| Shared context state (current user, active branch, active shift) | A thin Zustand store hydrated from the server on bootstrap. |
| Server state needing client reactivity (café board) | Minimal; mirror server state keyed by id and reconciled on reconnect. |

### Reason
`AGENTS.md` forbids dumping server data into Zustand. Server state should remain on the server whenever possible.

### Trade-offs
- RSC revalidation for rapid POS changes is slightly heavier than optimistic client state; mitigated by optimistic UI with server confirmation.

### Impact
A clean separation between server-owned data and client-owned transient UI state.

---

## 15. Realtime Architecture

### Decision
Use an **event-driven approach with the server as the authoritative state** and a light client subscription (e.g., SSE or WebSocket), backed by a transactional outbox for reliability.

- The café order lifecycle is a state machine: `NEW → PREPARING → READY → COMPLETED`, plus `CANCELLED` through an allowed, permission-checked transition.
- Transitions are validated server-side; a transition history is embedded in the order document for auditability and idempotency.
- Events carry an idempotent id / version. The server rejects duplicate, out-of-order, or invalid transitions by comparing current and expected state.
- On reconnect, the client fetches full server state and reconciles its local board.

### Reason
Satisfies the requirement that new orders appear with minimal delay, that status changes propagate in near real time, that temporary disconnects do not corrupt order state, and that duplicate events do not create duplicate operations.

### Trade-offs
- An in-app outbox + SSE/WebSocket is simpler and more robust than a full message broker for a single-store café.
- A broker (e.g., Redis pub/sub, Pusher, Socket.io) is revisited only if multi-branch KDS distribution is required.

### Impact
Provides near-real-time barista UX with robust reconnect and deduplication behavior. **Implemented in Phase 7** (see the "Café / KDS (finalized)" roadmap section): transactional outbox + SSE resume by monotonic sequence, dedupe by `eventId`, full-state reconcile on reconnect.

---

## 16. Thermal Printing Architecture

### Decision
Use a **phased strategy**: HTML/CSS browser printing first, native **ESC/POS** printing as a later enhancement.

**Phase 1 — Browser print:**
- A receipt preview/print view renders the **stored transaction** (never uncommitted cart state).
- Fixed-width, RTL layouts for 58mm (~384px) and 80mm (~576px) thermal paper, with dedicated `@media print` styles.
- Arabic RTL receipts use logical CSS, `dir="rtl"`, and a print-safe Arabic font with a system fallback.

**Phase 2 — ESC/POS (later):**
- A server-side renderer outputs raw ESC/POS bytes for native thermal printing.
- Receipt content is modeled once (width-aware) so HTML and ESC/POS derive from the same data.

### Reason
Browser printing is fast to deliver and sufficient for many deployments; ESC/POS adds hardware-native printing later. Printability and Arabic rendering on cheap thermal printers are hardware constraints that must be validated on real devices.

### Trade-offs
- Browser printing depends on the local browser; ESC/POS gives better native quality but more implementation effort.

### Impact
Produces a reliable printing path that respects stored financial data and Arabic RTL.

---

## 17. Online Store Architecture

### Decision
The online store **shares the same product/catalog domain** as internal operations — it does not duplicate product data.

- Online products reference the same core product domain.
- Online visibility is a flag plus optional online-only fields (images, description, online price).
- Availability derives from the same internal inventory state and respects inventory rules.

### Reason
Avoids dual-maintenance drift, stock conflicts, and inconsistent pricing (`BR-046`, `BR-047`).

### Trade-offs
- Public reads touch shared collections, so read-optimized projections and caching are needed to isolate public traffic from internal writes.

### Flow
Browse → search → view → cart → checkout → address → delivery → payment → order → delivery statuses. The online order lifecycle is explicit and auditable.

### Stock interaction
A stock **reservation** mechanism is recommended so two customers cannot claim the same last unit; reservations are released on cancellation or failure.

### Impact
A single source of truth for products while isolating public catalog loads.

---

## 18. Delivery Architecture

### Decision
Model delivery as an explicit lifecycle with auditable status transitions:

```
PENDING → CONFIRMED → PREPARING → READY_FOR_DELIVERY → OUT_FOR_DELIVERY → DELIVERED
```

Cancellation is explicitly recorded.

### Reason
An online order is not automatically considered delivered after creation; it must progress through explicit states (`BR-048`, `BR-049`).

### Trade-offs
- Requires a defined delivery employee role and status update authorization.

### Impact
Clear, auditable fulfillment for online orders.

---

## 19. Reporting Architecture

### Decision
Aggregate from **persisted business transactions** at query time, using the MongoDB **Aggregation Pipeline**. Optionally use pre-aggregated summary collections only where hot-path performance demands it, keeping raw transactions as the source of truth (`BR-050`).

### Reason
Reports must be generated from actual business transactions, not manually typed summary totals.

### Trade-offs
- Live aggregation is always accurate but potentially slower for year-level ranges; mitigated by date-indexed queries and optional rebuildable summary collections.
- Profit is reported only when reliable cost data exists (`BR-051`).

### Impact
Accurate, transaction-derived reports for daily/weekly/monthly/yearly sales, products, categories, payment methods, cashiers, suppliers, customers, expenses, inventory, expiry, and profit.

---

## 20. Security Architecture

Security requirements include:

- **Authentication:** strong password hashing, HTTP-only Secure SameSite cookies, revocable sessions, login rate-limiting / lockout.
- **Authorization:** permission-based, enforced at every server boundary.
- **Input validation:** Zod shared client/server, with server-side re-validation of all sensitive values.
- **Financial & stock mutations:** server-computed inside transactions with idempotency keys and optimistic concurrency.
- **Rate limiting:** on public online-store APIs, login, and account/payment endpoints.
- **Audit logs:** append-only for sensitive operations.
- **Public API surface:** restricted shape, sanitized, never exposing internal identifiers that leak data; availability and price enforced server-side.
- **Webhooks / payments:** verify signatures and idempotency keys; treat notifications as untrusted input.
- **Sensitive data:** never log passwords or tokens; safe user-facing errors with full technical context logged server-side.

### Reason
Financial and inventory data must never be trusted from the client. Server authority and server-side validation are non-negotiable.

### Impact
A hardened server-side application with a clearly bounded public surface.

---

## 21. Testing Architecture

### Decision
Prioritize **business-critical correctness** over snapshot-heavy UI tests, using:

- **Unit tests** (e.g., Vitest) for domain/business rules, financial invariants, inventory calculations, permission checks, and order state machines.
- **Service tests** with an in-memory MongoDB for ledger/balance derivation, expected-cash computation, and inventory movement math.
- **Server Action / Route Handler tests** for authorization, validation, idempotency, transaction rollback, and error mapping.
- **End-to-end tests** (e.g., Playwright) for critical workflows: login → open shift → sale → mixed payment → receipt; close shift variance; supplier receive → payable → pay; café order lifecycle; online order → delivery.

### Reason
Financial and inventory invariants are the highest-risk logic and must be proven before each related phase ships.

### Impact
Confidence in the money-critical and stock-critical paths.

---

## 22. Performance Considerations

- **Database indexes** support common operational queries and report hot-paths (dates, payment methods, product identifiers).
- **Pagination / data-loading strategies** keep large lists responsive; reports avoid loading unnecessary historical data into the client.
- **Server-side filtering and paging** for large historical datasets.
- **Caching / projection** for the public online catalog to isolate public loads from internal writes.
- **Optional rebuildable summary collections** for year-level reporting rollups.

---

## 23. Architectural Trade-offs

- **Server authority vs. client responsiveness** — server-computed financials are correct but add a round trip; mitigated with optimistic UX for transient states.
- **Embed vs. reference** — embedding simplifies reads but limits independent queries; referencing enables querying but requires joins/aggregation. Chosen per aggregate.
- **Live aggregation vs. pre-aggregation** — accuracy vs. speed; the ledger stays authoritative and summaries are rebuildable.
- **In-app outbox + SSE vs. message broker** — simplicity/robustness vs. multi-branch scale; deferred until a concrete need.
- **Browser print vs. ESC/POS** — speed of delivery vs. native print quality; phased.
- **Feature-module organization** — cohesion vs. potential duplication across features; mitigated by shared services.

---

## 24. Known Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Inconsistent financial balances | High | Ledger-derived balances; MongoDB transactions; server-computed values; idempotency keys. |
| Inventory race conditions / oversell | High | Transactions + optimistic state filters (`InventoryState.version`); negative-stock guard. ✅ Phase 2 |
| Duplicate operations | High | Idempotency keys + unique indexes + state/version guards. |
| Poor RTL / Arabic UX | High | RTL-first from the start; logical CSS; MSA labels; `ui-ux-pro-max` review. ✅ Phase 2 (catalog & inventory UI) |
| Overly complex POS | Medium–High | Minimal-step discipline; obvious primary actions; usability review. |
| Weak permissions | High | Permission-based checks at every server boundary; test matrix. ✅ Phase 1 & 2 |
| Reporting performance | Medium | Date-indexed aggregation; server-side filtering/paging; rebuildable summaries. |
| Realtime reliability | Medium | Transactional outbox + authoritative server state + reconnect reconcile + idempotent transitions. |
| Printing limitations | Medium–High | Phased browser/ESC/POS; validate Arabic rendering on real printers. |
| Online/internal inventory conflicts | High | Shared source of truth; online availability + stock reservation. |
| Multi-branch retrofitting | Medium | Add branch scoping now; decide scope early. |
| Over-engineering | Medium | Scope discipline; defer heavy tools until a concrete need. |
| MongoDB single-node lack of transactions | Medium | Require replica set; define fail-safe finalize paths. |
| Deferred business decisions block schema | Medium | Confirm defaults early, before their dependent phases. |

---

## 25. Open Decisions

The following business decisions must be resolved before implementation of their dependent features. They are recorded here because they affect architecture and database design. They are **not** decided by this document; they are surfaced for the business to confirm.

| Decision | Recommended default | Architectural impact |
|----------|---------------------|----------------------|
| Negative stock | Disallow at sell time | Inventory validation, sale guard |
| Customer credit limit | None initially; configurable per customer | Customer model + sale validation |
| Credit approval | Cashier up to limit; Manager beyond | Authorization, service gate |
| Returns | Cashier normal; Manager for aged/unsupported | Permissions, return validation |
| Supplier returns | Supported | Inventory + payable logic |
| Discounts | Invoice-level first; item-level later | Pricing calculation, sale validation |
| VAT / tax | Not required initially; tax invoice later | Financial calculation, receipt/invoice model |
| Shift expense | Record as explicit cash movement (EXPENSE) | Shift cash reconciliation |
| Multiple open shifts | One shift per cashier / register | Shift constraints |
| Café ingredients | MVP: menu-only (no retail inventory link) | Inventory model, catalog |
| Online payment | COD first; gateway later | Order state, confirmation flow |
| Cash on delivery | Supported | Delivery + payment confirmation |
| Delivery fee | Fixed (flat rate) | Order pricing |
| Expired-product selling | Block selling expired; warn on expiring | Inventory + POS guard |
| Supplier credit limit | None initially | Supplier validation |
| Multi-branch | Single branch now; add branch field for future | Organization/branch architecture |
| Tax invoices | Not required initially; receipt only | Receipt/invoice model |
| Stock reservation (online) | Reserve on order creation; release on cancel/fail | Inventory state, online order flow |
| Guest checkout | Support guest cart (cookie) | Cart persistence, auth scope |
| Receipt content / format | Name, items, unit price, qty, totals, payment split, invoice no., date | Printing, invoice numbering |
| Invoice / order numbering | Atomic sequence per day/shop | Sequence/counter collection |
| Printer models | 58mm + 80mm; validate Arabic rendering | Printing strategy |
| Payment method set | Cash, Visa, Mastercard, InstaPay, Vodafone Cash, Other | Config, POS, reports |
| Shift approval on variance | Manager review above threshold | Shift close workflow |
| Delivery employee role | Introduce when delivery phase begins | RBAC roles |

---

## 26. Development Roadmap

The roadmap progresses from foundation to production, in dependency order. Each phase is a working vertical slice with validation.

| Phase | Goal | Depends on | Major areas |
|-------|------|-----------|-------------|
| **0 — Foundation** | Arabic-first base, tooling, design system | — | Tailwind + shadcn init; RTL root layout + Arabic font; design tokens; env/DB connection; test runner; i18n scaffolding. |
| **1 — Identity & RBAC** | Auth + roles + permissions | 0 | User/Role/Permission models; session auth; permission service; login; dashboard shell with role nav; audit foundation. |
| **2 — Catalog & Inventory Core** | Products + transaction-driven stock + expiry | 0, 1 | Product/Category/Brand; InventoryState + StockMovement + Batch; low/out/expiring logic; replenishment; movement UI. ✅ **Implemented** |
| **3 — Suppliers & Purchasing** | Receive stock, track payable | 0–2 | Supplier; Purchase/PurchaseItem; receiving; supplier ledger + payable; payments; supplier returns. |
| **4 — POS, Payments & Cashier Shifts** | The core money path | 0–3 | POS screen; mixed payments; credit sales; returns/refunds; shift open/close; cash movements; variance; basic receipt. |
| **5 — Customer Credit & Receivables** | Customer accounts, credit, collections | 0–4 | Customer; customer ledger; credit limits/approval; payment UI; balance reporting. |
| **6 — Expenses & Accounting** | Expenses and accounting overview | 0–5 | Expense model + categories; consolidated accounting screens. ✅ **Implemented** |
| **7 — Café / KDS** | Café orders + barista board | 0, 2 | CafeOrder state machine + history; cashier creation; barista board; SSE/outbox realtime; reconnect/reconcile. ✅ **Implemented** |
| **8 — Printing** | Production thermal receipts | 0–7 | 58/80mm layouts; receipt models; preview; later ESC/POS. |
| **9 — Online Store & Delivery** | Public store + fulfillment | 0–2, prior | Online catalog view; search; product pages; cart; checkout; online order lifecycle; reservation; delivery statuses; online payments / COD; tracking; cancellation/refund. |
| **10 — Reports & Audit** | Complete reporting + auditability | all business | Daily/weekly/monthly/yearly reports; product/category/payment/cashier/supplier/customer/expense/inventory/expiry/profit; audit UI; optional summary collections. |
| **11 — Production Hardening** | Operational confidence | all | Security headers/CSP; rate limiting; replica-set transactions in prod; backup/restore; index/perf tuning; observability; multi-branch readiness; accessibility/RTL audit. |

### POS Route & RBAC (finalized)

- **Route:** `/pos` — a real dynamic route inside the authenticated `(dashboard)` area (`src/app/(dashboard)/pos/page.tsx`). It renders the existing `PosScreen` and is guarded server-side.
- **Canonical permissions:** the route, the navigation item, and the cashier workflow all key off the existing `sales.create` permission (sales domain). POS operations reuse `shifts.open`, `customers.credit`, and `receipts.print`. No second `pos.*` permission naming was introduced.
- **Navigation:** `getNavItems` (`src/lib/navigation.ts`) exposes `نقطة البيع` → `/pos`, filtered by `sales.create` — visibility is only a UX concern; enforcement is server-side.
- **Enforcement:** the page redirects when the actor lacks `sales.create` (`redirect("/")`); anonymous requests are bounced to `/login` by the `(dashboard)` layout. Actions/services enforce at the boundary via `requirePermission`.
- **Reseed procedure:** seeding is additive/idempotent — run `npm run seed` (or the deployed seed) again after upgrading to add new phase permissions to already-seeded roles; it never removes admin-granted permissions or re-imposes deliberately removed defaults.

### POS Barcode Scanning (finalized)

- **Goal:** add a real camera barcode scanner to the existing POS without rebuilding it. It complements the existing USB/keyboard scanner path.
- **Library:** `@zxing/browser` + `@zxing/library` (`BrowserMultiFormatOneDReader`). No scanner library existed before; zxing decodes locally in the browser, so camera frames are never uploaded or stored. `BarcodeDetector` is not relied on exclusively (browser support gaps); zxing is used directly.
- **1D-focused decoder:** the reader is `BrowserMultiFormatOneDReader` (the 1D-only wrapper from `@zxing/browser`), not the generic `BrowserMultiFormatReader`. It routes every frame through `MultiFormatOneDReader`/`OneDReader`, so it only attempts 1D formats and avoids the QR `FinderPattern` overhead. This eliminates the library-level `MultiFormatReader: non-ReaderException from reader: NotFoundException` `console.warn` noise that the generic multi-format reader produced on every frame (zxing's `NotFoundException` extends `Exception`, not `ReaderException`, so its QR sub-reader failure was misclassified as a non-ReaderException and logged). Supported formats are confined to retail 1D codes: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, Code 93, ITF.
- **Decode hints:** a single module-scope hints map is built once (`POSSIBLE_FORMATS` = the 1D formats above, plus `TRY_HARDER: true`) and passed to a single reader instance held across frames for stable, stateful decoding. `TRY_HARDER` makes `OneDReader` scan every image row rather than ~25 sampled rows, which is required to find small/thin retail barcode labels.
- **One common handler:** both camera and USB/keyboard scans funnel through a single client handler `handleBarcodeDetected` in `pos-screen.tsx` → `lookupBarcodeAction` (`src/actions/sales-actions.ts`) → `lookupPosBarcode` (`src/services/sales.service.ts`). The handler trims the value, looks the product up, then calls the existing `addToCart`. No duplicated lookup/business logic: the scanner only produces a barcode value; the existing POS owns validity, stock/expiry, pricing, permissions, and cart rules (§14).
- **Server lookup outcomes:** `lookupPosBarcode` returns `{ status: "found" | "inactive" | "notfound" }` (with a `PosProductDto` when found). It requires `sales.create` (same as the POS page) and matches exact barcodes including inactive products so the UI can show a distinct "inactive" message (BR-004). Regular POS search (`posSearchProducts`) stays active-only.
- **Component:** `src/components/pos/barcode-scanner.tsx` (`BarcodeScanner`, exports `ScanOutcome`) — a dialog that requests camera permission on start and acquires the camera through ZXing's `decodeFromVideoDevice` (the stable, battle-tested path that builds minimal, universally-supported constraints: `{ facingMode: 'environment' }` by default, or `{ deviceId: { exact } }` once the user picks a specific camera via the selector). It intentionally does NOT pass custom `width`/`height`/`ideal`-facingMode resolution constraints, because a negotiated high-resolution stream can stall video load and trip ZXing's `tryPlayVideoTimeout`, which disposes the media stream and stops the camera shortly after the preview appears. It decodes continuously (1D formats only; see decoder notes above) with a cooldown, and releases the camera stream on close/unmount. Expected per-frame "not found" misses are handled silently; unexpected start/attach errors still surface with Arabic user feedback and technical logs. The decode loop only disposes the camera on a genuine scan-loop failure — an ordinary `NotFoundException` (no barcode in the current frame) simply continues the loop and never touches the media stream.
- **Permission & availability:** only users with `sales.create` can open the scanner (button shown in the POS UI, disabled unless a shift is OPEN). The POS keeps working when the camera is unavailable (manual search / USB keyboard scanner).
- **Secure context:** production camera scanning requires a secure (HTTPS or localhost) context — `navigator.mediaDevices` is undefined otherwise; no insecure workaround is provided.

### Dashboard Overview (finalized)

- **Route:** `/` — the dashboard home inside the authenticated `(dashboard)` area (`src/app/(dashboard)/page.tsx`). It is a Server Component that fetches role-filtered data via `getDashboardData` and renders `DashboardClient` for interactive period selection.
- **Data loading:** `getDashboardAction` server action calls `getDashboardData` (`src/services/dashboard.service.ts`) which runs independent aggregations in parallel via `Promise.all`. Each section is permission-gated at the service level — unauthorized data is never queried, let alone sent to the client.
- **Sections & permissions:**
  - **Sales KPIs / Trend / Payment Breakdown / Top Products** — require `sales.read` (Owner/Manager/Accountant/Cashier).
  - **Shift Summary** — require `shifts.read` + actor is CASHIER; shows active shift, expected cash, and quick actions.
  - **Inventory Alerts (low/out/expiring/expired/replenishment)** — require `inventory.read` (Owner/Manager/Accountant/Warehouse).
  - **Receivables** — require `customers.view_ledger` or `accounting.read` (Owner/Manager/Accountant).
  - **Payables** — require `suppliers.view_ledger` or `accounting.read` (Owner/Manager/Accountant).
  - **Expenses** — require `expenses.read` (Owner/Manager/Accountant).
  - **Profit (Gross/Net)** — require `accounting.read` (Owner/Manager/Accountant); calculated from real COGS and expenses, never revenue-only.
  - **Quick Actions** — filtered by user's permissions (`sales.create`, `products.create`, `purchases.receive`, `customer_payments.create`, `supplier_payments.create`, `expenses.create`, `inventory.read`, `inventory.view_replenishment`).
- **Period selector:** Client-side dropdown (`اليوم` / `هذا الأسبوع` / `هذا الشهر` / `فترة مخصصة`) calls `getDashboardAction` via `useTransition`; default is `اليوم`.
- **Empty states:** Every section renders an honest Arabic message when no data exists (e.g., `لا توجد مبيعات خلال هذه الفترة`).
- **Visual hierarchy (per AGENTS.md §20):**
  1. KPI row (current business state)
  2. Shift summary (issues requiring attention)
  3. Sales trend + payment breakdown (trends)
  4. Top products + inventory alerts (analytics + alerts)
  5. Financial summaries (receivables/payables/expenses/profit)
  6. Quick actions (secondary)
- **Charts:** Uses Recharts `Area` + `Line` for the 7-day sales trend; no decorative charts.
- **Loading:** Route-level `loading.tsx` provides structural skeletons matching the final layout; server component streams immediately.
- **RTL/Accessibility:** Arabic-first labels, logical CSS properties, heading hierarchy (h1 → h2), visible focus states, color not sole status indicator.
- **No generic AI patterns:** Avoids huge rounded cards, excessive gradients, glassmorphism, meaningless animations, decorative blobs.

### Café / KDS (finalized)

- **Goal:** a café checkout that (1) records the operational order for the barista **and** (2) posts the financial Sale (payments, customer snapshot, inventory, shift effect) in the **same MongoDB transaction**, reusing the existing POS Sale core (`sales.service` → `createSaleWithSession`) — no second payment system. The barista's KDS stays a fast, read-mostly fulfillment board with server-authoritative realtime via a transactional outbox + SSE.
- **Models:** `CafeOrder` (embedded immutable `items` with per-line `sugarLevel` snapshot, immutable `statusHistory`, optimistic `version`, unique sparse `idempotencyKey`, stable `saleId` link + `invoiceNumber` snapshot, indexed by `{status, createdAt}` and `{createdAt:-1}`) and `EventOutbox` (unique `eventId`, monotonic unique `sequence`, `version`). Order numbers `CF-YYYYMMDD-NNNN` via a per-day sequence; sale invoice numbers `INV-…` via the shared sale sequence. `Category.supportsSugarOptions` is the single source of truth for which products accept a structured sugar level (derived, never a per-product flag for new behavior).
- **State machine:** server-enforced guard `NEW→PREPARING`, `NEW→CANCELLED`, `PREPARING→READY`, `PREPARING→CANCELLED`, `READY→COMPLETED`; terminal states reject all further transitions and step-skipping is rejected. Every mutation is a transactional, version-guarded update that appends an outbox event in the same transaction; double-submission is protected by `idempotencyKey` (cafe order `cafe:…` and nested sale `cafe-sale:…`), and optimistic mismatch yields `CONFLICT`.
- **Checkout flow:** server merges identical (product + sugar + customization) lines, validates sugar-support per product (resolved from the product's category), then calls `createSaleWithSession` inside `withTransaction`; the café order items + total are built from the authoritative Sale lines (single source of truth for price). Order replay for a given key returns the existing order and never double-posts.
- **Realtime (§15):** route `/api/cafe/events` (`runtime = "nodejs"`, `dynamic = "force-dynamic"`) authenticates independently of middleware, validates café read permissions, and streams a `snapshot` (SNAPSHOT_SEQUENCE = current latest) followed by `cafe:event` deltas with `id = sequence` and 15s heartbeat, polling the outbox every 1.5s. Resume honors `Last-Event-ID` (auto-sent by EventSource) over the `after` query param; events are deduped by `eventId` server/client-side.
- **Reconnect:** the KDS reconciles by refetching full server state (`listKdsOrders`) and resumes by monotonic `sequence`, so no batch is lost and duplicates never double-apply.
- **Permissions:** `cafe.orders.read/create/update/cancel/status` + `cafe.kds.view`. BARISTA = read/status/kds.view only (cannot create: creation needs `sales.create`); CASHIER = read/create/update/cancel (no `status`, no `kds.view`); MANAGER/OWNER = all. Routes `/cafe` and `/kds` gate on the relevant permission and redirect otherwise; all actions/services enforce at the boundary via `requirePermission`.
- **UI:** cashier café screen (`/cafe`) with active-orders grid + history toggle (invoice column) + builder modal (product search, per-cup `درجة السكر` dropdown shown only for category sugar-capable products, quantity, per-line and order notes, optional customer, payment method selector with mixed methods + cash tendered/change, idempotent submit, live refresh). KDS board (`/kds`) with 3 columns (جديد / قيد التحضير / جاهز), large order short-code + 1s age timer, sugar badge per item (text label, color never the only signal), big touch targets read from meters away, calm empty states, non-intrusive connection badge, realtime refresh/reconcile. Order-action buttons disable per-order (one busy order never blocks the others). Barista UI stays free of accounting details.
- **Financial boundary:** the Sale/payments/inventory/shift effect commit atomically with the order; failures roll back everything. Cancellation is operational — the linked Sale is never mutated (returns/refunds not modeled, matching the POS/returns position).
