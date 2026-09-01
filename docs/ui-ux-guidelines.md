# Nexa Retail — UI/UX Guidelines

# 1. Product Design Objective

Nexa Retail is an operational business application.

Its primary users are employees who may have limited technical or computer experience.

The interface must therefore prioritize:

1. clarity
2. speed
3. confidence
4. discoverability
5. consistency
6. error prevention
7. readability

Visual beauty is important, but it must never reduce operational efficiency.

---

# 2. Arabic First

Primary locale:

```text
ar-EG
```

Primary direction:

```text
RTL
```

Arabic is not a translation layer added after development.

All layouts must be designed RTL from the beginning.

---

# 3. Arabic Language

Use professional Modern Standard Arabic.

Avoid:

- technical English in user-facing labels
- unnecessary slang
- ambiguous terminology
- excessively verbose labels

Example:

Good:

```text
إتمام البيع
إلغاء العملية
الرصيد المستحق
المخزون منخفض
إضافة دفعة
فتح وردية
إغلاق الوردية
```

Avoid:

```text
Submit
Cancel
Balance
Checkout
```

unless explicitly needed.

---

# 4. Information Architecture

Navigation should be organized by user goals and business domains rather than database entities alone.

Suggested high-level structure:

```text
الرئيسية

المبيعات
├── نقطة البيع
├── الفواتير
└── الورديات

المخزون
├── المنتجات
├── المخزون
├── الحركات
├── المنتهي الصلاحية
└── التوريد المقترح

المشتريات
├── المشتريات
├── الاستلام
└── الموردون

العملاء
├── العملاء
├── المبيعات الآجلة
└── التحصيل

الحسابات
├── الموردون
├── المدفوعات
├── المصروفات
└── التقارير

الكافيه
├── الطلبات
└── شاشة الباريستا

المتجر الإلكتروني
├── الطلبات
└── الإعدادات

التقارير
```

This is a starting information architecture, not a final navigation design.

---

# 5. Role-Based UX

Different roles should not see unnecessary navigation.

## Cashier

Priorities:

1. نقطة البيع
2. الفواتير
3. الوردية
4. العملاء
5. الطلبات

## Warehouse Employee

Priorities:

1. المخزون
2. الاستلام
3. المنتجات
4. المنتهي الصلاحية
5. التوريد المقترح

## Accountant

Priorities:

1. الحسابات
2. العملاء
3. الموردون
4. المدفوعات
5. التقارير

## Barista

The barista should primarily see:

```text
الطلبات الجديدة
قيد التحضير
جاهز
```

Avoid exposing irrelevant accounting functionality.

---

# 6. POS UX

The POS is one of the most important screens.

The main objective is speed and accuracy.

The cashier must be able to:

```text
Search
↓
Add
↓
Adjust quantity
↓
Review
↓
Pay
↓
Complete
↓
Print
```

with minimal unnecessary interaction.

### Camera barcode scanner UX

The camera scanner is an optional assist to the primary keyboard/USB barcode path:

- A clear primary button `مسح بالكاميرا` sits beside the search field and opens a
  focused dialog; it is disabled when no shift is OPEN (an OPEN shift is required to sell).
- The dialog keeps the UI minimal: a live camera preview, a clear status line, and a
  close button. No decorative animations.
- Camera permission is requested only when scanning starts. Prefer the rear/environment
  camera on mobile, fall back to any available camera; a camera selector appears only
  when multiple cameras exist.
- Status messages are Arabic and actionable, e.g. "وجّه الكاميرا نحو الباركود",
  "جاري البحث عن المنتج...", "تمت إضافة المنتج", "لم يتم العثور على منتج بهذا الباركود.",
  "هذا المنتج غير نشط ولا يمكن بيعه.", "لا يمكن الوصول إلى الكاميرا.",
  "المسح بالكاميرا غير متاح على هذا الجهاز."
- Decoding is local in the browser; camera frames are never uploaded or stored.
- The camera stops and its stream is released when the dialog closes or the screen unmounts.

---

# 7. POS Layout

Potential conceptual structure:

```text
┌───────────────────────────────────────────────┐
│ المعلومات الأساسية / الوردية / المستخدم       │
├──────────────────────────┬────────────────────┤
│                          │                    │
│    المنتجات / البحث      │     السلة          │
│                          │                    │
│    Barcode / Search      │     العناصر         │
│                          │                    │
│                          │     الإجمالي        │
├──────────────────────────┴────────────────────┤
│ البحث / الاختصارات / الإجراءات الأساسية        │
└───────────────────────────────────────────────┘
```

The exact layout must be determined through UX design and usability testing.

---

# 8. Payment UX

Payment selection must make the payment state obvious.

Possible methods:

- نقدي
- فيزا
- ماستركارد
- إنستا باي
- فودافون كاش
- طرق دفع أخرى مفعّلة

Mixed payments must be easy to understand.

Example:

```text
إجمالي الفاتورة
600 جنيه

نقدي
300 جنيه

فيزا
200 جنيه

فودافون كاش
100 جنيه

المتبقي
0 جنيه
```

The UI should prevent accidental mismatch.

---

# 9. Cashier Shift UX

At shift opening:

```text
فتح وردية

المبلغ الافتتاحي
[ 500 ]

[ بدء الوردية ]
```

At closing:

```text
إغلاق الوردية

المبلغ المتوقع
4,850 جنيه

المبلغ الفعلي
[ 4,800 ]

الفرق
-50 جنيه
```

Variance must be visually obvious but not alarmist.

---

# 10. Inventory UX

Inventory should expose operational problems immediately.

Use clear states:

- متوفر
- مخزون منخفض
- نفد المخزون
- يوشك على الانتهاء
- منتهي الصلاحية

Users should be able to filter these states quickly.

---

# 11. Replenishment UX

The system should not simply say:

> "There are low-stock products."

It should help the employee answer:

> "What should I ask the supplier to bring?"

Example:

```text
المنتج       المتاح    الحد الأدنى    المقترح
------------------------------------------------
بيبسي          8           30           22
لبن            3           15           12
عصير           0           20           20
```

The employee should review recommendations before confirming them.

---

# 12. Supplier UX

Supplier page should clearly show:

```text
المورد
الشركة

الرصيد المستحق
10,000 جنيه

آخر المشتريات
آخر المدفوعات
الفواتير
الحركات المالية
```

Do not hide the balance inside a secondary screen.

---

# 13. Customer Credit UX

Customer page should clearly show:

```text
اسم العميل

الرصيد المستحق
800 جنيه

الفواتير
المدفوعات
الحركات
```

Payment workflows should make remaining balance obvious.

---

# 14. Café / Barista UX

The barista interface must be significantly simpler than the management dashboard.

Large readable cards.

Example:

```text
الطلب #120

2 × لاتيه
1 × إسبريسو
1 × آيس كوفي

[ بدء التحضير ]
```

When preparing:

```text
[ جاهز ]
```

The status must be visually obvious.

---

# 15. Order Board

Potential columns:

```text
جديد
│
├── Order #120
├── Order #121
│

قيد التحضير
│
├── Order #118
│

جاهز
│
├── Order #115
```

Avoid excessive information inside each card.

---

# 16. Dashboard UX

The dashboard should answer operational questions.

Examples:

- ماذا حدث اليوم؟
- كم بلغت المبيعات؟
- هل يوجد نقص في المخزون؟
- هل يوجد منتجات ستنتهي قريبًا؟
- من عليه أموال؟
- لمن علينا أموال؟
- ما الذي يحتاج تدخلًا الآن؟

Avoid decorative charts without business value.

---

# 17. Reports UX

Reports should prioritize:

- date range
- filters
- clear totals
- comparisons
- export/print when useful

Do not force users to interpret complicated charts when a simple table is more useful.

---

# 18. Tables

Tables are core operational components.

Useful features:

- search
- sorting
- filtering
- pagination
- status
- row actions
- responsive behavior

Avoid excessive columns.

Prioritize the information needed for the current task.

---

# 19. Forms

Forms must:

- group related fields
- have clear labels
- clearly show required fields
- validate inline
- preserve entered information where possible
- prevent accidental loss of work

Use React Hook Form + Zod for complex forms.

---

# 20. Validation

Validation messages must be Arabic and specific.

Bad:

```text
حدث خطأ
```

Better:

```text
الكمية يجب أن تكون أكبر من صفر
```

Better:

```text
لا يوجد مخزون كافٍ من هذا المنتج. المتاح: 3 وحدات.
```

---

# 21. Loading States

Do not leave users wondering whether the system is working.

Use:

- skeletons
- inline loading states
- disabled action states
- progress feedback

Avoid unnecessary full-page loading.

---

# 22. Empty States

An empty screen should explain:

1. what is empty
2. why it matters
3. what the user can do

Example:

```text
لا توجد منتجات منخفضة المخزون حاليًا.

كل المنتجات فوق الحد الأدنى للمخزون.
```

---

# 23. Error States

Errors should be:

- understandable
- actionable
- non-technical

Avoid exposing:

- stack traces
- database errors
- internal identifiers

---

# 24. Destructive Actions

For destructive operations:

- make the action explicit
- explain the impact
- require confirmation where appropriate
- avoid ambiguous buttons

Example:

```text
هل تريد إلغاء الفاتورة؟

سيتم تسجيل العملية كملغاة ولن يتم حذف سجلها التاريخي.

[ رجوع ] [ إلغاء الفاتورة ]
```

---

# 25. Typography

Arabic typography is a core design concern.

The selected font must support:

- readability
- dense operational screens
- clear numerals
- tables
- forms
- receipts where applicable

Do not choose a font only because it looks fashionable.

---

# 26. Color

Use semantic color rather than decorative color.

Examples:

- primary action
- success
- warning
- danger
- informational
- neutral

Status colors must remain accessible.

---

# 27. Visual Design

Avoid generic AI dashboard patterns.

Do not default to:

- excessive gradients
- glassmorphism
- floating decorative blobs
- huge hero headings
- excessive card nesting
- excessive corner rounding
- unnecessary animation

The visual identity must be intentional and consistent.

---

# 28. Motion

Motion should communicate:

- state changes
- navigation
- loading
- success
- confirmation

Avoid animation simply for decoration.

---

# 29. Responsive Design

Internal application:

- desktop-first
- tablet support where practical

Online store:

- mobile-first

Do not simply scale desktop layouts down.

---

# 30. RTL Rules

Layouts must be naturally RTL.

Use logical CSS properties.

Avoid relying on:

```css
left
right
```

when logical alternatives are appropriate.

Review:

- navigation
- forms
- tables
- dialogs
- drawers
- dropdowns
- charts
- POS
- order boards
- receipts

specifically for RTL behavior.

---

# 31. Accessibility

Aim for WCAG AA quality.

Important workflows must support:

- keyboard use
- visible focus
- accessible labels
- appropriate contrast
- semantic HTML
- non-color status communication

---

# 32. Design System

Before building major screens, establish:

- typography
- color tokens
- spacing scale
- radius scale
- elevation
- button hierarchy
- input hierarchy
- table patterns
- form patterns
- modal patterns
- status badges
- navigation
- feedback messages
- empty states
- loading states

---

# 33. UI/UX Pro Max

The ui-ux-pro-max skill must be used when:

- designing a new major screen
- designing the design system
- reviewing an existing screen
- fixing UX issues
- reviewing responsive behavior
- selecting typography
- selecting colors
- planning dashboard information hierarchy

Before implementing a major screen:

1. Search the relevant ui-ux-pro-max guidance.
2. Define the visual direction.
3. Define the user goal.
4. Define the information hierarchy.
5. Define interaction states.
6. Implement.
7. Review visually.
8. Review RTL.
9. Review accessibility.
10. Review responsive behavior.

---

# 34. Definition of Done for UI

A screen is not complete when the code compiles.

It is complete when:

- the primary task is obvious
- the layout is coherent
- Arabic RTL works naturally
- loading states exist
- empty states exist
- error states exist
- success feedback exists where appropriate
- destructive actions are safe
- accessibility is acceptable
- responsive behavior is reviewed
- the visual design matches the design system
- no obvious AI-generated visual clichés remain
