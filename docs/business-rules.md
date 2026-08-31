# Nexa Retail — Business Rules

## Purpose

This document defines business behavior that must remain consistent regardless of the UI or implementation technology.

The rules below are business rules, not frontend behavior.

---

# 1. General Financial Rules

## BR-001 — Server Authority

The server is the authoritative source for:

- totals
- balances
- stock
- payment validity
- permissions
- financial transactions

Client-side calculations are for UX only.

---

## BR-002 — Historical Integrity

Completed financial transactions must not be silently overwritten.

Corrections should use explicit mechanisms such as:

- returns
- refunds
- reversals
- adjustments

where appropriate.

---

# 2. Product Rules

## BR-003 — Product Identification

Products may be identified through:

- barcode
- SKU
- internal identifier

Barcode values should be unique where required by the business.

---

## BR-004 — Product Status

Deactivated products should not appear as normally sellable products.

Existing historical transactions must continue referencing them.

---

# 3. Sales Rules

## BR-005 — Sale Completion

A sale becomes financially effective only after successful server-side validation.

---

## BR-006 — Sale Items

Each sale contains one or more sale items.

Historical item pricing must remain stable after completion.

If the product price changes later, previous sales must retain their original sale price.

---

## BR-007 — Sale Total

The final sale amount must be computed from validated server-side data.

The client must not be able to arbitrarily decide the final amount.

---

# 4. Multiple Payments

## BR-008 — Mixed Payment

A single sale may use multiple payment methods.

Example:

```text
Cash = 300
Visa = 200
Vodafone Cash = 100

Total = 600
```

---

## BR-009 — Fully Paid Transaction

For a fully paid transaction:

```text
sum(payments) = payable total
```

---

## BR-010 — Partial Payment

Partial payment is allowed only when the business rule for the transaction permits it.

---

# 5. Customer Credit

## BR-011 — Credit Sale

A customer may purchase on credit when the business allows it.

---

## BR-012 — Customer Receivable

Unpaid or partially unpaid amounts become customer receivables.

---

## BR-013 — Customer Payment

A customer payment reduces the outstanding customer receivable.

The payment itself remains a historical transaction.

---

## BR-014 — Partial Customer Payment

A customer may pay part of an outstanding amount if partial payments are allowed.

---

# 6. Supplier Purchases

## BR-015 — Cash Purchase

A supplier purchase may be fully paid immediately.

---

## BR-016 — Credit Purchase

A supplier purchase may be unpaid or partially paid.

The unpaid portion becomes supplier payable.

---

## BR-017 — Supplier Payment

A supplier payment reduces supplier payable.

The payment remains part of historical supplier transaction history.

---

# 7. Inventory

*Phase 2 rules below are implemented.*

## BR-018 — Inventory Is Transaction Driven

Inventory is changed only through business transactions.

Every change creates an append-only `StockMovement` record and an atomic, versioned update of the `InventoryState` cache. Stock is never edited as an isolated number.

Examples of movement types:

- PURCHASE (reserved for Phase 3+)
- SALE (reserved for Phase 4+)
- CUSTOMER_RETURN (reserved for later)
- SUPPLIER_RETURN (reserved for later)
- DAMAGE
- EXPIRY
- ADJUSTMENT
- STOCK_COUNT
- TRANSFER (reserved for later)

---

## BR-019 — Immutability of Stock Movements

Stock movement records are **never mutated or deleted**. Corrections are represented as new movements with their own signed delta and reason.

---

## BR-020 — Optimistic Concurrency

All `InventoryState` mutations use `findOneAndUpdate` with a version filter:

```text
findOneAndUpdate({ product, version }, { $inc, version: version+1 })
```

If the version no longer matches (concurrent writer), the update returns zero matched documents and the operation is rejected with a conflict error. This prevents silent overwrites during concurrent stock changes.

---

## BR-021 — Transaction Boundary

Multi-document inventory changes (state update + movement record + audit entry) run inside a single MongoDB transaction via `withTransaction`. This ensures that state, movement, and audit remain consistent.

---

## BR-022 — Damaged Product

Damaged products must not remain in sellable stock.

`recordDamage` decrements `onHand` and increments `nonSellable` by the given quantity. A `DAMAGE` movement is recorded. Damaged goods are tracked separately and are not sellable.

---

## BR-023 — Negative Stock Guard

The system must not allow `onHand` to become negative. After every stock mutation, if the resulting `onHand < 0`, the operation is rejected with a conflict error.

---

## BR-024 — Sale Reduces Inventory

A valid completed sale reduces stock according to the quantity sold.

*(Implemented in Phase 4+; movement type SALE is reserved.)*

---

## BR-025 — Purchase Receiving Increases Inventory

Accepted received quantities increase inventory.

*(Implemented in Phase 3+; movement type PURCHASE is reserved.)*

---

## BR-026 — Return Inventory

A customer return may increase inventory depending on the condition and business policy.

*(Reserved for later phases.)*

---

# 8. Expiry

*Phase 2 rules below are implemented.*

## BR-027 — Expiry Tracking

Products with `trackExpiry = true` are tracked by batches/lots. Each batch holds a quantity and an expiry date.

---

## BR-028 — Expired Inventory

Batches whose `expiryDate` is in the past do not contribute to sellable inventory. Expired batches are clearly distinguishable from sellable and expiring-soon batches.

Disposal: the `disposeExpired` operation records an `EXPIRY` write-off movement and zeroes the batch quantity. Only actually-expired batches (`expiryDate <= now`) may be disposed.

---

## BR-029 — FEFO

For expiry-tracked products, the system prioritizes **First Expired, First Out** by ordering batches by ascending expiry date. This is used when later phases allocate stock for sales or orders.

---

## BR-030 — Expiring Soon

A batch is flagged "expiring soon" when its expiry date is in the future but within `EXPIRING_SOON_DAYS` (30 days) of the current date. Already-expired batches are not reported as "expiring soon".

---

# 9. Stock Thresholds

*Phase 2 rules below are implemented.*

## BR-031 — Low Stock

A product is considered low stock when its sellable quantity is at or below the configured minimum:

```text
sellable <= minimumStock
```

---

## BR-032 — Out of Stock

A product is out of stock when it has no available sellable quantity:

```text
sellable <= 0
```

---

## BR-033 — Replenishment Suggestion

When a product's sellable quantity is below its minimum, the system suggests a replenishment quantity:

```text
suggested = max(0, minimumStock - sellable)
```

This is a simple, documented formula. Advanced velocity or forecasting is out of scope for Phase 2.

---

## BR-034 — Sellable Stock Definition

For the purpose of stock thresholds and replenishment:

- **Non-expiry products:** sellable = `InventoryState.onHand`
- **Expiry-tracked products:** sellable = sum of non-expired `ProductBatch` quantities (batches where `expiryDate > now` and `quantity > 0`)

---

## BR-035 — Stock Count Reconciliation

Physical stock count derives a delta from the difference between the counted quantity and the current sellable quantity. The delta is recorded as a `STOCK_COUNT` movement.

---

# 10. Cashier Shift

## BR-036 — Opening Shift

A cashier shift must begin with an opening cash amount.

Example:

```text
Opening Cash = 500 EGP
```

---

## BR-037 — Expected Closing Cash

Expected cash must be derived from recorded shift transactions.

---

## BR-038 — Actual Closing Cash

The actual physical cash count is entered during shift closing.

---

## BR-039 — Shift Variance

The system calculates:

```text
variance = actualCash - expectedCash
```

The variance must remain available for reporting and auditing.

---

# 11. Cash Movements

## BR-040 — Cash In

Authorized cash additions outside normal sales must be recorded explicitly.

---

## BR-041 — Cash Out

Authorized cash removals must be recorded explicitly.

---

## BR-042 — Cashier Expenses

Cash expenses should be treated as explicit cash movements rather than silently changing the shift balance.

---

# 12. Returns

## BR-043 — Return Reference

A return should reference the original sale when practical.

---

## BR-044 — Return Quantity

The returned quantity must not exceed the quantity originally sold minus already returned quantity.

---

## BR-045 — Refund

Refund amounts must be validated against the return and original financial transaction.

---

# 13. Supplier Receiving

## BR-046 — Received Quantity

Only accepted quantities should affect available inventory.

---

## BR-047 — Supplier Invoice

Supplier invoice information should remain associated with the purchase record.

---

# 14. Café Orders

## BR-048 — Order Creation

A café order receives a unique identifier.

---

## BR-049 — State Machine

Initial order lifecycle:

```text
NEW
↓
PREPARING
↓
READY
↓
COMPLETED
```

---

## BR-050 — Cancellation

An order may become:

```text
CANCELLED
```

only through an allowed transition.

---

## BR-051 — Invalid Transitions

The server must reject invalid order state transitions.

---

# 15. Café Real-Time

## BR-052 — Duplicate Events

Receiving the same event more than once must not create duplicate business operations.

---

## BR-053 — Reconnection

Temporary client disconnection must not corrupt order state.

The client should reconcile with server state after reconnection.

---

# 16. Online Store

## BR-054 — Shared Catalog

Online products should reference the same core product domain as internal sales.

---

## BR-055 — Online Availability

A product being visible online does not automatically guarantee unlimited availability.

Online availability must respect business inventory rules.

---

## BR-056 — Online Order

An online order is not automatically considered delivered after creation.

It must progress through explicit order states.

---

# 17. Delivery

## BR-057 — Delivery Lifecycle

Initial lifecycle:

```text
PENDING
↓
CONFIRMED
↓
PREPARING
↓
READY_FOR_DELIVERY
↓
OUT_FOR_DELIVERY
↓
DELIVERED
```

Cancellation must be explicitly recorded.

---

# 18. Reports

## BR-058 — Transaction-Based Reports

Reports must be generated from actual business transactions.

Do not maintain manually typed summary totals as the source of truth.

---

## BR-059 — Profit

Profit must not be represented as exact unless the necessary cost data exists.

Revenue is not automatically profit.

---

# 19. Permissions

## BR-060 — Server Authorization

A user cannot gain permission simply because a UI button is visible or hidden.

Authorization must be enforced server-side.

---

# 20. Audit

## BR-061 — Important Actions

Important financial, inventory, permission, and operational actions should be auditable.

---

# 21. Business Decisions Still Required

The following rules must be explicitly decided before implementation of the relevant features.

| Decision              | Possible Choices                          | Architectural Impact             | Phase 2 Status |
| --------------------- | ----------------------------------------- | -------------------------------- | -------------- |
| Negative stock        | Allowed / Not allowed                     | Inventory validation             | **Resolved:** Disallowed; `onHand` must not go negative (BR-023). |
| Customer credit limit | Unlimited / Fixed limit / Per-customer    | Customer model + sale validation | Pending |
| Credit approval       | Cashier / Manager / Rule-based            | Authorization                    | Pending |
| Returns               | Cashier / Manager / Restricted            | Permissions                      | Pending |
| Supplier returns      | Supported / Not supported                 | Inventory + payable logic        | Pending |
| Discounts             | None / Invoice / Item / Customer-specific | Pricing                          | Pending |
| VAT                   | Required / Not required                   | Financial calculations           | Pending |
| Shift expense         | Allowed / Separate workflow               | Cash reconciliation              | Pending |
| Multiple open shifts  | Allowed / Not allowed                     | Shift constraints                | Pending |
| Café ingredients      | Track / Do not track                      | Inventory model                  | Pending |
| Online payment        | Supported / Not supported                 | Order state                      | Pending |
| Cash on delivery      | Supported / Not supported                 | Delivery + payment               | Pending |
| Delivery fee          | Fixed / Distance / Area / Manual          | Order pricing                    | Pending |
| Expired products      | Block / Warning / Restricted              | Inventory + POS                  | **Resolved:** Expired batches excluded from sellable; dispose only of expired batches (BR-028). |
| Supplier credit limit | Required / Not required                   | Supplier validation              | Pending |
| Multi-branch          | MVP / Future                              | Organization/branch architecture | Pending |
| Tax invoices          | Required / Not required                   | Receipt/invoice model            | Pending |
