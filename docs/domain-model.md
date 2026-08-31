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

## Product

Represents a product that can be sold.

Possible concepts:

- name
- barcode
- SKU
- category
- brand
- unit
- cost
- price
- minimum stock
- online visibility
- expiry tracking

## Category

Groups products.

## Brand

Represents a product brand where applicable.

---

# 4. Inventory Domain

## Inventory State

Represents the current availability of a product.

The exact persistence strategy must be decided during database design.

## StockMovement

Represents a change in inventory.

Possible types:

- PURCHASE
- SALE
- CUSTOMER_RETURN
- SUPPLIER_RETURN
- DAMAGE
- EXPIRY
- ADJUSTMENT
- STOCK_COUNT
- TRANSFER

## ProductBatch

Represents a batch/lot when expiry tracking is required.

Possible information:

- product
- batch identifier
- quantity
- production date
- expiry date
- supplier/purchase reference

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
