# Nexa Retail — Business Workflows

## 1. Cashier Shift Workflow

```text
Login
↓
Open Shift
↓
Enter Opening Cash
↓
Validate
↓
Shift ACTIVE
↓
Process Sales
↓
Record Payments
↓
Record Approved Cash Movements
↓
Close Shift
↓
Calculate Expected Cash
↓
Enter Actual Cash
↓
Calculate Variance
↓
Finalize Shift
```

---

# 2. Retail Sale Workflow

```text
Cashier
↓
Open POS
↓
Scan/Search Product
↓
Add Item
↓
Set Quantity
↓
Review Cart
↓
Optional Customer Selection
↓
Choose Payment Method(s)
↓
Submit Sale
↓
Server Validation
↓
Create Sale
↓
Create Payment Records
↓
Create Inventory Movements
↓
Finalize Transaction
↓
Print Receipt
```

### Scan/Search Product — input methods

Both methods funnel through one common barcode handler
(`handleBarcodeDetected` → `lookupBarcodeAction` → server lookup → `addToCart`):

- **Barcode via USB/keyboard scanner** — the scanner types the code and sends Enter;
  the search field catches it and adds the matching product. Falls back to name/SKU
  search when the typed value is not a recognized barcode.
- **Barcode via camera** — cashier clicks `مسح بالكاميرا` (only while a shift is OPEN),
  the dialog requests camera permission on first use, decodes the barcode locally in
  the browser, then the same handler looks up and adds the product.
  Outcomes: `found` (added), `inactive` (deactivated product, not sellable),
  `notfound` (no match), `error` (camera unavailable/denied).

---

# 3. Mixed Payment Workflow

Example:

```text
Invoice Total = 600

Cash = 300
Visa = 200
Vodafone Cash = 100
```

Flow:

```text
Create Cart
↓
Calculate Total
↓
Open Payment Interface
↓
Add Cash Payment
↓
Add Card Payment
↓
Add Wallet Payment
↓
Validate Payment Sum
↓
Complete Sale
```

---

# 4. Credit Sale Workflow

```text
Create Sale
↓
Select Customer
↓
Check Credit Permission
↓
Check Customer Credit Rules
↓
Choose:
    Full Credit
    OR
    Partial Payment
↓
Create Sale
↓
Create Payment if applicable
↓
Create Customer Receivable
↓
Update Inventory
↓
Print Receipt
```

---

# 5. Customer Payment Workflow

```text
Find Customer
↓
View Outstanding Balance
↓
Select Invoice(s) or Account Balance
↓
Enter Payment
↓
Select Payment Method
↓
Validate Amount
↓
Create Customer Payment
↓
Update Receivable State
↓
Optional Receipt
```

---

# 6. Supplier Visit Workflow

```text
Supplier Arrives
↓
Find Supplier
↓
View Previous Balance
↓
Create Receiving Session
↓
Enter Supplier Invoice
↓
Add Products
↓
Enter Quantities
↓
Check Expiry / Batch Where Applicable
↓
Review Received Quantities
↓
Confirm Receiving
↓
Create Purchase
↓
Create Stock Movements
↓
Create/Update Supplier Payable
↓
Record Immediate Payment if applicable
```

---

# 7. Supplier Payment Workflow

```text
Find Supplier
↓
View Outstanding Balance
↓
Enter Payment
↓
Choose Payment Method
↓
Validate
↓
Create Supplier Payment
↓
Update Payable State
↓
Optional Print
```

---

# 8. Inventory Review Workflow

```text
Open Inventory
↓
View Current Stock
↓
Filter:
    Low Stock
    Out of Stock
    Expiring Soon
    Expired
↓
Inspect Product
↓
Review Stock History
↓
Take Action
```

---

# 9. Replenishment Workflow

```text
Inventory Analysis
↓
Check Current Stock
↓
Check Minimum Stock
↓
Check Recent Sales
↓
Identify Low Stock Products
↓
Generate Suggestions
↓
Employee Reviews Suggestions
↓
Select Products
↓
Create Purchase Request / Order
```

---

# 10. Product Expiry Workflow

```text
Inventory
↓
Identify Expiring Batches
↓
Display Warning
↓
Employee Reviews
↓
Take Action
    Sell / Return / Dispose / Hold
↓
Record Result
```

---

# 11. Customer Return Workflow

```text
Find Original Sale
↓
Select Item(s)
↓
Validate Returned Quantity
↓
Choose Return Reason
↓
Check Permission
↓
Approve Return
↓
Create Return Transaction
↓
Create Inventory Effect
↓
Calculate Refund
↓
Record Refund
↓
Print Return Receipt if required
```

---

# 12. Shift Closing Workflow

```text
Active Shift
↓
Stop New Transactions
↓
Calculate Expected Cash
↓
Cashier Counts Physical Cash
↓
Enter Actual Cash
↓
Calculate Variance
↓
Enter Explanation if Required
↓
Manager Review if Required
↓
Close Shift
```

---

# 13. Café Order Workflow

```text
Cashier
↓
Create Café Order
↓
Add Items
↓
Confirm Order
↓
Create Order
↓
Publish Order Event
↓
Barista Screen
↓
NEW
↓
PREPARING
↓
READY
↓
COMPLETED
```

---

# 14. Café Cancellation Workflow

```text
Order
↓
Request Cancellation
↓
Check Current Status
↓
Check Permission
↓
Cancel
↓
Preserve Historical Record
↓
Apply Financial/Inventory Effects if Required
```

---

# 15. Online Order Workflow

```text
Customer
↓
Browse Products
↓
View Product
↓
Add to Cart
↓
Review Cart
↓
Checkout
↓
Enter Address
↓
Choose Delivery
↓
Choose Payment
↓
Submit Order
↓
Validate Server-Side
↓
Create Online Order
↓
Staff Confirmation
↓
PREPARING
↓
READY_FOR_DELIVERY
↓
OUT_FOR_DELIVERY
↓
DELIVERED
```

---

# 16. Online Order Cancellation

```text
Customer/Staff
↓
Request Cancellation
↓
Check Order State
↓
Check Cancellation Rules
↓
Cancel
↓
Reverse Applicable Effects
↓
Refund if Applicable
↓
Preserve Audit Record
```

---

# 17. Daily Reporting Workflow

```text
Select Date
↓
Load Relevant Transactions
↓
Aggregate:
    Sales
    Payments
    Returns
    Expenses
    Purchases
    Customer Payments
    Supplier Payments
↓
Generate Daily Report
```

---

# 18. Monthly Reporting Workflow

```text
Select Month
↓
Aggregate Historical Transactions
↓
Sales
↓
Purchases
↓
Expenses
↓
Receivables
↓
Payables
↓
Inventory Metrics
↓
Profit Analysis
↓
Generate Monthly Report
```

---

# 19. Yearly Reporting Workflow

```text
Select Year
↓
Aggregate Monthly Data
↓
Compare Periods
↓
Sales Analysis
↓
Expense Analysis
↓
Profit Analysis
↓
Customer/Supplier Balances
↓
Inventory Analysis
```

---

# 20. Audit Workflow

Important operation:

```text
User Action
↓
Authorization Check
↓
Business Validation
↓
Execute Operation
↓
Persist Business Transaction
↓
Create Audit Entry where required
```

Audit logging must not replace the actual business transaction.

---

# 21. Realtime Reconciliation Workflow

For café operations:

```text
Client Connected
↓
Subscribe to Relevant Events
↓
Receive Event
↓
Validate Event Identity
↓
Update UI
↓
Acknowledge / Reconcile
```

After reconnect:

```text
Reconnect
↓
Fetch Current Server State
↓
Compare Local UI State
↓
Reconcile
```

The server remains authoritative.

---

# 22. Expense Workflow (Phase 6)

Record an operating expense:

``text
Authorized User
?
Select Expense Category (or create one)
?
Enter Amount, Payment Method, Date, Notes
?
[Optional] Link to the User's OPEN Shift (for cash reconciliation)
?
Server Validates (zod) + Authorization (expenses.create)
?
Generate EXP-YYYYMMDD-NNNN (sequence)
?
Persist Expense Transaction
?
If Cash + OPEN Shift ? record EXPENSE Cash Movement (same transaction)
?
Revalidate /expenses, /accounting, /shifts
``

Rules:

- Amount is entered by the user but validated server-side; references (category, shift) are resolved and authorized on the server (BR-062).
- Duplicate submission is blocked by the unique idempotency key (BR-009 pattern).
- A cash expense linked to an OPEN shift decreases that shift's expected cash (BR-063).
- A closed shift is never mutated.

---

# 23. Accounting Overview Workflow (Phase 6)

``text
Authorized User (accounting.read)
?
Choose Optional Date Range
?
Server Aggregates Real Transactions (no second ledger)
?
Sales (total/collected/count) + Payment-Method Breakdown
?
Purchases (total + cash paid) + Expenses (total + cash) + COGS
?
Gross & Net Profit (preliminary)
?
Receivables (customer ledger) + Payables (supplier ledger)
?
Physical Cash Flow: In vs Out
``

Period figures honor the chosen range; receivables/payables are current outstanding balances. Cash flow strictly separates physical cash from card/wallet/Instapay (BR-065).
