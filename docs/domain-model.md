# Nexa Retail — Domain Model

## Purpose

This document defines the conceptual domain model.

It is not the final Mongoose schema.

Database schema design should be performed after reviewing these domain boundaries.

---

# 1. Identity Domain

## User

Represents a system user/employee.

Possible responsibilities:

- authentication identity
- role
- permissions
- employee information
- operational actions

Relationships:

- User → Role
- User → Shifts
- User → Sales
- User → Orders
- User → AuditLogs

---

# 2. Authorization Domain

## Role

Represents a business role.

Examples:

- Owner
- Manager
- Cashier
- Accountant
- Warehouse Employee
- Barista

## Permission

Represents an allowed capability.

Example concepts:

- sales.create
- sales.cancel
- inventory.adjust
- purchases.create
- suppliers.pay
- customers.credit
- reports.view

---

# 3. Catalog Domain

*Phase 2 — Implemented.*

## Category

Groups products for browsing, filtering, and reporting.

Implemented fields:

- `name` — unique, trimmed, indexed
- `active` — boolean (default `true`); deactivation preserves the record and keeps historical product references intact

## Brand

Optional product brand. Deactivated rather than deleted to preserve references.

Implemented fields:

- `name` — unique, trimmed, indexed
- `active` — boolean (default `true`)

## Product

Represents a catalog item that can be sold.

Implemented fields:

- `name` — required, trimmed, indexed
- `barcode` — optional; sparse-unique index (products without a barcode do not collide)
- `sku` — optional; sparse-unique index
- `category` — required reference to Category
- `brand` — optional reference to Brand
- `unit` — default `"قطعة"`
- `purchaseCost` — current catalog purchase cost; min 0 (historical purchases snapshot their own values — BR-006)
- `sellingPrice` — current catalog selling price; min 0
- `minimumStock` — integer low-stock threshold (default 0)
- `trackExpiry` — boolean; enables batch/expiry tracking (default `false`)
- `onlineVisible` — boolean; whether the product appears in the online store (default `false`)
- `description` — optional text
- `active` — boolean (default `true`); deactivated products are hidden from normal selection but historical documents continue referencing them (BR-004)

Compound indexes: `{ active: 1, name: 1 }` for operational listing.

Products are **deactivated, never physically deleted**, so that stock movements, future sales, and other historical documents retain their references (BR-004, BR-022, BR-024).

---

# 4. Inventory Domain

*Phase 2 — Implemented.*

Inventory is **transaction-driven**: stock is never an isolated editable number. Every change goes through an append-only `StockMovement` record plus an atomic, versioned update of the `InventoryState` cache. Multi-document changes run inside a MongoDB transaction.

## InventoryState

Denormalized current-state cache for a product's inventory. The authoritative history lives in the append-only `StockMovement` collection.

Implemented fields:

- `product` — unique reference to Product
- `onHand` — currently sellable quantity (min 0)
- `nonSellable` — quantity removed from sellable stock, e.g. damaged goods or expired stock awaiting disposal (min 0)
- `version` — integer optimistic-concurrency counter (default 1)

Concurrency: every mutation uses `findOneAndUpdate({ product, version }, { $inc: { onHand, nonSellable }, $set: { version: version + 1 } })` so concurrent writers cannot silently overwrite each other. If `matchedCount` is 0, the operation is rejected with a conflict error.

Initial state (`onHand: 0`, `nonSellable: 0`, `version: 1`) is created automatically when a product is created.

## StockMovement

Append-only, authoritative history of all inventory changes. Records are **never mutated or deleted**; corrections are represented by new movements.

Implemented fields:

- `product` — reference to Product (indexed)
- `type` — one of: `PURCHASE`, `SALE`, `CUSTOMER_RETURN`, `SUPPLIER_RETURN`, `DAMAGE`, `EXPIRY`, `ADJUSTMENT`, `STOCK_COUNT`, `TRANSFER`
- `quantity` — signed delta (positive in, negative out)
- `batch` — optional reference to ProductBatch
- `batchCode` — optional snapshot label of the batch for readability
- `reason` — business reason / note
- `referenceType`, `referenceId` — optional reference to a future origin document (purchase, sale, …)
- `actorId`, `actorUsername` — snapshot of the acting user

Only `ADJUSTMENT`, `STOCK_COUNT`, `DAMAGE`, and `EXPIRY` can originate in Phase 2. The remaining types (`PURCHASE`, `SALE`, `CUSTOMER_RETURN`, `SUPPLIER_RETURN`, `TRANSFER`) are reserved for later phases.

Indexes: `{ product, createdAt: -1 }` and `{ type, createdAt: -1 }`.

## ProductBatch

Batch/lot for expiry-tracked products. Only batches whose expiry date is in the future and quantity is positive contribute to sellable inventory (BR-024). FEFO selection orders batches by ascending expiry date (BR-025).

Implemented fields:

- `product` — reference to Product (indexed)
- `batchCode` — optional human-readable identifier
- `quantity` — remaining (un-consumed) quantity (min 0)
- `expiryDate` — required; batches past this date are not sellable
- `sourceReference` — optional `{ type, id }` reference to a future receiving document

Compound index: `{ product: 1, expiryDate: 1, quantity: 1 }` for FEFO queries.

### Sellable Stock Computation

- **Non-expiry products:** sellable = `InventoryState.onHand`
- **Expiry-tracked products:** sellable = sum of non-expired `ProductBatch` quantities (batches with `expiryDate > now` and `quantity > 0`)
- **Damaged stock** is tracked in `InventoryState.nonSellable` (recordDamage decrements `onHand` and increments `nonSellable`)

---

# 5. Sales Domain

## Sale

Represents a retail transaction.

Potential information:

- invoice number
- cashier
- shift
- customer
- items
- totals
- status
- payment state
- timestamps

## SaleItem

Represents one line in a sale.

Historical information may include:

- product reference
- quantity
- unit price
- discount
- total

Historical sale pricing must remain stable.

---

# 6. Payment Domain

## Payment

Represents money received.

Possible types:

- CASH
- VISA
- MASTERCARD
- INSTAPAY
- VODAFONE_CASH
- OTHER

Payment may be linked to:

- Sale
- CustomerPayment
- Shift

The exact financial model should be finalized before implementation.

---

# 7. Cashier Operations Domain

## CashierShift

Represents a cashier work session.

Potential information:

- cashier
- openedAt
- openingCash
- closedAt
- expectedCash
- actualCash
- variance
- status

Potential states:

- OPEN
- CLOSED
- REVIEW_REQUIRED

---

# 8. Cash Movement Domain

## CashMovement

Represents explicit movement of physical cash.

Possible types:

- CASH_IN
- CASH_OUT
- EXPENSE
- ADJUSTMENT

Cash movements may be associated with a cashier shift.

---

# 9. Customer Domain

## Customer

Represents a customer.

Possible information:

- name
- phone
- notes
- credit configuration

## CustomerPayment

Represents money received from a customer.

Possible relationships:

- customer
- payment
- related invoices where applicable

---

# 10. Supplier Domain

## Supplier

Represents a supplier/vendor.

Possible information:

- name
- contact data
- notes
- payment terms
- credit information

## SupplierPayment

Represents money paid to a supplier.

## SupplierAccountTransaction

Conceptually represents supplier financial activity.

Possible transaction sources:

- purchase
- payment
- return
- adjustment

The final persistence design should be determined during database analysis.

---

# 11. Purchasing Domain

## Purchase

Represents goods purchased from a supplier.

Potential information:

- supplier
- invoice number
- items
- totals
- received quantities
- payment status
- date

## PurchaseItem

Represents a product received through a purchase.

Potential information:

- product
- quantity
- cost
- batch
- expiry
- accepted quantity
- rejected quantity

---

# 12. Customer Accounting Domain

## CustomerAccountTransaction

Conceptually represents customer financial activity.

Possible sources:

- credit sale
- customer payment
- return
- adjustment

The exact persistence strategy must be decided during architecture design.

---

# 13. Expense Domain

## Expense

Represents a business expense.

Potential information:

- category
- amount
- payment method
- date
- notes
- employee
- shift where relevant

---

# 14. Café Domain

## CafeOrder

Represents a café order.

Potential information:

- order number
- cashier
- customer where relevant
- items
- status
- timestamps

## CafeOrderItem

Represents an item inside a café order.

Possible information:

- product/menu item
- quantity
- notes
- modifiers
- price

---

# 15. Café Workflow Domain

The order lifecycle is a state machine.

Initial conceptual states:

```text
NEW
PREPARING
READY
COMPLETED
CANCELLED
```

The exact transition rules belong to business rules.

---

# 16. Online Commerce Domain

## OnlineOrder

Represents an order created by an online customer.

Potential information:

- customer
- items
- address
- totals
- delivery fee
- payment
- order state

## Cart

Represents a customer's temporary shopping state.

The final persistence model depends on authentication and guest-cart requirements.

---

# 17. Delivery Domain

## DeliveryOrder

Represents delivery information associated with an online order.

Potential information:

- order
- address
- delivery fee
- assigned employee
- status
- timestamps

---

# 18. Reporting Domain

Reports are derived views over business transactions.

Examples:

- sales report
- purchase report
- expense report
- inventory report
- supplier balance report
- customer balance report
- cashier report
- profit analysis

Reports should not become the primary source of truth.

---

# 19. Printing Domain

## Receipt

Conceptually represents a printable representation of a stored business transaction.

Examples:

- sales receipt
- customer payment receipt
- supplier payment receipt
- shift closing report

The receipt should derive from persisted transaction data.

---

# 20. Audit Domain

## AuditLog

Represents an auditable system action.

Potential information:

- actor
- action
- entity
- entity identifier
- timestamp
- previous state where appropriate
- new state where appropriate
- metadata

---

# 21. Domain Relationships

Conceptually:

```text
User
 ├── Role
 ├── CashierShift
 ├── Sales
 ├── Purchases
 ├── CafeOrders
 └── AuditLogs

Product
 ├── Category
 ├── Brand
 ├── Stock
 ├── StockMovements
 ├── ProductBatches
 ├── SaleItems
 ├── PurchaseItems
 └── OnlineOrderItems

Customer
 ├── Sales
 ├── CustomerPayments
 └── AccountTransactions

Supplier
 ├── Purchases
 ├── SupplierPayments
 └── AccountTransactions

CashierShift
 ├── Sales
 ├── CashMovements
 └── ClosingReconciliation

CafeOrder
 ├── CafeOrderItems
 └── StatusTransitions

OnlineOrder
 ├── OnlineOrderItems
 ├── Payment
 └── DeliveryOrder
```

---

# 22. Important Architectural Principle

Do not assume that every conceptual entity requires one MongoDB collection.

MongoDB persistence must be designed based on:

- access patterns
- consistency requirements
- transaction boundaries
- document size
- reporting requirements
- historical integrity
- query patterns

---

# 23. Open Domain Decisions

Before final schema design, investigate:

- stock reservation for online orders
- café ingredient inventory
- shared inventory between café and retail
- customer credit limit
- supplier credit limit
- tax model
- discount model
- branch model
- delivery employee model
- guest checkout
- online payment model
- refund model
- receipt/invoice numbering
