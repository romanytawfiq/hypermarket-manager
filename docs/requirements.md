# Nexa Retail — Functional Requirements

## 1. Purpose

This document defines the functional requirements for the Nexa Retail platform.

The system is designed to manage:

- supermarket retail operations
- cashier operations
- inventory
- purchasing
- suppliers
- customer credit
- accounting
- café operations
- thermal printing
- online sales
- delivery
- reporting

The requirements are intentionally business-oriented.

Implementation details must not be inferred from this document unless explicitly defined.

---

# 2. User Roles

The system should support role-based access.

Initial roles:

- Owner
- Manager
- Cashier
- Accountant
- Warehouse Employee
- Barista

Future roles may include:

- Delivery Employee
- Customer
- Branch Manager

---

# 3. Authentication Requirements

## REQ-AUTH-001

Users must be able to securely authenticate.

## REQ-AUTH-002

Users must be able to sign out.

## REQ-AUTH-003

Authenticated users must have an associated role.

## REQ-AUTH-004

Protected internal application areas must require authentication.

## REQ-AUTH-005

Sensitive business operations must require server-side authorization. ✅ (Phase 1 & 2: server-side `requirePermission` enforced at service boundary.)

## REQ-AUTH-006

The UI must not be considered a security boundary. ✅

---

# 4. User and Employee Management

## REQ-USER-001

Authorized users can create employees.

## REQ-USER-002

Authorized users can update employee information.

## REQ-USER-003

Authorized users can activate or deactivate employees.

## REQ-USER-004

Authorized users can assign roles.

## REQ-USER-005

The system must prevent unauthorized users from performing restricted actions.

---

# 5. Product Management

*Phase 2 — Implemented.*

## REQ-PROD-001

Authorized users can create products. ✅

## REQ-PROD-002

Authorized users can edit products. ✅

## REQ-PROD-003

Authorized users can deactivate products (deactivation, not deletion, preserves historical references). ✅

## REQ-PROD-004

Products support:

- name ✅
- barcode (sparse-unique) ✅
- SKU (sparse-unique) ✅
- category (required reference) ✅
- brand (optional reference) ✅
- unit (default "قطعة") ✅
- purchase cost ✅
- selling price ✅
- minimum stock threshold ✅
- online visibility ✅
- product description ✅
- product images — pending Phase 9 (Online Store)
- expiry tracking configuration ✅

## REQ-PROD-005

Products support search by barcode, name, and SKU via regex query. ✅

## REQ-PROD-006

The system distinguishes active and inactive products. ✅

---

# 6. Categories and Brands

*Phase 2 — Implemented.*

## REQ-CAT-001

Authorized users can create categories. ✅

## REQ-CAT-002

Authorized users can update categories. ✅

## REQ-CAT-003

Authorized users can deactivate categories where required (deactivation preserves historical references). ✅

## REQ-BRAND-001

Authorized users can create and manage brands. ✅

---

# 7. Inventory Management

*Phase 2 — Implemented.*

## REQ-INV-001

The system tracks current inventory via `InventoryState` (denormalized cache) plus append-only `StockMovement` history. ✅

## REQ-INV-002

Inventory changes are traceable through the `StockMovement` ledger. ✅

## REQ-INV-003

Inventory changes are represented by stock movements (append-only, never mutated). ✅

## REQ-INV-004

The system supports inventory changes caused by:

- purchasing (reserved for Phase 3+)
- sales (reserved for Phase 4+)
- customer returns (reserved for later)
- supplier returns (reserved for later)
- damage ✅
- expiry ✅
- manual adjustment ✅
- stock count ✅
- future transfers (reserved for later)

## REQ-INV-005

The system identifies low-stock products (`sellable <= minimumStock`). ✅

## REQ-INV-006

The system identifies out-of-stock products (`sellable <= 0`). ✅

## REQ-INV-007

The system identifies products approaching expiry (within 30 days) and already-expired batches. ✅

## REQ-INV-008

Products with `trackExpiry = true` support batch/lot tracking via `ProductBatch`. ✅

## REQ-INV-009

Authorized users can review stock movements (paginated, filterable by product and type). ✅

## REQ-INV-010

Inventory adjustments are auditable (audit records with actor, timestamp, and change details). ✅

---

# 8. Inventory Replenishment

*Phase 2 — Implemented.*

## REQ-REPLENISH-001

The system suggests products that need replenishment (`sellable < minimumStock`). ✅

## REQ-REPLENISH-002

Suggestions consider:

- current stock (sellable quantity) ✅
- minimum stock ✅
- recent sales — pending Phase 4+ (sales data)
- sales velocity — pending Phase 10 (reports)
- supplier availability — pending Phase 3+ (suppliers)
- product expiry — ✅ (expiry-visible in inventory summary)

## REQ-REPLENISH-003

Replenishment suggestions are recommendations. Employees review them before creating a purchase. ✅

---

# 9. Supplier Management

## REQ-SUP-001

Authorized users can create suppliers.

## REQ-SUP-002

Authorized users can update supplier information.

## REQ-SUP-003

The system must maintain supplier transaction history.

## REQ-SUP-004

The system must display outstanding supplier balances.

## REQ-SUP-005

Supplier balances must be derived from supplier transactions.

---

# 10. Purchasing

## REQ-PUR-001

Authorized users can record supplier purchases.

## REQ-PUR-002

A purchase may contain multiple products.

## REQ-PUR-003

The system must record received quantities.

## REQ-PUR-004

Receiving inventory must increase stock according to approved received quantities.

## REQ-PUR-005

Purchase transactions must affect supplier accounting according to payment status.

## REQ-PUR-006

The system should support supplier purchase returns.

---

# 11. Supplier Payments

## REQ-SUP-PAY-001

Authorized users can record payments made to suppliers.

## REQ-SUP-PAY-002

Supplier payments must be stored as historical transactions.

## REQ-SUP-PAY-003

Supplier payment history must be visible.

## REQ-SUP-PAY-004

Supplier outstanding balance must reflect recorded purchase and payment transactions.

---

# 12. Customer Management

## REQ-CUST-001

Authorized users can create customers.

## REQ-CUST-002

Authorized users can update customer information.

## REQ-CUST-003

The system must maintain customer transaction history.

## REQ-CUST-004

The system must display customer outstanding balances when credit is used.

---

# 13. Customer Credit

## REQ-CREDIT-001

The system must support credit sales.

## REQ-CREDIT-002

A credit sale may be fully unpaid or partially paid according to business rules.

## REQ-CREDIT-003

Customer outstanding balances must be calculated from transactions.

## REQ-CREDIT-004

The system must support customer payments.

## REQ-CREDIT-005

Partial customer payments must be supported where allowed.

## REQ-CREDIT-006

Customer payment history must remain available.

---

# 14. Retail Sales / POS

## REQ-SALE-001

Cashiers can create retail sales.

## REQ-SALE-002

Products can be added using barcode or search.

## REQ-SALE-002a (barcode scanning)

Products can be added to a POS cart by barcode using any of these input methods,
all sharing one common handler (`handleBarcodeDetected` → `lookupBarcodeAction` → `posSearchProducts`/`lookupPosBarcode` → `addToCart`):

- **USB / keyboard scanner** — the scanner types the barcode and presses Enter; the existing search input handles it.
- **Camera scanner** — a device camera scans the barcode; decoded locally in the browser (never uploaded or stored).

Behavior:
- The scanner only produces a barcode value. Product lookup, validity, stock/expiry,
  pricing, permissions, and cart rules remain owned by the existing POS flow (server-side).
- Barcode lookup must distinguish three outcomes and show a clear Arabic message:
  `found` (adds to cart), `inactive` (product deactivated, BR-004 — not sellable),
  `notfound` (no product matches).
- Requires the same permission as the POS page (`sales.create`).
- The camera must stop and release its stream on close/unmount; permission is
  requested only when scanning starts; prefers the rear/environment camera on mobile.

## REQ-SALE-003

A sale must contain one or more sale items.

## REQ-SALE-004

The system must calculate sale totals.

## REQ-SALE-005

The server must validate important financial values.

## REQ-SALE-006

A valid sale must generate the appropriate stock changes.

## REQ-SALE-007

A sale may optionally be associated with a customer.

## REQ-SALE-008

A sale may contain multiple payment methods.

---

# 15. Payments

## REQ-PAY-001

The system must support cash payment.

## REQ-PAY-002

The system must support card payment.

## REQ-PAY-003

The system must support digital wallet payment.

## REQ-PAY-004

The system may support InstaPay.

## REQ-PAY-005

The system may support configurable additional payment methods.

## REQ-PAY-006

One sale may contain multiple payment entries.

Example:

```text
Cash: 300
Visa: 200
Vodafone Cash: 100

Total: 600
```

## REQ-PAY-007

The payment state of a transaction must be explicit.

---

# 16. Cashier Shifts

## REQ-SHIFT-001

A cashier can start a shift.

## REQ-SHIFT-002

A shift must record opening cash.

## REQ-SHIFT-003

Sales must be associated with the relevant shift.

## REQ-SHIFT-004

Relevant cash movements must be associated with the shift.

## REQ-SHIFT-005

A cashier can close a shift if authorized by business rules.

## REQ-SHIFT-006

The system must calculate expected closing cash.

## REQ-SHIFT-007

The cashier or authorized employee must enter actual cash.

## REQ-SHIFT-008

The system must calculate and preserve the cash variance.

---

# 17. Returns and Refunds

## REQ-RETURN-001

The system should support customer returns.

## REQ-RETURN-002

The system should support refunds when applicable.

## REQ-RETURN-003

Returns must reference the original transaction where possible.

## REQ-RETURN-004

Returns must produce corresponding inventory and financial effects.

---

# 18. Expenses

## REQ-EXPENSE-001

Authorized users can record business expenses.

## REQ-EXPENSE-002

Expenses must include a category or classification.

## REQ-EXPENSE-003

Expense history must be available for reporting.

---

# 19. Café Orders

## REQ-CAFE-001

Cashiers can create café orders.

## REQ-CAFE-002

A café order can contain multiple items.

## REQ-CAFE-003

Each café order must have a unique order identifier.

## REQ-CAFE-004

Baristas must be able to see new orders.

## REQ-CAFE-005

Baristas must be able to update order status.

## REQ-CAFE-006

The system must preserve order history.

## REQ-CAFE-007 (Phase 7.1)

Creating a café order records the customer's payment: a Sale (with its payments), the stock deduction, and the cashier-shift effect commit in the **same transaction** as the order. Full payment is required (no on-account). The order carries the linked `saleId` and the Sale `invoiceNumber`.

## REQ-CAFE-008 (Phase 7.1)

Sugar belongs to the **individual cup**: supported products expose a structured sugar level per cup, and cups with different sugar levels are always distinct order lines (never merged). Products that do not advertise sugar options reject a sugar selection.

---

# 20. Café Order States

Initial states:

- NEW
- PREPARING
- READY
- COMPLETED
- CANCELLED

The final state machine must be defined in the business rules before implementation.

---

# 21. Real-Time Café Operations

## REQ-REALTIME-001

New café orders should appear to the barista with minimal delay.

## REQ-REALTIME-002

Order status changes should be reflected to authorized users in near real time.

## REQ-REALTIME-003

The system should handle temporary connection loss safely.

## REQ-REALTIME-004

Duplicate events must not result in duplicate business operations.

---

# 22. Thermal Printing

## REQ-PRINT-001

The system must support sales receipt printing.

## REQ-PRINT-002

Receipts must support Arabic RTL.

## REQ-PRINT-003

Receipts must support 58mm thermal printers.

## REQ-PRINT-004

Receipts must support 80mm thermal printers.

## REQ-PRINT-005

Printed receipts must represent the stored transaction accurately.

## REQ-PRINT-006

The system should support print preview where useful.

---

# 23. Reporting

## REQ-REPORT-001

The system must provide daily sales reports.

## REQ-REPORT-002

The system must provide weekly sales reports.

## REQ-REPORT-003

The system must provide monthly reports.

## REQ-REPORT-004

The system must provide yearly reports.

## REQ-REPORT-005

The system should provide product sales analysis.

## REQ-REPORT-006

The system should provide category sales analysis.

## REQ-REPORT-007

The system should provide payment-method analysis.

## REQ-REPORT-008

The system should provide cashier sales analysis.

## REQ-REPORT-009

The system should provide supplier balances.

## REQ-REPORT-010

The system should provide customer balances.

## REQ-REPORT-011

The system should provide expense reports.

## REQ-REPORT-012

The system should provide inventory and expiry reports.

## REQ-REPORT-013

The system should provide profit analysis only when sufficient cost information exists.

---

# 24. Online Store

## REQ-ONLINE-001

Customers can browse the public product catalog.

## REQ-ONLINE-002

Customers can search products.

## REQ-ONLINE-003

Customers can view product details.

## REQ-ONLINE-004

Customers can add products to a cart.

## REQ-ONLINE-005

Customers can update cart quantities.

## REQ-ONLINE-006

Customers can checkout.

## REQ-ONLINE-007

Customers can enter delivery information.

## REQ-ONLINE-008

Customers can choose a supported payment method.

## REQ-ONLINE-009

Online orders must be stored in the same business platform.

## REQ-ONLINE-010

Authorized employees can manage online orders.

---

# 25. Delivery

## REQ-DEL-001

Online orders must support delivery information.

## REQ-DEL-002

Delivery status must be explicit.

Initial statuses may include:

- PENDING
- CONFIRMED
- PREPARING
- READY_FOR_DELIVERY
- OUT_FOR_DELIVERY
- DELIVERED
- CANCELLED

## REQ-DEL-003

Customers must be able to view the current order status.

## REQ-DEL-004

Authorized employees can update delivery status.

---

# 25b. Expenses & Accounting (Phase 6)

*Phase 6 — Implemented.*

## REQ-EXP-001

Authorized employees can record operating expenses with a category, amount, payment method, date, and optional notes.

## REQ-EXP-002

Expense categories are configurable. A category may be disabled but never deleted, preserving history.

## REQ-EXP-003

Expenses are persisted as financial transactions with a sequential `EXP-YYYYMMDD-NNNN` number and an idempotency key that prevents duplicate submission on retry.

## REQ-EXP-004

A cash expense linked to an OPEN shift produces an EXPENSE cash movement so the shift's expected cash accounts for it. Non-cash expenses produce no cash movement; closed shifts are never mutated.

## REQ-EXP-005

Users with the `expenses.read` permission can view, filter (by date and category), and paginate the expense log. Creation requires `expenses.create`.

## REQ-ACC-001

An accounting overview aggregates the real, persisted transactions (sales, purchases, expenses) — it introduces no second ledger.

## REQ-ACC-002

The overview reports sales (total, collected, count), purchases (total, cash paid), expenses (total, cash), gross and net profit (preliminary), current receivables and payables, and physical cash flow (in vs out), distinguishing physical cash from card/wallet/Instapay.

## REQ-ACC-003

Access to the accounting overview requires `accounting.read`.

---

# 26. Auditability

## REQ-AUDIT-001

Important business operations should be auditable.

Potential audit events include:

- price changes
- stock adjustments
- financial adjustments
- sale cancellation
- shift closing
- permission changes
- refunds
- returns

## REQ-AUDIT-002

Audit records should identify who performed the action and when.

---

# 27. Arabic UX

## REQ-AR-001

Arabic is the default application language.

## REQ-AR-002

The internal application must be RTL. ✅ (Phase 2: inventory, catalog, and movement UI pages are Arabic-first RTL.)

## REQ-AR-003

The online store must be RTL.

## REQ-AR-004

Validation messages must be Arabic.

## REQ-AR-005

Notifications must be Arabic.

## REQ-AR-006

Receipts must support Arabic RTL.

---

# 28. Responsive Design

## REQ-RESP-001

Internal operational interfaces must prioritize desktop and tablet usability.

## REQ-RESP-002

The online store must be mobile-first.

## REQ-RESP-003

POS workflows must remain usable at common desktop resolutions.

---

# 29. Accessibility

## REQ-A11Y-001

Important workflows should support keyboard navigation.

## REQ-A11Y-002

Interactive controls must have accessible labels.

## REQ-A11Y-003

Focus states must be visible.

## REQ-A11Y-004

Color must not be the only way to communicate status.

---

# 30. Performance

## REQ-PERF-001

Frequently used POS screens should be fast.

## REQ-PERF-002

Large lists must support pagination or appropriate data loading strategies.

## REQ-PERF-003

Reports must avoid loading unnecessary historical data into the client.

## REQ-PERF-004

Database indexes should support common operational queries.

---

# 31. Data Integrity

## REQ-DATA-001

Financial data must not be silently overwritten.

## REQ-DATA-002

Important historical transactions must remain traceable.

## REQ-DATA-003

Inventory changes must be traceable.

## REQ-DATA-004

Critical calculations must be validated server-side.

## REQ-DATA-005

Concurrent operations must not corrupt financial or inventory state. ✅ (Phase 2: optimistic concurrency via `InventoryState.version` with `findOneAndUpdate` version filter.)
