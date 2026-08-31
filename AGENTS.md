# AGENTS.md

## Project

This project is a production-oriented full-stack Retail & Café Management Platform.

Working name: Nexa Retail.

The platform manages:

- Retail sales / POS
- Cashier shifts
- Multiple payment methods
- Customer credit / receivables
- Suppliers / payables
- Purchases and receiving
- Inventory
- Expiry tracking
- Stock movements
- Daily / monthly / yearly reporting
- Employee roles and permissions
- Café orders
- Barista workflow / Kitchen Display System
- Thermal receipt printing
- Online store
- Customer orders
- Delivery workflow

---

## Core Goal

Build a real business application, not a demo dashboard.

Every feature must be designed around a real-world business workflow.

Do not implement isolated CRUD screens without understanding the business process behind them.

Before implementing a feature:

1. Understand its business purpose.
2. Check existing requirements and business rules.
3. Check the domain model.
4. Reuse existing abstractions.
5. Consider side effects on inventory, accounting, sales, reports, and permissions.
6. Validate inputs.
7. Handle loading, empty, success, error, and permission states.
8. Keep the UI simple for non-technical employees.

---

## Technology

Primary stack:

- Next.js App Router
- TypeScript
- React
- MongoDB
- Mongoose
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- Zustand
- TanStack Table
- Recharts
- date-fns
- sonner

Use Next.js Server Components by default.

Use Client Components only when interactivity or browser APIs require them.

Prefer Server Actions for mutations where appropriate.

Use Route Handlers for APIs/integrations that need HTTP endpoints.

---

## Architecture Rules

Prefer clear separation between:

- UI
- application logic
- domain/business logic
- data access
- database models

Do not put complex business logic directly inside React components.

Do not put business rules directly inside route handlers when they belong in a service/domain layer.

Prefer:

UI
→ Server Action / Route Handler
→ Service
→ Repository/Data Access
→ Mongoose Model

For reusable domain logic, create focused services.

Avoid giant files and giant functions.

Avoid circular dependencies.

Do not introduce a new abstraction unless it solves a real repeated problem.

---

## Database Rules

MongoDB is the primary database.

Mongoose is the ODM.

Every model must have a clear purpose.

Use indexes intentionally for:

- barcode
- SKU
- order number
- invoice number
- customer identifiers where appropriate
- supplier identifiers where appropriate
- dates used frequently in reports
- foreign/reference identifiers used in filtering

Do not store derived financial values blindly when they can become inconsistent.

For transactional/financial records, preserve historical data.

Never mutate historical invoices in a way that destroys the original financial state.

Prefer immutable transaction records plus adjustments/returns.

---

## Financial Rules

Sales, purchases, payments, refunds, customer debts, supplier balances, and expenses are financial transactions.

Do not calculate balances from UI state.

The server is the source of truth.

Every financial mutation must be validated server-side.

Payments must support multiple methods when required.

Supported payment methods may include:

- Cash
- Visa
- Mastercard
- InstaPay
- Vodafone Cash
- Other configured methods

A sale may contain multiple payment entries.

Example:

Total = 700 EGP

Cash = 300
Visa = 250
Vodafone Cash = 150

The payment total must equal the invoice total unless the transaction is explicitly a credit sale or has another valid business state.

---

## Cashier Shift Rules

A cashier may open a shift with an opening cash amount.

Example:

Opening cash = 500 EGP

During the shift the system tracks:

- cash sales
- non-cash payments
- refunds
- cash adjustments
- expenses if permitted
- cash received
- cash removed

At shift closing:

Expected cash must be calculated by the server.

Actual cash is entered/count-confirmed by the cashier or authorized employee.

The system calculates the difference.

Positive and negative variances must be preserved.

---

## Inventory Rules

Inventory is transaction-driven.

Do not treat stock quantity as an isolated editable number.

Inventory changes should be represented through stock movements.

Examples:

- Purchase
- Sale
- Return
- Damage
- Adjustment
- Expiry
- Transfer
- Manual correction

Stock changes must be auditable.

Products may have batches/lots when expiry tracking is required.

Expiry-aware inventory should support alerts for products approaching expiration.

Use FEFO when business rules require it.

---

## Supplier Rules

Suppliers may sell using:

- Cash
- Credit

The system must track:

- purchases
- supplier payments
- returns
- outstanding balance
- transaction history

Never overwrite previous balances.

Balances must be derivable from recorded transactions.

---

## Customer Credit Rules

Customers may purchase using credit.

The system must track:

- credit sales
- partial payments
- full payments
- outstanding balance
- payment history

A customer can owe money across multiple invoices.

Customer balances must be calculated server-side.

---

## Café / Barista Rules

The café has a separate operational workflow.

Cashier creates an order.

Barista receives the order.

Order states may include:

- NEW
- PREPARING
- READY
- COMPLETED
- CANCELLED

Barista UI must prioritize speed, readability, and minimal interaction.

Do not overload the barista interface with accounting details.

---

## Online Store Rules

The online store uses the same product/catalog domain as the internal system.

Do not duplicate product data unnecessarily.

Online products may expose:

- name
- description
- images
- selling price
- availability
- category

Online order flow:

Cart
→ Checkout
→ Address
→ Payment
→ Order
→ Preparing
→ Out for Delivery
→ Delivered

Order statuses must be explicit and auditable.

---

## Printing

Thermal receipt printing is a first-class feature.

Design receipts for:

- 58mm thermal printers
- 80mm thermal printers

Receipt layouts must be optimized for narrow paper.

Avoid UI-only formatting that fails when printed.

All printable documents must have dedicated print styles.

---

## UI/UX Rules

UI/UX quality is a primary project requirement.

This application will be used by people with limited computer experience.

Therefore:

- prioritize clarity over visual complexity
- use familiar terminology
- minimize unnecessary steps
- provide obvious primary actions
- use strong visual hierarchy
- make destructive actions explicit
- use readable typography
- provide clear validation messages
- provide loading states
- provide empty states
- provide error states
- provide success feedback
- preserve user context after actions

Do not use generic AI dashboard patterns.

Avoid excessive:

- gradients
- glassmorphism
- giant rounded cards
- decorative blobs
- unnecessary animations
- excessive shadows
- oversized headings
- decorative icons with no semantic value

Do not make every element rounded.

Do not add animation unless it improves usability.

---

## UI/UX Pro Max

For UI work, use the installed ui-ux-pro-max skill.

Before designing a significant screen:

1. Search the skill for relevant style, layout, typography, color, and UX guidance.
2. Establish a visual direction before implementation.
3. Keep the visual language consistent across the application.
4. Consider the actual user role of the screen.
5. Review responsive behavior.
6. Review accessibility and interaction states.
7. Visually inspect the implemented result before considering the screen complete.

The visual system must feel intentionally designed rather than AI-generated.

---

## Responsive Design

The application must work on:

- desktop
- laptop
- tablet where appropriate
- mobile for customer-facing online store

Internal POS screens should prioritize desktop/tablet usability.

Online shopping must be mobile-first.

Do not simply shrink desktop layouts onto mobile.

---

## Accessibility

Target WCAG AA quality.

Keyboard navigation must work for important actions.

Interactive controls must have accessible labels.

Focus states must be visible.

Color must not be the only mechanism communicating state.

Touch targets must be usable.

---

## Forms

Use React Hook Form for complex forms.

Use Zod for validation.

Validation rules must also run server-side.

Do not trust client-side validation alone.

Forms should provide field-level feedback.

---

## State Management

Use Zustand for client-side state that genuinely needs shared client persistence.

Do not move all server data into Zustand.

Server state should remain on the server whenever possible.

Avoid unnecessary global state.

---

## Components

Prefer reusable domain-oriented components.

Examples:

- ProductSearch
- ProductTable
- InventoryStatusBadge
- PaymentMethodSelector
- ShiftSummary
- InvoicePreview
- ReceiptPreview
- OrderStatusBoard
- BaristaOrderCard
- SupplierBalanceCard
- CustomerCreditSummary

Do not create generic abstractions that hide domain meaning.

---

## Error Handling

Never silently fail.

User-facing errors must be understandable.

Developer logs must contain enough technical context to debug the issue.

Never expose sensitive internal errors to users.

---

## Security

Never trust client-provided:

- prices
- stock quantities
- user roles
- permissions
- totals
- payment amounts
- customer balances
- supplier balances

All sensitive calculations and authorization checks must happen server-side.

---

## Implementation Discipline

Do not implement multiple unrelated features in one step.

Prefer small vertical slices.

Each completed feature should include:

- UI
- validation
- business logic
- database interaction
- loading state
- error state
- success state
- permission checks
- tests where appropriate

Do not rewrite working architecture without a concrete reason.

Do not install dependencies unless they solve a clear project requirement.

Before finishing a task:

- run type checking
- run linting
- run relevant tests
- verify the application builds
- inspect affected UI when possible

---

## Coding Style

Use TypeScript strictly.

Avoid `any`.

Prefer explicit types for domain models and service inputs/outputs.

Use clear naming.

Keep functions focused.

Prefer early returns where they improve clarity.

Avoid deeply nested conditional logic.

---

## Working Rule For The Agent

When requirements are ambiguous, do not invent business rules silently.

Look at:

- docs/requirements.md
- docs/business-rules.md
- docs/workflows.md
- docs/domain-model.md

If the required decision is not defined, choose the safest implementation that preserves data and makes the rule configurable where appropriate.

Always optimize for correctness first, then maintainability, then visual polish.

## Localization & Arabic UX

The primary application language is Arabic.

Default locale:

- `ar-EG`

Default text direction:

- RTL

Arabic is the primary user-facing language for:

- Internal dashboard
- POS
- Cashier screens
- Inventory
- Accounting
- Supplier management
- Customer management
- Café / Barista interfaces
- Reports
- Online store
- Notifications
- Validation messages
- Errors
- Success messages
- Receipts
- Printable documents

Do not build the application in English and translate it later.

Design RTL from the beginning.

Keep the source code, variable names, function names, database fields, API contracts, and technical identifiers in English.

Example:

```ts
customerBalance;
supplierBalance;
openingCash;
paymentMethod;
```

User-facing text should be Arabic.

Use professional, clear Modern Standard Arabic appropriate for a business application.

Do not use slang or dialect in the product UI unless a specific UX decision explicitly requires it.

---

## Arabic UI Rules

Use RTL-aware layouts.

Do not manually mirror layouts using arbitrary CSS hacks.

Use logical CSS properties where possible:

- `ms-*`
- `me-*`
- `ps-*`
- `pe-*`
- `start-*`
- `end-*`

Avoid unnecessary hardcoded `left` and `right` positioning.

Icons must remain semantically correct in RTL.

Directional icons such as:

- back
- forward
- arrows
- navigation indicators

must visually match the RTL direction.

---

## Arabic Typography

Choose Arabic fonts deliberately.

Do not rely on browser defaults.

Typography must prioritize:

- readability
- clear Arabic letterforms
- appropriate line height
- strong hierarchy
- fast scanning

The font must work well on:

- desktop POS
- tablet
- mobile online store
- printed documents where applicable

---

## Numbers, Dates, and Currency

The primary currency is Egyptian Pound (EGP).

The UI must format:

- currency
- dates
- times
- quantities
- percentages

consistently.

Use locale-aware formatting where appropriate.

Do not hardcode number formatting inside individual components.

---

## Localization Architecture

User-facing strings must not be scattered throughout components without structure.

Prepare the application for future multilingual support even though Arabic is currently the default language.

Do not duplicate business logic just because the UI language changes.

Localization must affect presentation only, not domain logic.

---

## Arabic Forms and Validation

Validation messages must be understandable in Arabic.

Examples:

- "هذا الحقل مطلوب"
- "أدخل قيمة صحيحة"
- "الكمية يجب أن تكون أكبر من صفر"
- "لا يوجد مخزون كافٍ لهذا المنتج"

Do not expose raw technical errors to users.

---

## RTL Testing

Every major screen must be reviewed specifically for RTL behavior.

Verify:

- navigation
- tables
- forms
- dialogs
- dropdowns
- charts
- POS layout
- payment screens
- order cards
- printable receipts
- mobile layouts

Do not assume that an LTR component automatically becomes good RTL UX.
