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

## BR-018 — Inventory Is Transaction Driven

Inventory is changed by business transactions.

Examples:

- receiving
- sale
- return
- damage
- expiry
- adjustment

---

## BR-019 — Sale Reduces Inventory

A valid completed sale reduces stock according to the quantity sold.

---

## BR-020 — Purchase Receiving Increases Inventory

Accepted received quantities increase inventory.

---

## BR-021 — Return Inventory

A customer return may increase inventory depending on the condition and business policy.

---

## BR-022 — Damaged Product

Damaged products must not automatically return to sellable stock.

---

# 8. Expiry

## BR-023 — Expiry Tracking

Products requiring expiry management may be tracked by batches/lots.

---

## BR-024 — Expired Inventory

Expired inventory must be clearly distinguishable from normal sellable inventory.

Exact disposal behavior requires a product decision.

---

## BR-025 — FEFO

Where appropriate, the system may prioritize:

First Expired, First Out.

---

# 9. Stock Thresholds

## BR-026 — Low Stock

A product may be considered low stock when:

```text
currentStock <= minimumStock
```

The exact threshold semantics can be configured.

---

## BR-027 — Out of Stock

A product is out of stock when it has no available sellable quantity.

---

# 10. Cashier Shift

## BR-028 — Opening Shift

A cashier shift must begin with an opening cash amount.

Example:

```text
Opening Cash = 500 EGP
```

---

## BR-029 — Expected Closing Cash

Expected cash must be derived from recorded shift transactions.

---

## BR-030 — Actual Closing Cash

The actual physical cash count is entered during shift closing.

---

## BR-031 — Shift Variance

The system calculates:

```text
variance = actualCash - expectedCash
```

The variance must remain available for reporting and auditing.

---

# 11. Cash Movements

## BR-032 — Cash In

Authorized cash additions outside normal sales must be recorded explicitly.

---

## BR-033 — Cash Out

Authorized cash removals must be recorded explicitly.

---

## BR-034 — Cashier Expenses

Cash expenses should be treated as explicit cash movements rather than silently changing the shift balance.

---

# 12. Returns

## BR-035 — Return Reference

A return should reference the original sale when practical.

---

## BR-036 — Return Quantity

The returned quantity must not exceed the quantity originally sold minus already returned quantity.

---

## BR-037 — Refund

Refund amounts must be validated against the return and original financial transaction.

---

# 13. Supplier Receiving

## BR-038 — Received Quantity

Only accepted quantities should affect available inventory.

---

## BR-039 — Supplier Invoice

Supplier invoice information should remain associated with the purchase record.

---

# 14. Café Orders

## BR-040 — Order Creation

A café order receives a unique identifier.

---

## BR-041 — State Machine

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

## BR-042 — Cancellation

An order may become:

```text
CANCELLED
```

only through an allowed transition.

---

## BR-043 — Invalid Transitions

The server must reject invalid order state transitions.

---

# 15. Café Real-Time

## BR-044 — Duplicate Events

Receiving the same event more than once must not create duplicate business operations.

---

## BR-045 — Reconnection

Temporary client disconnection must not corrupt order state.

The client should reconcile with server state after reconnection.

---

# 16. Online Store

## BR-046 — Shared Catalog

Online products should reference the same core product domain as internal sales.

---

## BR-047 — Online Availability

A product being visible online does not automatically guarantee unlimited availability.

Online availability must respect business inventory rules.

---

## BR-048 — Online Order

An online order is not automatically considered delivered after creation.

It must progress through explicit order states.

---

# 17. Delivery

## BR-049 — Delivery Lifecycle

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

## BR-050 — Transaction-Based Reports

Reports must be generated from actual business transactions.

Do not maintain manually typed summary totals as the source of truth.

---

## BR-051 — Profit

Profit must not be represented as exact unless the necessary cost data exists.

Revenue is not automatically profit.

---

# 19. Permissions

## BR-052 — Server Authorization

A user cannot gain permission simply because a UI button is visible or hidden.

Authorization must be enforced server-side.

---

# 20. Audit

## BR-053 — Important Actions

Important financial, inventory, permission, and operational actions should be auditable.

---

# 21. Business Decisions Still Required

The following rules must be explicitly decided before implementation of the relevant features.

| Decision              | Possible Choices                          | Architectural Impact             |
| --------------------- | ----------------------------------------- | -------------------------------- |
| Negative stock        | Allowed / Not allowed                     | Inventory validation             |
| Customer credit limit | Unlimited / Fixed limit / Per-customer    | Customer model + sale validation |
| Credit approval       | Cashier / Manager / Rule-based            | Authorization                    |
| Returns               | Cashier / Manager / Restricted            | Permissions                      |
| Supplier returns      | Supported / Not supported                 | Inventory + payable logic        |
| Discounts             | None / Invoice / Item / Customer-specific | Pricing                          |
| VAT                   | Required / Not required                   | Financial calculations           |
| Shift expense         | Allowed / Separate workflow               | Cash reconciliation              |
| Multiple open shifts  | Allowed / Not allowed                     | Shift constraints                |
| Café ingredients      | Track / Do not track                      | Inventory model                  |
| Online payment        | Supported / Not supported                 | Order state                      |
| Cash on delivery      | Supported / Not supported                 | Delivery + payment               |
| Delivery fee          | Fixed / Distance / Area / Manual          | Order pricing                    |
| Expired products      | Block / Warning / Restricted              | Inventory + POS                  |
| Supplier credit limit | Required / Not required                   | Supplier validation              |
| Multi-branch          | MVP / Future                              | Organization/branch architecture |
| Tax invoices          | Required / Not required                   | Receipt/invoice model            |
