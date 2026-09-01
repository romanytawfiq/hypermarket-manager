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
2. Implement rate limiting/lockout on the login action before public exposure.
3. Replace `purchasing.service.ts` `nextNumber()` with the atomic sequence utility.
4. Kill the two N+1 hot paths (`listProducts`, shift list) with batch methods.
5. Add ARIA tab patterns to customer/supplier detail, and focus-trapping to the
   cafe order builder.
6. Per-table `aria-label`s across data tables.
7. Add explicit `AUTH_SECRET` requirement in production.