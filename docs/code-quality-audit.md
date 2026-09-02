# Code Quality & Hardening Audit — Nexa Retail

Date: 2026-09-01
Scope: code-quality, testing, refactoring, SEO and UX-hardening pass. **No new business features were added.**

## 1. Executive Summary

The pass produced a structured audit and delivered fixes for the highest-severity
findings. The most important discovery was a **systemic front-end bug**: every row
action menu across the application (products, categories, brands, customers,
suppliers, users) used the Radix-style `onSelect` event on the Base UI `Menu.Item`
(`@base-ui/react`), which **does not fire** — so edit/disable actions in all six
managers silently did nothing. This was reproduced end-to-end via Playwright,
fixed, and covered by a passing E2E test.

Other delivered fixes: double-submit protection on the POS shift open/close (the
app's most financial-critical actions), visible loading state on sale submission,
SEO hardening (metadataBase, OpenGraph, explicit `noindex` on all private routes,
`robots.ts`), replacement of a leaked-real MongoDB Atlas credential in
`.env.example`, RTL/a11y fixes, the Next 15/16 `middleware → proxy` migration, and
a flaky test determinism fix.

Final regression state — all green:
- `npx tsc --noEmit` — passes
- `npx eslint .` — clean (0 problems)
- `npx vitest run` — **157 passed / 19 files**
- `npx next build` — passes (no warnings)
- `npx playwright test e2e` — **3 passed** (auth ×2, product lifecycle)

---

## 2. Critical / High Findings (fixed)

### H1 — All row action menus were non-functional (Critical)
The UI uses `@base-ui/react` `Menu.Item` for dropdown actions. Base UI's item does
**not** support a Radix-style `onSelect`; the correct event is `onClick` (merged by
`useMenuItemCommonProps`). Because every manager passed `onSelect`, none of the
menu actions ever executed.

Evidence:
- `products-manager.tsx` — "تعديل" opened no dialog; disable did nothing.
- Same pattern in `categories-manager.tsx`, `brands-manager.tsx`,
  `customers-manager.tsx`, `suppliers-manager.tsx`, `users-manager.tsx`.

Fix: replaced `onSelect` with `onClick` in all six managers
(`src/components/catalog/products-manager.tsx`,
`src/components/catalog/categories-manager.tsx`,
`src/components/catalog/brands-manager.tsx`,
`src/components/customers/customers-manager.tsx`,
`src/components/suppliers/suppliers-manager.tsx`,
`src/components/users/users-manager.tsx`).

Verified by the new E2E product spec: create → edit → disable → filter → confirm.

### H2 — POS: open/close shift had no pending state → double-submit risk (High)
`pos-screen.tsx` `handleOpenShift` / `handleCloseShift` were bare async functions.
The confirm buttons had no `disabled` prop, so an operator could fire the action
multiple times (duplicate/conflicting shifts, double-close attempts) on the most
financial-critical operations. `submitSale` disabled the button but gave **zero**
visual feedback while a sale was processing.

Fix (`src/components/pos/pos-screen.tsx`):
- Added `openShiftPending` / `closeShiftPending` state; guarded re-entry; `try/finally`.
- Confirmation buttons now disable and show `جارٍ فتح الوردية...` /
  `جارٍ إغلاق الوردية...` with a spinner.
- The checkout button now shows `جارٍ إتمام البيع...` with a spinner while
  submitting.

### H3 — Real MongoDB Atlas credential in `.env.example` (High — security)
`.env.example` contained a live Atlas connection string
(`mongodb+srv://kiinno:…@cluster0.6tib8hr.mongodb.net/nexa-retail`).

- It was **not tracked** in git (git ls-files shows no `.env*`), and the credential
  no longer appears anywhere in the working tree.
- Replaced with a local-development placeholder plus a comment instructing that a
  rotation is mandatory if the string was ever distributed.

### H4 — Private routes were not explicitly `noindex` (High — SEO)
No route emitted `robots: { index: false }`. Dashboard pages were only protected
by a redirect, and the public `/login` page was fully indexable.

Fix:
- `src/app/(dashboard)/layout.tsx` → `robots: { index: false, follow: false }`
  (covers every authenticated route).
- `src/app/(auth)/login/page.tsx` → same directive.
- New `src/app/robots.ts` publishes a valid `robots.txt` (allows crawling only of
  what is public; private pages are meta-noindex). Confirmed generated in build:
  `○ /robots.txt`.

### H5 — Root metadata was not configured for canonical/social use (High — SEO)
The root `Metadata` had only `title` + `description`. No `metadataBase` (absolute
URL resolution for OG/sitemap), no OpenGraph, no applicationName.

Fix (`src/app/layout.tsx`): added `metadataBase` (from `NEXT_PUBLIC_APP_URL`, fallback
`http://localhost:3000`), `applicationName`, `keywords`, and a default `openGraph`
block with `siteName`/`locale: ar_EG`/`url`.

### H6 — `src/middleware.ts` deprecated (Medium — reliability)
Next 16 deprecated the `middleware` convention in favor of `proxy`.

Fix: renamed `src/middleware.ts` → `src/proxy.ts`, renamed the exported function to
`proxy`. Build now logs `ƒ Proxy (Middleware)` with no deprecation warning.

### H7 — Flaky integration test: duplicate username (High — test reliability)
`sales.test.ts` called `managerActor()` (which hardcoded username `mgr4`) in
`beforeAll` **and** again inside a test, colliding on the users unique index
(`E11000 duplicate key`).

Fix: `managerActor(username?)` now accepts a unique username; the second caller
uses `mgr_mvmt`. Suite went from 1 failed / 156 passed → **157 passed**.

---

## 3. Medium Findings (fixed)

### M1 — Expense category quick-add could double-submit via Enter (Medium)
The category `Input`'s `onKeyDown` Enter handler called `add()` without checking
`createPending`, while the button itself was correctly disabled.
Fix (`src/components/expenses/expenses-manager.tsx`): guard `if (!createPending)`.

### M2 — Table header semantics missing (Medium — a11y)
No `<th>` had a `scope` attribute, so screen readers could not associate cells
with headers.
Fix: `src/components/ui/table.tsx` `TableHead` now defaults `scope="col"` (override
allowed per instance).

### M3 — Dialog close buttons were in English (Medium — a11y/localization)
`src/components/ui/dialog.tsx` sr-only close text and `DialogFooter` close button
said "Close".
Fix: replaced with `إغلاق`.

### M4 — Physical `text-right` in an RTL app (Medium — RTL)
`src/components/dashboard/payment-breakdown.tsx` used `text-right`.
Fix: `text-end`.

### M5 — Dropdown sub-menu missing RTL side variants (Low/Medium — RTL)
`DropdownMenuSubContent` only handled physical `data-[side=left/right]`, unlike the
parent `DropdownMenuContent` which also covered `inline-end`/`inline-start`.
Fix: added the two logical-side slide-in variants in
`src/components/ui/dropdown-menu.tsx`.

### M6 — Shift-dialog labels not associated with inputs (Medium — a11y)
POS shift dialogs used bare `<label>` without `htmlFor`/`id`.
Fix: added `htmlFor`/`id` pairs for opening cash, actual cash, and close note in
`pos-screen.tsx`.

---

## 4. Tooling & Test Infrastructure (new)

- `playwright.config.ts`, `e2e/auth.spec.ts`, `e2e/product.spec.ts` — Playwright
  E2E harness; `webServer` boots a memory-MongoDB-seeded dev server on port 3100
  with an isolated `.next-e2e` dist dir (avoids lockfile conflict with the
  developer's own dev server on port 3000). Owner password is force-reset to a
  known value by `scripts/e2e-reset-owner.ts` after seeding.
- `scripts/run-dev.mjs` — seeds the DB, resets the owner, starts `next dev`.
- `@playwright/test` added as a devDependency; Chromium headless shell installed.
- `.gitignore` now covers `/.next-e2e/`, `/playwright-report/`, `/test-results/`.
- `eslint.config.mjs` — `/.next-e2e/**` added to ignores (otherwise generated
  build output pollutes lint results).
- `next.config.ts` — optional `NEXT_E2E_DIST` distDir carried over, plus
  `turbopack.root` pinned to the project directory to silence the "ignored
  package-lock.json outside the Git repository" warning.

---

## 5. Audit-Only Findings (documented; deferred by design)

These were reviewed and left as recommendations to keep the pass focused and
low-risk. None is a known defect; they are listed for the next iteration.

### Security & validation
- S1 (Medium) — Login currently has no rate-limiting / lockout. Recommended before
  public exposure: throttle by username+IP in `loginAction`.
- S2 (Low) — `AUTH_SECRET` defaults to `"development-only-insecure-secret"`
  (`src/lib/env.ts:32`). Currently unused for signing; production should require an
  explicit value before the secret is used.
- S3 (Info) — `accounting-actions.ts` and `dashboard-actions.ts` are the only two
  action files without zod validation; both are read-only aggregations whose inputs
  (period enum + ISO dates) are validated by service-side parsing. Acceptable.
- S4 (Good) — All 13 mutation-bearing action files re-validate with zod server-side
  and enforce permission checks through the shared access-control helper.

### DB / indexes
- D1 (Medium) — `purchasing.service.ts` `nextNumber()` uses `countDocuments() + 1`
  for purchase numbers. Racy under concurrency; uniqueness is enforced by the index
  (an insert aborts) rather than by allocation. Prefer the atomic
  `nextSequenceValue` mechanism already used by sales/expenses.
- D2 (Low) — `sale.customer` is indexed as an embedded object; if the ID is used to
  filter separately, index `customer.id`.
- D3 (Medium, perf) — N+1 query patterns: `catalog.service.ts listProducts`
  (`Promise.all(… await currentSellable(…))`) and `shift.service.ts` list path
  (`shiftTotals()` per shift). Consider batch methods for large datasets.
- D4 (Low, perf) — POS product search uses a leading-wildcard `$or` regex
  (`sales.service.ts`), which cannot use the barcode/SKU indexes. Acceptable at
  current catalog sizes; consider a text index or prefix-boundary search as the
  catalog grows.

### a11y / UX (validated; deferred)
- A1 (Medium) — Cafe order builder is a custom overlay with `role="dialog"`
  `aria-modal` but no focus trap or Escape handling. Refactor to the Base UI
  `Dialog` primitive or add a trap.
- A2 (Medium) — Tab interfaces in `supplier-detail.tsx` and `customer-detail.tsx`
  use buttons without the ARIA tab pattern (`role=tab`/`tablist`/`aria-selected`).
- A3 (Low) — Data tables lack per-table `aria-label`/`caption`. The `scope="col"`
  fix (M2) is done; semantic table titles can be added per screen.
- A4 (Low) — RTL pagination arrows: icons use ChevronRight/Left but have accurate
  `sr-only` names; consider flipping icons in RTL for sighted users.

### Logging
- L1 (Low) — Some read-only actions swallow errors (`catch {}`) and never emit the
  `resolveError().cause` context they construct. No user-facing leak found
  anywhere; recommend logging `cause` server-side once before throwing to aid
  debugging.

---

## 6. Test Coverage Baseline (invariants already covered)

The invariant slice requires correctness of financial/reconciliation invariants.
These were verified already covered by the existing 157 tests and were not
duplicated:

- Payments total must equal invoice total → `sales.test.ts` "rejects a sale whose
  payments do not equal the total".
- Multi-method payment splits → `accounting.test.ts` `[[50,"CASH"],[20,"VISA"]]`,
  `cafe.test.ts` mixed CASH/VISA; `salesByMethod` breakdown asserted.
- Expected-cash reconciliation (opening + cash sales + cash movements) →
  `sales.test.ts` "closes a shift with server-computed expected cash and
  variance" and "includes recorded cash movements…".
- Non-cash payments excluded from til cash → `cafe.test.ts` (`536 expected`).
- Idempotent sale retry (no double deduction) → `sales.test.ts`.
- FEFO batch consumption → `sales.test.ts`.
- Server-side balances (not UI state) → `customers.test.ts` (credit limits,
  partial payments, `balanceDue`), `purchasing.test.ts` (supplier payable grows
  and shrinks correctly).
- Authorization on sensitive actions → `authorization.test.ts` + per-module tests.
- Expiry alerts, stock movements, and catalog CRUD → `inventory.test.ts`,
  `catalog.test.ts`, `barcode-*.test.ts`.

New value added by this pass: the E2E product lifecycle spec (create → edit →
disable) that catches the class of UI wiring regressions (`onSelect`) that unit
tests cannot see.

---

## 7. Regression Gate Commands

From the repository root:

- `npx tsc --noEmit`
- `npx eslint .`
- `npx vitest run`
- `npx next build`
- `npx playwright test e2e`

All pass. Note: on this machine scripts must be invoked through `cmd /c` when npm
script-file execution is blocked by the shell policy.

---

## 8. Outstanding Deferred Work (next iterations)

1. Rotate the old Atlas credentials if they ever leaked outside this working tree.
2. ~~Implement rate limiting/lockout on the login action before public exposure~~ — **FIXED in Phase 10 audit** (see §9).
3. ~~Replace `purchasing.service.ts` `nextNumber()` with the atomic sequence utility~~ — **FIXED in Phase 10 audit** (see §9).
4. Kill the two N+1 hot paths (`listProducts`, shift list) with batch methods.
5. Add ARIA tab patterns to customer/supplier detail, and focus-trapping to the cafe order builder.
6. Per-table `aria-label`s across data tables.
7. Add explicit `AUTH_SECRET` requirement in production.

---

## 9. Phase 10 — Financial-Integrity & Security Hardening Audit (2026-09-02)

A follow-up engineering audit focused on financial integrity, security, and
validation across the online-store / delivery financial boundary, the online
storefront, authentication, purchasing, and shift read paths. The findings
below were **verified against source and fixed in this pass**. Regression gate
after fixes — all green: `eslint` clean, `vitest run` **226 passed / 23 files**,
`next build` (typecheck) passes.

### 9.1 FIN-001 (HIGH, fixed) — COD order could be marked DELIVERED without posting the Sale

**Finding:** `transitionOnlineOrder` in `src/services/online-store.service.ts`
allowed a generic `OUT_FOR_DELIVERY → DELIVERED` transition under
`online.orders.manage`. An operator holding that permission (but not
`sales.create`) could mark a COD order DELIVERED — a terminal state — while:
no financial Sale was ever posted (COD cash never entered accounting), and the
inventory reservations were never released/fulfilled. Because `DELIVERED` is
terminal, `collectCodAndDeliver` could then never run, permanently losing the
recorded payment. The bug was "encoded" into `online-store.test.ts` (the admin
ladder walked to DELIVERED via the generic transition).

**Fix:**
- Removed `DELIVERED` from `ALLOWED_NEXT.OUT_FOR_DELIVERY` so the only paths to
  DELIVERED are `collectCodAndDeliver` (COD) and `deliverPaidOnlineOrder`
  (ONLINE) — both of which create the Sale + fulfill reservations in one
  transaction (`online-store.service.ts`).
- Admin dashboard no longer exposes a bare "تقدم" for `OUT_FOR_DELIVERY`; it now
  invokes the financial deliver action ("تسليم + تسجيل البيع")
  (`online-orders-admin.tsx`).
- Corrected `online-store.test.ts` to assert that a bare DELIVERED transition is
  rejected (CONFLICT), and added no regression gap.

### 9.2 HIGH (fixed) — Storefront checkout regenerated its idempotency key every submit

**Finding:** `checkout-form.tsx` called `crypto.randomUUID()` inside the submit
handler, generating a fresh key on every attempt. The server-side idempotency
lookup (`online-store.service.ts` by `idempotencyKey`) could therefore never dedupe:
if an order succeeded server-side but the response was lost (timeout/reset), the
retry created a duplicate order. It also ignored the already-passing guard against
double-click between rapid retries.

**Fix:** The idempotency key is now generated once per form mount and reused for
the whole checkout session, so a retry returns the existing order (idempotent
replay) instead of double-committing.

### 9.3 HIGH (fixed) — Login had no rate limiting

**Finding:** `loginAction` (`src/actions/auth-actions.ts`) performed
unthrottled bcrypt-12 verification on every attempt. An attacker could brute-force
or credential-stuff staff accounts, and cheaply exhaust CPU (effective DoS). The
existing in-memory limiter (`src/lib/rate-limit.ts`) was used only by online order
creation, not login (previously S1).

**Fix:** `loginAction` now calls `isRateLimited()` up-front and returns a safe
Arabic message when the caller exceeds the per-client window.

### 9.4 HIGH (fixed) — Supplier payments: free-form method + no idempotency (double-posting)

**Finding:** `supplierPaymentSchema.method` was a free-form `string` (max 60), and
the Pay Supplier form sent Arabic labels (`نقدي`, `تحويل بنكي`…). These were stored
verbatim, so supplier cash payments never matched the canonical `CASH` token used
by `isCashMethod` and by every other payment record — supplier cash payments were
excluded from accounting/dashboard cash aggregations, and the method was not a
closed enum. Separately, supplier payments had no `idempotencyKey`, so a retry after
a lost response could double-post money.

**Fix:**
- `supplierPaymentSchema.method` now validates against `z.enum(PAYMENT_METHODS)`
  and requires an `idempotencyKey` (`validations/purchasing.ts`).
- `SupplierPaymentModel` stores the enum token and adds a unique sparse index on
  `idempotencyKey` (`models/supplier-payment.ts`).
- `createSupplierPayment` is now idempotent (replays return the existing payment)
  (`purchasing.service.ts`); the immediate-cash purchase path records `CASH`.
- The Pay Supplier form sends enum tokens + Arabic labels via the shared
  `PAYMENT_METHOD_LABELS` map (`purchase-forms.tsx`); the supplier detail table
  renders labels via `paymentMethodLabel`.
- **Root-cause follow-through:** `accounting.service.ts` and `dashboard.service.ts`
  aggregated supplier cash by matching the Arabic label `"نقدي"`; both now match the
  canonical `"CASH"` token (this was the original reason the free-form string broke).
- Added a regression test: replaying a supplier-payment key never double-posts.

### 9.5 HIGH/MEDIUM (fixed) — Purchasing/returns numbering race (was D1)

**Finding:** `purchasing.service.ts` `nextNumber()` used `countDocuments() + 1`,
which is racy under concurrency and could produce duplicate purchase/return numbers
(they are not unique-indexed, so collisions were silent). Sales/café/expenses already
used the atomic `nextSequenceValue`.

**Fix:** `nextNumber()` now delegates to `nextSequenceValue`, passing the transaction
session so allocation and the financial write commit atomically.

### 9.6 MEDIUM (fixed) — `listCashMovements` cross-shift read (IDOR-lite)

**Finding:** `listCashMovements(actor, shiftId)` (`src/services/shift.service.ts`)
queried movements by `shiftId` with no ownership scoping. Any role holding
`cash_movements.read` (e.g. a CASHIER) could enumerate another employee's cash-movement
records by supplying an arbitrary `shiftId` — unlike the write paths and `listShifts`,
which scope non-Owner/Manager actors to their own shift.

**Fix:** `listCashMovements` now resolves the shift and applies the same
`canManageOtherShift` scoping as `closeShift`/`recordCashMovement`: OWNER/MANAGER may
read any shift; every other actor is restricted to their own shift (FORBIDDEN otherwise).

### 9.7 External review findings A–F — reconciled (verified, no code change)

- **A — Supplier payment method vocabulary:** this was the free-form-string bug,
  now fixed (see §9.4) — the shared enum is used everywhere.
- **B — Socket.IO: N/A.** No `src/server/socket/` / `server.ts` exists; realtime is
  SSE (`src/app/api/cafe/events/route.ts` + `src/lib/realtime/cafe-events.ts`). Do not
  introduce Socket.IO.
- **C — Payment model: design decision, preserved.** `SaleModel` payments are
  `["CONFIRMED"]`; online payment state lives on `OnlineOrder`
  (`PAYMENT_PENDING`/`PAID_ONLINE`/`PAID_AT_DELIVERY`). No blind status change applied.
- **D — Café financial integration: pattern confirmed.** `createOrder` creates Sale +
  CafeOrder in one transaction with per-line sugar snapshots. Preserved (no concrete
  bug found).
- **E — Brand image: already implemented.** `src/models/brand.ts` has `logo?` data-URI +
  CRUD + storefront display. No change needed.
- **F — (validated)** server-authoritative pricing/stock confirmed
  (`sales.service.ts` idempotency unique index; `inventory.service.ts` transaction-driven
  stock); Kashier webhook is signature-verified, fail-closed and idempotent.

### 9.8 Remaining audit-only recommendations (not defects; retained for next iteration)

- **Login lockout / per-username + IP throttling** with exponential backoff and
  temporary lockout (the basic `isRateLimited` throttle is now in place).
- **`AUTH_SECRET`** default `development-only-insecure-secret` (`env.ts`): today unused
  for signing; production should fail-closed when it is eventually used. (Recommend
  rejecting the known default in production.)
- **N+1 query paths** (`catalog.service.ts listProducts`, `shift.service.ts` list):
  batch methods for large datasets (TODO for Phase 11).
- **Dynamic per-product SEO metadata** (`generateMetadata`) + product URLs in the
  sitemap for the storefront.
- **A11y:** ARIA tab patterns, cafe order-builder focus trap, per-table `aria-label`s.