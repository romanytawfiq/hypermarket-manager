/**
 * Deterministic development store-seed data generator.
 *
 * Produces realistic Egyptian supermarket & café catalog data (categories,
 * brands, and a large product list) plus an inventory profile per product.
 *
 * This module is PURE and synchronous: it never touches the database, so it can
 * be unit-tested in isolation and also used by the `runStoreSeed` writer to
 * populate MongoDB. All values are generated deterministically from the same
 * input, so re-running yields the exact same catalog (uniqueness / stability).
 *
 * These are DEVELOPMENT/TEST data points only. They are realistic but not
 * business-backed, and must never be mistaken for real stock or real sales.
 */

/* ------------------------------------------------------------------ *
 * Public shapes
 * ------------------------------------------------------------------ */

export interface SeedCategory {
  name: string;
  supportsSugarOptions: boolean;
  /** Total number of products the generator emits for this category. */
  productCount: number;
}

export interface SeedBrand {
  name: string;
}

/**
 * A single generated product (mirrors the Product document shape, but with
 * `categoryName`/`brandName` resolved and an inventory quantity so the writer
 * can map identifiers).
 */
export interface SeedProduct {
  name: string;
  barcode: string;
  sku: string;
  categoryName: string;
  brandName: string;
  unit: string;
  purchaseCost: number;
  sellingPrice: number;
  minimumStock: number;
  trackExpiry: boolean;
  onlineVisible: boolean;
  description: string;
  /** Initial sellable quantity for the dev seed. */
  initialStock: number;
}

export interface SeedBundle {
  categories: SeedCategory[];
  brands: SeedBrand[];
  products: SeedProduct[];
}

/* ------------------------------------------------------------------ *
 * Deterministic helpers
 * ------------------------------------------------------------------ */

/** Rounds a money value to 2 decimals without floating drift. */
function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Generates a deterministic EAN-13-compatible barcode (13 digits, valid check). */
function makeEan13(seq: number): string {
  const body = (200000000000 + seq * 7).toString().padStart(12, "0").slice(-12);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return body + check;
}

/* ------------------------------------------------------------------ *
 * Category catalogue
 * ------------------------------------------------------------------ */

const CATEGORY_DEFS: Array<{ name: string; sugar: boolean }> = [
  { name: "مشروبات ساخنة", sugar: true },
  { name: "قهوة", sugar: true },
  { name: "مشروبات باردة", sugar: true },
  { name: "عصائر ومشروبات جاهزة", sugar: false },
  { name: "مياه وعصائر طبيعية", sugar: false },
  { name: "مشروبات غازية", sugar: false },
  { name: "ألبان ومنتجات ألبان", sugar: false },
  { name: "أجبان", sugar: false },
  { name: "زبادي وحلويات ألبان", sugar: false },
  { name: "مخبوزات ومعجنات", sugar: false },
  { name: "خبز", sugar: false },
  { name: "حبوب وإفطار", sugar: false },
  { name: "زيت ودهون", sugar: false },
  { name: "أرز ومعكرونة", sugar: false },
  { name: "سكر وحلويات", sugar: false },
  { name: "بهارات وتوابل", sugar: false },
  { name: "صوصات ومعلبات", sugar: false },
  { name: "معلبات", sugar: false },
  { name: "عسل ومربى", sugar: false },
  { name: "شاي وبن وسكر", sugar: false },
  { name: "بقوليات", sugar: false },
  { name: "مكسرات وفواكه مجففة", sugar: false },
  { name: "مقرمشات ووجبات خفيفة", sugar: false },
  { name: "شوكولاتة وحلويات", sugar: false },
  { name: "بسكويت", sugar: false },
  { name: "آيس كريم", sugar: false },
  { name: "أغذية الأطفال", sugar: false },
  { name: "معلبات لحوم وأسماك", sugar: false },
  { name: "أرز وحبوب أخرى", sugar: false },
  { name: "منظفات المنزل", sugar: false },
  { name: "منتجات ورقية", sugar: false },
  { name: "أدوات المطبخ", sugar: false },
  { name: "منتجات التنظيف الشخصي", sugar: false },
  { name: "العناية الشخصية", sugar: false },
  { name: "العناية بالشعر", sugar: false },
  { name: "العناية بالأسنان", sugar: false },
  { name: "مستحضرات العناية بالبشرة", sugar: false },
  { name: "كافيه - أصناف باردة", sugar: true },
  { name: "كافيه - أصناف ساخنة", sugar: true },
];

/* ------------------------------------------------------------------ *
 * Brand catalogue (realistic Egyptian / international brands)
 * ------------------------------------------------------------------ */

const BRAND_DEFS: string[] = [
  "جهينة", "المراعي", "بيضة", "لونا", "العصفور", "أرلا", "جمبو",
  "نستله", "بيبسي", "كوكاكولا", "سفن أب", "ميرندا", "شويبس",
  "نستله بيور لايف", "أكوا", "سنسيب", "الفجر", "العسال",
  "الهادي", "دومتي", "دنيا", "نايس", "الديب", "الفيومي", "الأهرام",
  "البركة", "السلطان", "الشمس", "الكنانة", "النيل", "الفلاح", "الأصيل",
  "المروة", "الدلتا", "الوطنية", "العطار", "فريش", "ويت", "أوريو",
  "برسيل", "أومو", "بيريل", "فيري", "دومستوس", "كلوروكس", "سانيتا",
  "كولجيت", "سيجنال", "بانتين", "هيد آند شولدرز", "داف", "نيفيا",
  "فيرز", "غارنييه", "لوريال", "جونسون", "إيديال",
];

/* ------------------------------------------------------------------ *
 * Family template model
 * ------------------------------------------------------------------ */

interface VariantDef {
  label: string;
  price: number;
}

/** Adds several common package sizes from a base unit price. */
function sizes(price250: number): VariantDef[] {
  return [
    { label: "250 جم", price: money(price250) },
    { label: "500 جم", price: money(price250 * 1.7) },
    { label: "1 كجم", price: money(price250 * 3.2) },
  ];
}

interface FamilyDef {
  brand: string;
  name: string;
  unit?: string;
  trackExpiry?: boolean;
  online?: boolean;
  minStock?: number;
  variants: VariantDef[];
}

interface CategoryFamilies {
  category: string;
  families: FamilyDef[];
}

/* ------------------------------------------------------------------ *
 * Family templates per category
 * ------------------------------------------------------------------ */

const FAMILIES: CategoryFamilies[] = [
  {
    category: "مشروبات غازية",
    families: [
      { brand: "بيبسي", name: "بيبسي", unit: "علبة", variants: [{ label: "علبة 330 مل", price: 12 }, { label: "زجاجة 1 لتر", price: 30 }, { label: "زجاجة 2 لتر", price: 55 }] },
      { brand: "كوكاكولا", name: "كوكاكولا", unit: "علبة", variants: [{ label: "علبة 330 مل", price: 12 }, { label: "زجاجة 1 لتر", price: 30 }, { label: "زجاجة 2 لتر", price: 55 }] },
      { brand: "سفن أب", name: "سفن أب", unit: "علبة", variants: [{ label: "علبة 330 مل", price: 12 }, { label: "زجاجة 1 لتر", price: 30 }] },
      { brand: "ميرندا", name: "ميرندا برتقال", unit: "علبة", variants: [{ label: "علبة 330 مل", price: 11 }, { label: "زجاجة 1 لتر", price: 28 }] },
      { brand: "شويبس", name: "شويبس ليمون", unit: "علبة", variants: [{ label: "علبة 330 مل", price: 13 }, { label: "زجاجة 1 لتر", price: 32 }] },
      { brand: "شويبس", name: "شويبس جنزبيل", unit: "علبة", variants: [{ label: "علبة 330 مل", price: 13 }, { label: "زجاجة 1 لتر", price: 32 }] },
      { brand: "بيبسي", name: "بيبسي دايت", unit: "علبة", variants: [{ label: "علبة 330 مل", price: 12 }, { label: "زجاجة 1 لتر", price: 30 }] },
      { brand: "كوكاكولا", name: "كوكاكولا دايت", unit: "علبة", variants: [{ label: "علبة 330 مل", price: 12 }, { label: "زجاجة 1 لتر", price: 30 }] },
      { brand: "ميرندا", name: "ميرندا عنب", unit: "علبة", variants: [{ label: "علبة 330 مل", price: 11 }] },
      { brand: "ميرندا", name: "ميرندا تفاح", unit: "علبة", variants: [{ label: "علبة 330 مل", price: 11 }] },
      { brand: "شويبس", name: "شويبس توت", unit: "علبة", variants: [{ label: "علبة 330 مل", price: 13 }] },
      { brand: "كوكاكولا", name: "فانتا برتقال", unit: "علبة", variants: [{ label: "علبة 330 مل", price: 12 }, { label: "زجاجة 1 لتر", price: 30 }] },
      { brand: "سفن أب", name: "سفن أب زيرو", unit: "علبة", variants: [{ label: "علبة 330 مل", price: 12 }] },
      { brand: "بيبسي", name: "بيبسي ماكس", unit: "علبة", variants: [{ label: "علبة 330 مل", price: 12 }] },
      { brand: "شويبس", name: "مياه غازية صودا", unit: "زجاجة", variants: [{ label: "زجاجة 1 لتر", price: 22 }, { label: "زجاجة 2 لتر", price: 40 }] },
    ],
  },
  {
    category: "عصائر ومشروبات جاهزة",
    families: [
      { brand: "الفجر", name: "عصير برتقال", unit: "كرتون", variants: [{ label: "200 مل", price: 15 }, { label: "1 لتر", price: 38 }] },
      { brand: "جهينة", name: "عصير مانجو", unit: "عبوة", variants: [{ label: "200 مل", price: 16 }, { label: "1 لتر", price: 40 }] },
      { brand: "المراعي", name: "عصير مشكل", unit: "عبوة", variants: [{ label: "200 مل", price: 17 }, { label: "1 لتر", price: 45 }] },
      { brand: "دنيا", name: "عصير تفاح", unit: "عبوة", variants: [{ label: "275 مل", price: 14 }, { label: "1 لتر", price: 36 }] },
      { brand: "العالمية", name: "عصير جوافة", unit: "عبوة", variants: [{ label: "200 مل", price: 15 }, { label: "1 لتر", price: 38 }] },
      { brand: "الفجر", name: "عصير عنب", unit: "عبوة", variants: [{ label: "200 مل", price: 16 }] },
      { brand: "المراعي", name: "عصير خوخ", unit: "عبوة", variants: [{ label: "200 مل", price: 17 }] },
      { brand: "جهينة", name: "عصير فراولة", unit: "عبوة", variants: [{ label: "200 مل", price: 16 }, { label: "1 لتر", price: 40 }] },
      { brand: "دنيا", name: "عصير أناناس", unit: "عبوة", variants: [{ label: "275 مل", price: 15 }] },
      { brand: "العلالي", name: "عصير ليمون بالنعناع", unit: "عبوة", variants: [{ label: "330 مل", price: 18 }] },
    ],
  },
  {
    category: "مياه وعصائر طبيعية",
    families: [
      { brand: "نستله بيور لايف", name: "مياه معدنية", unit: "زجاجة", variants: [{ label: "600 مل", price: 7 }, { label: "1.5 لتر", price: 15 }, { label: "5 جالون", price: 60 }] },
      { brand: "أكوا", name: "مياه أكوا", unit: "زجاجة", variants: [{ label: "600 مل", price: 6 }, { label: "1.5 لتر", price: 14 }] },
      { brand: "بارادايس", name: "مياه بارادايس", unit: "زجاجة", variants: [{ label: "1.5 لتر", price: 13 }] },
      { brand: "سنسيب", name: "مياه سنسيب", unit: "زجاجة", variants: [{ label: "1.5 لتر", price: 14 }] },
      { brand: "العسال", name: "عصير ليمون طبيعي", unit: "عبوة", variants: [{ label: "330 مل", price: 18 }, { label: "1 لتر", price: 40 }] },
      { brand: "العسال", name: "عصير برتقال طبيعي", unit: "عبوة", variants: [{ label: "330 مل", price: 20 }, { label: "1 لتر", price: 45 }] },
    ],
  },
  {
    category: "مشروبات ساخنة",
    families: [
      { brand: "الأحمر", name: "حلبة", unit: "كيس", variants: sizes(12) },
      { brand: "العطار", name: "يانسون", unit: "كيس", variants: sizes(10) },
      { brand: "العطار", name: "كركديه", unit: "كيس", variants: sizes(14) },
      { brand: "الشمس", name: "نسكافيه", unit: "برطمان", variants: [{ label: "200 جم", price: 90 }, { label: "500 جم", price: 210 }] },
      { brand: "العطار", name: "نعناع", unit: "كيس", variants: sizes(8) },
      { brand: "العطار", name: "بابونج", unit: "كيس", variants: sizes(12) },
      { brand: "العطار", name: "زنجبيل", unit: "كيس", variants: sizes(15) },
      { brand: "العطار", name: "قرفة", unit: "كيس", variants: sizes(13) },
      { brand: "الحصرى", name: "سحلب", unit: "علبة", variants: sizes(20) },
      { brand: "الشمس", name: "كريمة القهوة", unit: "علبة", variants: [{ label: "400 جم", price: 120 }] },
    ],
  },
  {
    category: "قهوة",
    families: [
      { brand: "الشمس", name: "قهوة مطحونة سريعة التحضير", unit: "علبة", variants: sizes(22) },
      { brand: "العربي", name: "قهوة عربية", unit: "علبة", variants: sizes(28) },
      { brand: "التركي", name: "قهوة تركية", unit: "علبة", variants: sizes(30) },
      { brand: "الإيطالي", name: "قهوة إسبريسو", unit: "علبة", variants: sizes(40) },
      { brand: "الفرنساوي", name: "قهوة فرنسية", unit: "علبة", variants: sizes(35) },
      { brand: "العربي", name: "بن محمص", unit: "كيس", variants: sizes(25) },
    ],
  },
  {
    category: "مشروبات باردة",
    families: [
      { brand: "العصير", name: "كوكتيل مثلج", unit: "كوب", variants: [{ label: "كوب 300 مل", price: 25 }] },
      { brand: "الفراولة", name: "فراولة بالحليب", unit: "كوب", variants: [{ label: "كوب 300 مل", price: 28 }] },
      { brand: "المانجو", name: "عصير مانجو مثلج", unit: "كوب", variants: [{ label: "كوب 300 مل", price: 30 }] },
      { brand: "الليمون", name: "ليمون بالنعناع", unit: "كوب", variants: [{ label: "كوب 300 مل", price: 22 }] },
      { brand: "الموز", name: "عصير موز بالحليب", unit: "كوب", variants: [{ label: "كوب 300 مل", price: 26 }] },
    ],
  },
  {
    category: "ألبان ومنتجات ألبان",
    families: [
      { brand: "جهينة", name: "حليب كامل الدسم", unit: "كريتون", trackExpiry: true, variants: [{ label: "1 لتر", price: 38 }, { label: "250 مل", price: 12 }] },
      { brand: "المراعي", name: "حليب طازج", unit: "كريتون", trackExpiry: true, variants: [{ label: "1 لتر", price: 40 }, { label: "2 لتر", price: 75 }] },
      { brand: "بيضة", name: "حليب مبستر", unit: "كريتون", trackExpiry: true, variants: [{ label: "1 لتر", price: 34 }] },
      { brand: "لونا", name: "حليب مجفف", unit: "علبة", variants: [{ label: "400 جم", price: 120 }] },
      { brand: "المراعي", name: "قشطة", unit: "برطمان", trackExpiry: true, variants: [{ label: "170 جم", price: 40 }] },
      { brand: "جهينة", name: "حليب منزوع الدسم", unit: "كريتون", trackExpiry: true, variants: [{ label: "1 لتر", price: 38 }] },
      { brand: "المراعي", name: "حليب بالشوكولاتة", unit: "كريتون", trackExpiry: true, variants: [{ label: "200 مل", price: 12 }, { label: "1 لتر", price: 30 }] },
      { brand: "بيضة", name: "حليب منكه بالفراولة", unit: "كريتون", trackExpiry: true, variants: [{ label: "200 مل", price: 12 }] },
      { brand: "أرلا", name: "زبدة طبيعية", unit: "عبوة", trackExpiry: true, variants: [{ label: "200 جم", price: 65 }] },
      { brand: "جهينة", name: "جبنة مطبوخة سائلة", unit: "عبوة", trackExpiry: true, variants: [{ label: "400 جم", price: 45 }] },
    ],
  },
  {
    category: "أجبان",
    families: [
      { brand: "جهينة", name: "جبنة بيضاء مطبوخة", unit: "عبوة", trackExpiry: true, variants: [{ label: "500 جم", price: 85 }, { label: "1 كجم", price: 160 }] },
      { brand: "دومتي", name: "جبنة رومي", unit: "عبوة", trackExpiry: true, variants: [{ label: "500 جم", price: 95 }] },
      { brand: "المراعي", name: "جبنة شيدر", unit: "عبوة", trackExpiry: true, variants: [{ label: "400 جم", price: 90 }] },
      { brand: "بيضة", name: "جبنة مثلثات", unit: "عبوة", trackExpiry: true, variants: [{ label: "120 جم", price: 30 }] },
      { brand: "جهينة", name: "جبنة كريمي", unit: "عبوة", trackExpiry: true, variants: [{ label: "250 جم", price: 60 }] },
      { brand: "دومتي", name: "جبنة بارميزان", unit: "عبوة", trackExpiry: true, variants: [{ label: "200 جم", price: 80 }] },
      { brand: "المراعي", name: "جبنة موتزاريلا", unit: "عبوة", trackExpiry: true, variants: [{ label: "400 جم", price: 95 }] },
      { brand: "بيضة", name: "جبنة قريش", unit: "عبوة", trackExpiry: true, variants: [{ label: "500 جم", price: 30 }] },
      { brand: "جهينة", name: "جبنة موتزاريلا مبشورة", unit: "عبوة", trackExpiry: true, variants: [{ label: "200 جم", price: 50 }] },
      { brand: "دومتي", name: "جبنة رومي قديمة", unit: "عبوة", trackExpiry: true, variants: [{ label: "1 كجم", price: 200 }] },
    ],
  },
  {
    category: "زبادي وحلويات ألبان",
    families: [
      { brand: "جهينة", name: "زبادي", unit: "كوب", trackExpiry: true, variants: [{ label: "110 جم", price: 7 }] },
      { brand: "المراعي", name: "زبادي تركي", unit: "عبوة", trackExpiry: true, variants: [{ label: "500 جم", price: 45 }] },
      { brand: "بيضة", name: "زبادي بالفواكه", unit: "كوب", trackExpiry: true, variants: [{ label: "130 جم", price: 12 }] },
      { brand: "جهينة", name: "زبادي بالعسل", unit: "كوب", trackExpiry: true, variants: [{ label: "130 جم", price: 15 }] },
      { brand: "المراعي", name: "زبادي قليل الدسم", unit: "عبوة", trackExpiry: true, variants: [{ label: "500 جم", price: 40 }] },
      { brand: "بيضة", name: "رايب", unit: "كوب", trackExpiry: true, variants: [{ label: "110 جم", price: 8 }] },
      { brand: "جهينة", name: "مهلبية", unit: "كوب", trackExpiry: true, variants: [{ label: "110 جم", price: 10 }] },
    ],
  },
  {
    category: "مخبوزات ومعجنات",
    families: [
      { brand: "العاصمة", name: "بيتى فور", unit: "علبة", trackExpiry: true, variants: [{ label: "500 جم", price: 55 }, { label: "1 كجم", price: 100 }] },
      { brand: "العاصمة", name: "بقلاوة", unit: "علبة", variants: [{ label: "500 جم", price: 120 }] },
      { brand: "الكبيرة", name: "كرواسون بالشوكولاتة", unit: "قطعة", trackExpiry: true, variants: [{ label: "قطعة", price: 15 }] },
      { brand: "العاصمة", name: "غريبة", unit: "علبة", trackExpiry: true, variants: [{ label: "500 جم", price: 70 }] },
      { brand: "الكبيرة", name: "كيك إسفنجي", unit: "قطعة", trackExpiry: true, variants: [{ label: "قطعة", price: 20 }] },
      { brand: "العاصمة", name: "قطايف", unit: "كيس", trackExpiry: true, variants: [{ label: "500 جم", price: 40 }] },
    ],
  },
  {
    category: "خبز",
    families: [
      { brand: "النخالة", name: "صمون", unit: "طقم", trackExpiry: true, variants: [{ label: "طقم 4", price: 10 }] },
      { brand: "النخالة", name: "عيش فينو", unit: "كيس", trackExpiry: true, variants: [{ label: "كيس 8", price: 12 }] },
      { brand: "النخالة", name: "خبز أسمر", unit: "رغيف", trackExpiry: true, variants: [{ label: "رغيف", price: 2 }] },
      { brand: "النخالة", name: "عيش بلدي", unit: "رغيف", trackExpiry: true, variants: [{ label: "رغيف", price: 1 }] },
      { brand: "النخالة", name: "خبز الشامي", unit: "رغيف", trackExpiry: true, variants: [{ label: "رغيف", price: 3 }] },
      { brand: "النخالة", name: "توست أحمر", unit: "طقم", trackExpiry: true, variants: [{ label: "طقم 500 جم", price: 25 }] },
    ],
  },
  {
    category: "حبوب وإفطار",
    families: [
      { brand: "نستله", name: "كورن فلكس", unit: "علبة", variants: [{ label: "375 جم", price: 85 }, { label: "750 جم", price: 150 }] },
      { brand: "نستله", name: "حبوب إفطار بالعسل", unit: "علبة", variants: [{ label: "375 جم", price: 90 }] },
      { brand: "الكويتية", name: "شوفان", unit: "علبة", variants: sizes(20) },
      { brand: "نستله", name: "نستله سيريلاك", unit: "علبة", variants: [{ label: "250 جم", price: 60 }, { label: "500 جم", price: 110 }] },
      { brand: "الكويتية", name: "برغل", unit: "كيس", variants: sizes(15) },
      { brand: "النخالة", name: "فريك", unit: "كيس", variants: [{ label: "500 جم", price: 20 }] },
    ],
  },
  {
    category: "زيت ودهون",
    families: [
      { brand: "الكريستال", name: "زيت عباد الشمس", unit: "زجاجة", variants: [{ label: "1 لتر", price: 90 }, { label: "2.5 لتر", price: 210 }] },
      { brand: "الأصيل", name: "زيت ذرة", unit: "زجاجة", variants: [{ label: "1 لتر", price: 105 }, { label: "2 لتر", price: 200 }] },
      { brand: "الفجر", name: "زيت طعام", unit: "زجاجة", variants: [{ label: "1 لتر", price: 80 }, { label: "5 لتر", price: 380 }] },
      { brand: "العصفور", name: "زبدة", unit: "عبوة", trackExpiry: true, variants: [{ label: "200 جم", price: 70 }] },
      { brand: "الأصيل", name: "زيت زيتون بكر", unit: "زجاجة", variants: [{ label: "500 مل", price: 180 }, { label: "1 لتر", price: 340 }] },
      { brand: "الفجر", name: "سمن نباتي", unit: "علبة", variants: [{ label: "1 كجم", price: 65 }] },
    ],
  },
  {
    category: "أرز ومعكرونة",
    families: [
      { brand: "الأمل", name: "أرز مصري", unit: "كيس", variants: [{ label: "1 كجم", price: 40 }, { label: "5 كجم", price: 180 }] },
      { brand: "الهدى", name: "أرز بسمتي", unit: "كيس", variants: sizes(28) },
      { brand: "معكرونة", name: "معكرونة نودلز", unit: "عبوة", variants: [{ label: "400 جم", price: 25 }, { label: "1 كجم", price: 55 }] },
      { brand: "معكرونة", name: "سباجتي", unit: "عبوة", variants: [{ label: "400 جم", price: 24 }] },
      { brand: "معكرونة", name: "بنى", unit: "عبوة", variants: [{ label: "400 جم", price: 22 }] },
      { brand: "معكرونة", name: "فيتوتشيني", unit: "عبوة", variants: [{ label: "400 جم", price: 26 }] },
      { brand: "الأمل", name: "أرز مصري فاخر", unit: "كيس", variants: [{ label: "1 كجم", price: 45 }, { label: "2 كجم", price: 85 }] },
    ],
  },
  {
    category: "سكر وحلويات",
    families: [
      { brand: "الهندي", name: "سكر أبيض ناعم", unit: "كيس", variants: [{ label: "1 كجم", price: 32 }, { label: "5 كجم", price: 150 }] },
      { brand: "الفرنساوي", name: "سكر بني", unit: "كيس", variants: [{ label: "1 كجم", price: 45 }] },
      { brand: "النسور", name: "سكر مكرر", unit: "كيس", variants: [{ label: "1 كجم", price: 34 }] },
      { brand: "الفرنساوي", name: "عسل أسود", unit: "زجاجة", variants: [{ label: "400 جم", price: 25 }, { label: "1 كجم", price: 55 }] },
    ],
  },
  {
    category: "بهارات وتوابل",
    families: [
      { brand: "العطار", name: "فلفل أسود", unit: "علبة", variants: sizes(18) },
      { brand: "العطار", name: "كمون", unit: "علبة", variants: sizes(10) },
      { brand: "العطار", name: "بهارات مشكلة", unit: "علبة", variants: sizes(15) },
      { brand: "الأصيل", name: "ملح طعام", unit: "كيس", variants: [{ label: "500 جم", price: 10 }, { label: "1 كجم", price: 18 }] },
      { brand: "العطار", name: "كاري", unit: "علبة", variants: sizes(20) },
      { brand: "العطار", name: "كزبرة ناعمة", unit: "علبة", variants: sizes(12) },
      { brand: "العطار", name: "كركم", unit: "علبة", variants: sizes(14) },
      { brand: "العطار", name: "بابريكا", unit: "علبة", variants: sizes(16) },
      { brand: "العطار", name: "بهارات المشويات", unit: "علبة", variants: sizes(18) },
    ],
  },
  {
    category: "صوصات ومعلبات",
    families: [
      { brand: "ويت", name: "كاتشب", unit: "زجاجة", variants: [{ label: "300 جم", price: 30 }, { label: "1 كجم", price: 80 }] },
      { brand: "ويت", name: "مايونيز", unit: "زجاجة", variants: [{ label: "300 جم", price: 35 }] },
      { brand: "الأهلي", name: "صلصة طماطم", unit: "علبة", variants: [{ label: "400 جم", price: 25 }] },
      { brand: "السلطان", name: "خل طعام", unit: "زجاجة", variants: [{ label: "500 مل", price: 22 }] },
      { brand: "ويت", name: "صلصة باربكيو", unit: "زجاجة", variants: [{ label: "300 جم", price: 40 }] },
      { brand: "الأهلي", name: "صلصة حارة", unit: "زجاجة", variants: [{ label: "300 جم", price: 30 }] },
      { brand: "السلطان", name: "خل تفاح", unit: "زجاجة", variants: [{ label: "500 مل", price: 30 }] },
    ],
  },
  {
    category: "معلبات",
    families: [
      { brand: "فريش", name: "تونة معلبة", unit: "علبة", variants: [{ label: "140 جم", price: 45 }] },
      { brand: "الأمل", name: "فول مدمس", unit: "علبة", variants: [{ label: "400 جم", price: 20 }] },
      { brand: "الأمل", name: "حمص", unit: "علبة", variants: [{ label: "400 جم", price: 25 }] },
      { brand: "فريش", name: "طماطم مقشرة", unit: "علبة", variants: [{ label: "400 جم", price: 20 }] },
      { brand: "الأمل", name: "بازلاء", unit: "علبة", variants: [{ label: "400 جم", price: 30 }] },
      { brand: "الأمل", name: "ذرة حلوة", unit: "علبة", variants: [{ label: "340 جم", price: 35 }] },
    ],
  },
  {
    category: "عسل ومربى",
    families: [
      { brand: "السلام", name: "عسل نحل طبيعي", unit: "برطمان", variants: [{ label: "500 جم", price: 180 }, { label: "1 كجم", price: 340 }] },
      { brand: "الأصيل", name: "مربى فراولة", unit: "برطمان", variants: [{ label: "400 جم", price: 45 }] },
      { brand: "الأصيل", name: "مربى مشمش", unit: "برطمان", variants: [{ label: "400 جم", price: 50 }] },
      { brand: "السلام", name: "عسل أسود", unit: "زجاجة", variants: [{ label: "500 جم", price: 30 }] },
      { brand: "الأصيل", name: "مربى توت", unit: "برطمان", variants: [{ label: "400 جم", price: 55 }] },
    ],
  },
  {
    category: "شاي وبن وسكر",
    families: [
      { brand: "العروسة", name: "شاي المانية", unit: "علبة", variants: [{ label: "250 جم", price: 70 }, { label: "500 جم", price: 130 }] },
      { brand: "النجمة", name: "شاي أخضر", unit: "علبة", variants: [{ label: "100 جم", price: 40 }] },
      { brand: "العربي", name: "بن خام", unit: "كيس", variants: sizes(45) },
      { brand: "العروسة", name: "شاي كرك", unit: "علبة", variants: [{ label: "200 جم", price: 80 }] },
      { brand: "النجمة", name: "شاي بالتوت", unit: "علبة", variants: [{ label: "100 جم", price: 45 }] },
    ],
  },
  {
    category: "بقوليات",
    families: [
      { brand: "الأمل", name: "عدس", unit: "كيس", variants: sizes(18) },
      { brand: "الأمل", name: "فول", unit: "كيس", variants: sizes(14) },
      { brand: "الأمل", name: "لوبيا", unit: "كيس", variants: [{ label: "500 جم", price: 30 }] },
      { brand: "الأمل", name: "حمص", unit: "كيس", variants: sizes(20) },
      { brand: "الأمل", name: "بازلاء جافة", unit: "كيس", variants: [{ label: "500 جم", price: 25 }] },
      { brand: "الأمل", name: "فاصوليا", unit: "كيس", variants: sizes(16) },
    ],
  },
  {
    category: "مكسرات وفواكه مجففة",
    families: [
      { brand: "الهلال", name: "فول سوداني محمص", unit: "كيس", variants: [{ label: "200 جم", price: 25 }, { label: "500 جم", price: 55 }] },
      { brand: "الهلال", name: "لوز", unit: "كيس", variants: [{ label: "200 جم", price: 90 }] },
      { brand: "الهلال", name: "بندق", unit: "كيس", variants: [{ label: "200 جم", price: 110 }] },
      { brand: "الهلال", name: "عجوة", unit: "علبة", variants: [{ label: "500 جم", price: 60 }] },
      { brand: "الهلال", name: "زبيب", unit: "كيس", variants: [{ label: "200 جم", price: 40 }] },
      { brand: "الهلال", name: "مشمش مجفف", unit: "كيس", variants: [{ label: "200 جم", price: 50 }] },
    ],
  },
  {
    category: "مقرمشات ووجبات خفيفة",
    families: [
      { brand: "أوريو", name: "شيبسي", unit: "كيس", variants: [{ label: "25 جم", price: 10 }, { label: "50 جم", price: 18 }] },
      { brand: "أوريو", name: "شيبسي بالفلفل", unit: "كيس", variants: [{ label: "50 جم", price: 18 }] },
      { brand: "تشيتوس", name: "سناك جبنة", unit: "كيس", variants: [{ label: "40 جم", price: 15 }] },
      { brand: "الفلاح", name: "ذرة محمصة", unit: "كيس", variants: [{ label: "40 جم", price: 12 }] },
      { brand: "أوريو", name: "بفك", unit: "كيس", variants: [{ label: "30 جم", price: 14 }] },
      { brand: "الفا", name: "مقرمشات ملوحة", unit: "كيس", variants: [{ label: "40 جم", price: 13 }] },
      { brand: "الفا", name: "سناك ذرة", unit: "كيس", variants: [{ label: "40 جم", price: 12 }] },
    ],
  },
  {
    category: "شوكولاتة وحلويات",
    families: [
      { brand: "جاالكس", name: "شوكولاتة جالكس", unit: "قطعة", variants: [{ label: "36 جم", price: 20 }, { label: "150 جم", price: 75 }] },
      { brand: "كادبوري", name: "شوكولاتة بالبندق", unit: "قطعة", variants: [{ label: "50 جم", price: 30 }] },
      { brand: "نستله", name: "شوكولاتة بيضاء", unit: "قطعة", variants: [{ label: "50 جم", price: 25 }] },
      { brand: "الكويتية", name: "حلوى ملبس", unit: "كيس", variants: [{ label: "500 جم", price: 55 }] },
      { brand: "كادبوري", name: "شوكولاتة بالكراميل", unit: "قطعة", variants: [{ label: "50 جم", price: 32 }] },
      { brand: "جاالكس", name: "شوكولاتة بالجوز", unit: "قطعة", variants: [{ label: "100 جم", price: 55 }] },
      { brand: "الكويتية", name: "حلوى سخن", unit: "كيس", variants: [{ label: "300 جم", price: 40 }] },
    ],
  },
  {
    category: "بسكويت",
    families: [
      { brand: "أوريو", name: "بسكويت أوريو", unit: "علبة", variants: [{ label: "137 جم", price: 25 }, { label: "308 جم", price: 50 }] },
      { brand: "الكانزو", name: "بسكويت شاي", unit: "علبة", variants: [{ label: "250 جم", price: 20 }] },
      { brand: "السخاوي", name: "بسكويت محشو بالعجوة", unit: "علبة", variants: [{ label: "250 جم", price: 24 }] },
      { brand: "الكبير", name: "بسكويت شيكولاتة", unit: "علبة", variants: [{ label: "180 جم", price: 22 }] },
      { brand: "أوريو", name: "بسكويت أوريو برتقال", unit: "علبة", variants: [{ label: "137 جم", price: 26 }] },
      { brand: "الكانزو", name: "بسكويت بالسكر", unit: "علبة", variants: [{ label: "250 جم", price: 18 }] },
    ],
  },
  {
    category: "آيس كريم",
    families: [
      { brand: "المراعي", name: "آيس كريم فانيليا", unit: "علبة", trackExpiry: true, variants: [{ label: "1 لتر", price: 70 }] },
      { brand: "المراعي", name: "آيس كريم شوكولاتة", unit: "علبة", trackExpiry: true, variants: [{ label: "1 لتر", price: 70 }] },
      { brand: "المراعي", name: "آيس كريم بالفواكه", unit: "علبة", trackExpiry: true, variants: [{ label: "1 لتر", price: 75 }] },
      { brand: "المراعي", name: "آيس كريم فراولة", unit: "علبة", trackExpiry: true, variants: [{ label: "1 لتر", price: 72 }] },
      { brand: "المراعي", name: "آيس كريم مانجو", unit: "علبة", trackExpiry: true, variants: [{ label: "1 لتر", price: 75 }] },
    ],
  },
  {
    category: "أغذية الأطفال",
    families: [
      { brand: "نستله", name: "حليب أطفال رقم 1", unit: "علبة", variants: [{ label: "900 جم", price: 320 }, { label: "1.8 كجم", price: 600 }] },
      { brand: "نستله", name: "حليب أطفال رقم 2", unit: "علبة", variants: [{ label: "900 جم", price: 310 }] },
      { brand: "نستله", name: "حليب أطفال رقم 3", unit: "علبة", variants: [{ label: "900 جم", price: 300 }] },
      { brand: "نستله", name: "سيريلاك أرز", unit: "علبة", variants: [{ label: "250 جم", price: 60 }] },
      { brand: "نستله", name: "سيريلاك قمح", unit: "علبة", variants: [{ label: "250 جم", price: 60 }] },
    ],
  },
  {
    category: "معلبات لحوم وأسماك",
    families: [
      { brand: "فريش", name: "تونة قطع", unit: "علبة", variants: [{ label: "185 جم", price: 60 }, { label: "400 جم", price: 120 }] },
      { brand: "الأمل", name: "لحم بقري مفروم", unit: "علبة", variants: [{ label: "340 جم", price: 90 }] },
      { brand: "فريش", name: "سردين", unit: "علبة", variants: [{ label: "125 جم", price: 40 }] },
      { brand: "الأمل", name: "كورن بيف", unit: "علبة", variants: [{ label: "340 جم", price: 85 }] },
    ],
  },
  {
    category: "أرز وحبوب أخرى",
    families: [
      { brand: "الأمل", name: "جريش", unit: "كيس", variants: sizes(18) },
      { brand: "الأمل", name: "سميد", unit: "كيس", variants: sizes(15) },
      { brand: "الهدى", name: "مكرونة قصيرة", unit: "عبوة", variants: [{ label: "400 جم", price: 22 }] },
      { brand: "الأمل", name: "حبوب الكينوا", unit: "كيس", variants: [{ label: "400 جم", price: 70 }] },
      { brand: "الهدى", name: "شعيرية", unit: "عبوة", variants: [{ label: "400 جم", price: 20 }] },
    ],
  },
  {
    category: "منظفات المنزل",
    families: [
      { brand: "برسيل", name: "مسحوق غسيل", unit: "كيس", variants: [{ label: "1 كجم", price: 45 }, { label: "3 كجم", price: 120 }] },
      { brand: "أومو", name: "مسحوق غسيل أوتوماتيك", unit: "كيس", variants: [{ label: "1 كجم", price: 55 }, { label: "2.7 كجم", price: 140 }] },
      { brand: "فيري", name: "سائل جلي", unit: "زجاجة", variants: [{ label: "500 مل", price: 30 }, { label: "1 لتر", price: 50 }] },
      { brand: "دومستوس", name: "مطهر أرضيات", unit: "زجاجة", variants: [{ label: "1 لتر", price: 40 }] },
      { brand: "كلوروكس", name: "مبيض", unit: "زجاجة", variants: [{ label: "1 لتر", price: 25 }] },
      { brand: "برسيل", name: "سائل غسيل", unit: "زجاجة", variants: [{ label: "1 لتر", price: 60 }, { label: "2 لتر", price: 110 }] },
      { brand: "أومو", name: "معطر ملابس", unit: "زجاجة", variants: [{ label: "1 لتر", price: 50 }] },
      { brand: "دومستوس", name: "منظف مرحاض", unit: "زجاجة", variants: [{ label: "750 مل", price: 35 }] },
      { brand: "فيري", name: "سائل غسيل أطباق بالليمون", unit: "زجاجة", variants: [{ label: "500 مل", price: 32 }] },
    ],
  },
  {
    category: "منتجات ورقية",
    families: [
      { brand: "سانيتا", name: "مناديل وجه", unit: "علبة", variants: [{ label: "150 منديل", price: 20 }] },
      { brand: "سانيتا", name: "ورق تواليت", unit: "لفة", variants: [{ label: "4 لفافات", price: 35 }, { label: "12 لفافة", price: 90 }] },
      { brand: "بيريل", name: "مناشف مطبخ", unit: "لفة", variants: [{ label: "2 لفة", price: 25 }] },
      { brand: "سانيتا", name: "مناديل مبتلة", unit: "علبة", variants: [{ label: "72 منديل", price: 40 }] },
      { brand: "بيريل", name: "ورق ألومنيوم", unit: "لفة", variants: [{ label: "10 متر", price: 35 }] },
      { brand: "سانيتا", name: "مناديل جيب", unit: "كيس", variants: [{ label: "8 مناديل", price: 5 }] },
    ],
  },
  {
    category: "أدوات المطبخ",
    families: [
      { brand: "إيديال", name: "أكياس قمامة", unit: "لفة", variants: [{ label: "20 كيس", price: 30 }] },
      { brand: "إيديال", name: "أكياس تحضير طعام", unit: "لفة", variants: [{ label: "30 كيس", price: 15 }] },
      { brand: "إيديال", name: "شكائر حفظ", unit: "لفة", variants: [{ label: "20 شكارة", price: 25 }] },
      { brand: "إيديال", name: "أكياس غروب", unit: "لفة", variants: [{ label: "20 كيس", price: 12 }] },
      { brand: "إيديال", name: "قفازات مطبخ", unit: "عبوة", variants: [{ label: "10 قفازات", price: 20 }] },
    ],
  },
  {
    category: "منتجات التنظيف الشخصي",
    families: [
      { brand: "داف", name: "صابون استحمام", unit: "قطعة", variants: [{ label: "قطعة 100 جم", price: 15 }, { label: "3 قطع", price: 40 }] },
      { brand: "لوكس", name: "صابون لوشن", unit: "قطعة", variants: [{ label: "قطعة", price: 18 }] },
      { brand: "داف", name: "صابون عطري", unit: "قطعة", variants: [{ label: "قطعة 100 جم", price: 16 }] },
      { brand: "لوكس", name: "صابون جولدن", unit: "قطعة", variants: [{ label: "قطعة", price: 20 }] },
    ],
  },
  {
    category: "العناية الشخصية",
    families: [
      { brand: "فيرز", name: "جل استحمام", unit: "زجاجة", variants: [{ label: "250 مل", price: 35 }] },
      { brand: "نيفيا", name: "لوشن للجسم", unit: "زجاجة", variants: [{ label: "200 مل", price: 60 }] },
      { brand: "داف", name: "جسم غسول", unit: "زجاجة", variants: [{ label: "250 مل", price: 38 }] },
      { brand: "نيفيا", name: "كريم مرطب للجسم", unit: "علبة", variants: [{ label: "200 مل", price: 70 }] },
    ],
  },
  {
    category: "العناية بالشعر",
    families: [
      { brand: "بانتين", name: "شامبو", unit: "زجاجة", variants: [{ label: "200 مل", price: 70 }, { label: "400 مل", price: 120 }] },
      { brand: "هيد آند شولدرز", name: "شامبو مضاد للقشرة", unit: "زجاجة", variants: [{ label: "200 مل", price: 75 }] },
      { brand: "جونسون", name: "شامبو أطفال", unit: "زجاجة", variants: [{ label: "200 مل", price: 55 }] },
      { brand: "بانتين", name: "بلسم شعر", unit: "زجاجة", variants: [{ label: "200 مل", price: 75 }] },
      { brand: "هيد آند شولدرز", name: "بلسم مضاد للقشرة", unit: "زجاجة", variants: [{ label: "200 مل", price: 60 }] },
      { brand: "جونسون", name: "زيت شعر أطفال", unit: "زجاجة", variants: [{ label: "100 مل", price: 40 }] },
    ],
  },
  {
    category: "العناية بالأسنان",
    families: [
      { brand: "كولجيت", name: "معجون أسنان", unit: "علبة", variants: [{ label: "100 جم", price: 22 }, { label: "125 جم", price: 28 }] },
      { brand: "سيجنال", name: "غسول فم", unit: "زجاجة", variants: [{ label: "250 مل", price: 45 }] },
      { brand: "أورال بي", name: "فرشاة أسنان", unit: "قطعة", variants: [{ label: "قطعة", price: 20 }] },
      { brand: "كولجيت", name: "معجون تبييض", unit: "علبة", variants: [{ label: "100 جم", price: 40 }] },
      { brand: "سيجنال", name: "خيط أسنان", unit: "علبة", variants: [{ label: "50 متر", price: 35 }] },
    ],
  },
  {
    category: "مستحضرات العناية بالبشرة",
    families: [
      { brand: "نيفيا", name: "كريم مرطب", unit: "علبة", variants: [{ label: "75 مل", price: 65 }] },
      { brand: "غارنييه", name: "كريم أساس", unit: "علبة", variants: [{ label: "30 مل", price: 90 }] },
      { brand: "لوريال", name: "سيروم فيتامين سي", unit: "زجاجة", variants: [{ label: "30 مل", price: 160 }] },
      { brand: "نيفيا", name: "واقي شمس", unit: "أنبوب", variants: [{ label: "50 مل", price: 120 }] },
      { brand: "غارنييه", name: "تونر للبشرة", unit: "زجاجة", variants: [{ label: "200 مل", price: 70 }] },
    ],
  },
  {
    category: "كافيه - أصناف ساخنة",
    families: [
      { brand: "الشمس", name: "إسبريسو", unit: "كوب", variants: [{ label: "كوب 60 مل", price: 25 }] },
      { brand: "الشمس", name: "كابتشينو", unit: "كوب", variants: [{ label: "كوب 200 مل", price: 45 }] },
      { brand: "الشمس", name: "لاتيه", unit: "كوب", variants: [{ label: "كوب 300 مل", price: 50 }] },
      { brand: "الشمس", name: "قهوة تركية", unit: "كوب", variants: [{ label: "كوب", price: 30 }] },
      { brand: "الشمس", name: "هوت شوكليت", unit: "كوب", variants: [{ label: "كوب 200 مل", price: 40 }] },
      { brand: "الشمس", name: "أمريكانو", unit: "كوب", variants: [{ label: "كوب 200 مل", price: 35 }] },
      { brand: "الشمس", name: "ماكياتو", unit: "كوب", variants: [{ label: "كوب 150 مل", price: 40 }] },
    ],
  },
  {
    category: "كافيه - أصناف باردة",
    families: [
      { brand: "الشمس", name: "آيس لاتيه", unit: "كوب", variants: [{ label: "كوب 350 مل", price: 55 }] },
      { brand: "الشمس", name: "موكا مثلج", unit: "كوب", variants: [{ label: "كوب 350 مل", price: 60 }] },
      { brand: "الشمس", name: "فرابتشينو", unit: "كوب", variants: [{ label: "كوب 350 مل", price: 65 }] },
      { brand: "الشمس", name: "آيس أمريكانو", unit: "كوب", variants: [{ label: "كوب 350 مل", price: 45 }] },
      { brand: "الشمس", name: "آيس تي", unit: "كوب", variants: [{ label: "كوب 350 مل", price: 35 }] },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Extended family templates (compact rows -> standard size variants)
 *
 * Each row expands to several size variants via the `sizes()` helper plus any
 * explicit extra variants, letting a compact table produce a large, varied and
 * realistic catalogue. Base prices are EGP per 250 g / base unit and are
 * category-appropriate.
 * ------------------------------------------------------------------ */

const LARGE = true;
interface ExtraDef {
  category: string;
  brand: string;
  name: string;
  unit?: string;
  trackExpiry?: boolean;
  /** Explicit variants added alongside generated sizes. */
  extra?: VariantDef[];
  /** Base 250g price for generated sizes; when set, sizes() is used. */
  base?: number;
}

const EXTRA_FAMILIES: ExtraDef[] = [
  // Grocery / FMCG
  { category: "بقوليات", brand: "الأمل", name: "فاصوليا بيضاء", base: 18 },
  { category: "بقوليات", brand: "الأمل", name: "فول مجروش", base: 15 },
  { category: "بقوليات", brand: "الأمل", name: "عدس أصفر", base: 20 },
  { category: "بقوليات", brand: "الأمل", name: "مكرونة خفيفة", base: 14 },
  { category: "زيت ودهون", brand: "الفجر", name: "زيت نخالة", base: 22 },
  { category: "زيت ودهون", brand: "الأصيل", name: "زيت جوز الهند", base: 60 },
  { category: "زيت ودهون", brand: "العصفور", name: "مرجرين", base: 20 },
  { category: "أرز ومعكرونة", brand: "الهدى", name: "أرز مصري قصير", base: 20 },
  { category: "أرز ومعكرونة", brand: "الهدى", name: "أرز مزة كاملة", base: 32 },
  { category: "أرز ومعكرونة", brand: "الهدى", name: "مكرونة قلم", base: 14 },
  { category: "أرز ومعكرونة", brand: "الهدى", name: "مكرونة إسباجتي", base: 14 },
  { category: "أرز ومعكرونة", brand: "الهدى", name: "مكرونة قصيرة", base: 13 },
  { category: "سكر وحلويات", brand: "النسور", name: "سكر أبيض", base: 14 },
  { category: "سكر وحلويات", brand: "الفرنساوي", name: "سكر بني خام", base: 18 },
  { category: "بهارات وتوابل", brand: "الأصيل", name: "ملح بحري", base: 8 },
  { category: "بهارات وتوابل", brand: "العطار", name: "فلفل أحمر", base: 20 },
  { category: "بهارات وتوابل", brand: "العطار", name: "زعتر", base: 25 },
  { category: "بهارات وتوابل", brand: "العطار", name: "نعناع جاف", base: 15 },
  { category: "بهارات وتوابل", brand: "العطار", name: "جنزبيل بودرة", base: 22 },
  { category: "صوصات ومعلبات", brand: "الأهلي", name: "صلصة خضار", base: 12 },
  { category: "صوصات ومعلبات", brand: "الأهلي", name: "صلصة بيضاء", base: 16 },
  { category: "صوصات ومعلبات", brand: "السلطان", name: "خل أحمر", base: 10 },
  { category: "عسل ومربى", brand: "الأصيل", name: "مربى عنب", base: 12 },
  { category: "عسل ومربى", brand: "الأصيل", name: "مربى أناناس", base: 15 },
  { category: "شاي وبن وسكر", brand: "العروسة", name: "شاي مميز", base: 30 },
  { category: "شاي وبن وسكر", brand: "النجمة", name: "شاي بنكهة النعناع", base: 35 },
  { category: "حبوب وإفطار", brand: "الكويتية", name: "موسلي", base: 40 },
  { category: "حبوب وإفطار", brand: "الكويتية", name: "حبوب الشوفان", base: 25 },
  { category: "أغذية الأطفال", brand: "نستله", name: "سيريلاك موز", base: 30 },
  { category: "معلبات لحوم وأسماك", brand: "فريش", name: "تونة بالزيت", base: 30 },
  { category: "معلبات لحوم وأسماك", brand: "الأمل", name: "لانشون", base: 25 },
  { category: "معلبات لحوم وأسماك", brand: "الأمل", name: "سجق", base: 28 },
  // Dairy
  { category: "ألبان ومنتجات ألبان", brand: "المراعي", name: "حليب طويل الأجل", trackExpiry: true, base: 20 },
  { category: "ألبان ومنتجات ألبان", brand: "جهينة", name: "حليب بالفراولة", trackExpiry: true, base: 10 },
  { category: "ألبان ومنتجات ألبان", brand: "أرلا", name: "حليب بالكاكاو", trackExpiry: true, base: 12 },
  { category: "ألبان ومنتجات ألبان", brand: "بيضة", name: "حليب قليل الدسم", trackExpiry: true, base: 16 },
  { category: "ألبان ومنتجات ألبان", brand: "لونا", name: "حليب مكثف محلى", base: 25 },
  { category: "أجبان", brand: "دومتي", name: "جبنة سنارا", trackExpiry: true, base: 18 },
  { category: "أجبان", brand: "المراعي", name: "جبنة جودة", trackExpiry: true, base: 25 },
  { category: "أجبان", brand: "جهينة", name: "جبنة فلمنك", trackExpiry: true, base: 28 },
  { category: "أجبان", brand: "بيضة", name: "جبنة إيدام", trackExpiry: true, base: 22 },
  { category: "زبادي وحلويات ألبان", brand: "المراعي", name: "زبادي بالمانجو", trackExpiry: true, base: 8 },
  { category: "زبادي وحلويات ألبان", brand: "جهينة", name: "زبادي بالتوت", trackExpiry: true, base: 9 },
  { category: "زبادي وحلويات ألبان", brand: "بيضة", name: "لبن رائب", trackExpiry: true, base: 8 },
  // Beverages
  { category: "مشروبات غازية", brand: "بيبسي", name: "بيبسي زيرو", base: 8 },
  { category: "مشروبات غازية", brand: "كوكاكولا", name: "كوكاكولا زيرو", base: 8 },
  { category: "مشروبات غازية", brand: "فانتا", name: "فانتا ليمون", base: 7 },
  { category: "مشروبات غازية", brand: "فانتا", name: "فانتا عنب", base: 7 },
  { category: "عصائر ومشروبات جاهزة", brand: "الفجر", name: "عصير برتقال بالجزر", base: 10 },
  { category: "عصائر ومشروبات جاهزة", brand: "الفجر", name: "عصير مانجو بالأناناس", base: 11 },
  { category: "عصائر ومشروبات جاهزة", brand: "المراعي", name: "عصير توت", base: 12 },
  { category: "مياه وعصائر طبيعية", brand: "أكوا", name: "مياه جازان", base: 6 },
  { category: "مياه وعصائر طبيعية", brand: "سنسيب", name: "مياه غازية", base: 8 },
  { category: "مشروبات ساخنة", brand: "العطار", name: "مشروب سخن بالفواكه", base: 20 },
  { category: "قهوة", brand: "العربي", name: "قهوة موكا", base: 35 },
  // Snacks / sweets
  { category: "مقرمشات ووجبات خفيفة", brand: "الفا", name: "سناك جبن", base: 10 },
  { category: "مقرمشات ووجبات خفيفة", brand: "أوريو", name: "شيبسي ملح", base: 8 },
  { category: "مقرمشات ووجبات خفيفة", brand: "تشيتوس", name: "سناك فلفل", base: 9 },
  { category: "شوكولاتة وحلويات", brand: "كادبوري", name: "شوكولاتة داكنة", base: 20 },
  { category: "شوكولاتة وحلويات", brand: "نستله", name: "شوكولاتة بالبندق", base: 22 },
  { category: "شوكولاتة وحلويات", brand: "الكويتية", name: "حلوى سمسم", base: 15 },
  { category: "بسكويت", brand: "السخاوي", name: "بسكويت مالح", base: 10 },
  { category: "بسكويت", brand: "الكانزو", name: "بسكويت دايجستيف", base: 14 },
  { category: "آيس كريم", brand: "المراعي", name: "آيس كريم بالبندق", trackExpiry: true, base: 35 },
  { category: "مكسرات وفواكه مجففة", brand: "الهلال", name: "فستق", base: 80 },
  { category: "مكسرات وفواكه مجففة", brand: "الهلال", name: "كاجو", base: 95 },
  { category: "مكسرات وفواكه مجففة", brand: "الهلال", name: "جوز", base: 70 },
  // Household
  { category: "منظفات المنزل", brand: "برسيل", name: "سائل تنظيف أرضيات", base: 20 },
  { category: "منظفات المنزل", brand: "دومستوس", name: "مزيل بقع", base: 25 },
  { category: "منظفات المنزل", brand: "فيري", name: "سائل غسيل أطباق", base: 15 },
  { category: "منظفات المنزل", brand: "أومو", name: "مسحوق غسيل ملون", base: 20 },
  { category: "منتجات ورقية", brand: "سانيتا", name: "مناديل مائدة", base: 10 },
  { category: "منتجات ورقية", brand: "بيريل", name: "ورق زبدة", base: 15 },
  { category: "أدوات المطبخ", brand: "إيديال", name: "أكياس سندوتشات", base: 8 },
  // Personal care
  { category: "منتجات التنظيف الشخصي", brand: "داف", name: "صابون معطر", base: 8 },
  { category: "العناية الشخصية", brand: "نيفيا", name: "مزيل عرق", base: 25 },
  { category: "العناية بالشعر", brand: "بانتين", name: "شامبو مضاد للتقصف", base: 30 },
  { category: "العناية بالأسنان", brand: "كولجيت", name: "معجون أسنان للتبييض", base: 15 },
  { category: "مستحضرات العناية بالبشرة", brand: "نيفيا", name: "غسول وجه", base: 30 },
];

/* Additional families: added in a second block so the generator still exceeds
 * the 1000-product seed target while keeping each row humanly editable. */
const EXTRA_FAMILIES_2: ExtraDef[] = [
  // Grains / staples
  { category: "أرز ومعكرونة", brand: "الهدى", name: "أرز كبسة", base: 30 },
  { category: "أرز ومعكرونة", brand: "الهدى", name: "أرز مصري مفلفل", base: 22 },
  { category: "أرز ومعكرونة", brand: "الهدى", name: "مكرونة بيني", base: 14 },
  { category: "أرز ومعكرونة", brand: "الهدى", name: "مكرونة فيتوتشيني", base: 16 },
  { category: "أرز ومعكرونة", brand: "الهدى", name: "مكرونة لازانيا", base: 18 },
  { category: "أرز وحبوب أخرى", brand: "الأمل", name: "شعيرية", base: 12 },
  { category: "أرز وحبوب أخرى", brand: "الأمل", name: "برغل ناعم", base: 15 },
  { category: "أرز وحبوب أخرى", brand: "الأمل", name: "سميد ناعم", base: 14 },
  { category: "أرز وحبوب أخرى", brand: "الأمل", name: "دقيق", base: 12 },
  { category: "أرز وحبوب أخرى", brand: "الهدى", name: "دقيق فاخر", base: 13 },
  { category: "أرز وحبوب أخرى", brand: "الهدى", name: "دقيق خبز", base: 13 },
  // Oils & fats
  { category: "زيت ودهون", brand: "الأصيل", name: "زيت فول الصويا", base: 24 },
  { category: "زيت ودهون", brand: "الفجر", name: "زيت النخيل", base: 20 },
  { category: "زيت ودهون", brand: "العصفور", name: "سمن بلدي", base: 30 },
  // Sugars & sweeteners
  { category: "سكر وحلويات", brand: "النسور", name: "سكر سكر ناعم", base: 14 },
  { category: "سكر وحلويات", brand: "الفرنساوي", name: "عسل جلوكوز", base: 16 },
  // Pulses
  { category: "بقوليات", brand: "الأمل", name: "بازلاء صفراء", base: 16 },
  { category: "بقوليات", brand: "الأمل", name: "حمص حب", base: 18 },
  { category: "بقوليات", brand: "الأمل", name: "لوبيا بيضاء", base: 17 },
  { category: "بقوليات", brand: "الأمل", name: "فول بلدي", base: 13 },
  // Spices
  { category: "بهارات وتوابل", brand: "العطار", name: "بهارات السمك", base: 18 },
  { category: "بهارات وتوابل", brand: "العطار", name: "بهارات الكبسة", base: 20 },
  { category: "بهارات وتوابل", brand: "العطار", name: "فلفل أبيض", base: 24 },
  { category: "بهارات وتوابل", brand: "العطار", name: "كمون حب", base: 10 },
  // Sauces & cans
  { category: "صوصات ومعلبات", brand: "الأهلي", name: "صلصة الشواء", base: 18 },
  { category: "صوصات ومعلبات", brand: "ويت", name: "صلصة الثوم", base: 20 },
  { category: "معلبات", brand: "الأمل", name: "ذرة معلبة", base: 16 },
  { category: "معلبات", brand: "فريش", name: "طماطم مهروسة", base: 10 },
  // Tea / coffee
  { category: "شاي وبن وسكر", brand: "العروسة", name: "شاي مشروب", base: 28 },
  { category: "قهوة", brand: "العربي", name: "قهوة كوستاريكا", base: 45 },
  { category: "مشروبات ساخنة", brand: "الشمس", name: "نسكافيه جولد", base: 40 },
  // Beverages
  { category: "مشروبات غازية", brand: "سفن أب", name: "سفن أب ليمون", base: 8 },
  { category: "مشروبات غازية", brand: "شويبس", name: "شويبس برتقال", base: 9 },
  { category: "عصائر ومشروبات جاهزة", brand: "الفجر", name: "عصير جوافة", base: 10 },
  { category: "عصائر ومشروبات جاهزة", brand: "المراعي", name: "عصير رمان", base: 14 },
  { category: "مياه وعصائر طبيعية", brand: "أكوا", name: "مياه معدنية", base: 6 },
  // Snacks
  { category: "مقرمشات ووجبات خفيفة", brand: "أوريو", name: "شيبسي جبن", base: 10 },
  { category: "مقرمشات ووجبات خفيفة", brand: "الفا", name: "سناك ملح", base: 9 },
  { category: "شوكولاتة وحلويات", brand: "كادبوري", name: "شوكولاتة فواكه", base: 22 },
  { category: "بسكويت", brand: "السخاوي", name: "بسكويت محشو بالتمر", base: 14 },
  { category: "مكسرات وفواكه مجففة", brand: "الهلال", name: "مشمش", base: 25 },
  { category: "مكسرات وفواكه مجففة", brand: "الهلال", name: "تين مجفف", base: 30 },
  // Dairy
  { category: "ألبان ومنتجات ألبان", brand: "المراعي", name: "زبادي", trackExpiry: true, base: 8 },
  { category: "ألبان ومنتجات ألبان", brand: "جهينة", name: "حليب مجفف", trackExpiry: true, base: 30 },
  { category: "أجبان", brand: "دومتي", name: "جبنة بلدية", trackExpiry: true, base: 15 },
  { category: "زبادي وحلويات ألبان", brand: "بيضة", name: "قشطة بلدي", trackExpiry: true, base: 18 },
  // Household
  { category: "منظفات المنزل", brand: "فيري", name: "سائل غسيل أدوات", base: 15 },
  { category: "منتجات ورقية", brand: "سانيتا", name: "ورق مطبخ", base: 12 },
  { category: "أدوات المطبخ", brand: "إيديال", name: "أكياس تخزين", base: 12 },
  // Personal care
  { category: "منتجات التنظيف الشخصي", brand: "لوكس", name: "صابون جل", base: 15 },
  { category: "العناية بالشعر", brand: "جونسون", name: "شامبو أطفال لطيف", base: 25 },
  { category: "العناية بالأسنان", brand: "سيجنال", name: "معجون أسنان بالنعناع", base: 14 },
  { category: "مستحضرات العناية بالبشرة", brand: "غارنييه", name: "ماسك وجه", base: 30 },
  // Café
  { category: "مشروبات ساخنة", brand: "الشمس", name: "كافيه لاتيه", base: 30 },
  { category: "قهوة", brand: "التركي", name: "قهوة بالهيل", base: 45 },
  { category: "مشروبات باردة", brand: "الليمون", name: "عصير ليمون بالماء", base: 10 },
  { category: "مشروبات باردة", brand: "الموز", name: "سموذي موز", base: 15 },
];

/* Third expansion block: pushes the catalogue past the 1200-product target. */
const EXTRA_FAMILIES_3: ExtraDef[] = [
  // Grains / rice / pasta
  { category: "أرز ومعكرونة", brand: "الهدى", name: "أرز مصري سوبر", base: 21 },
  { category: "أرز ومعكرونة", brand: "الهدى", name: "أرز بسمتي عالي الجودة", base: 34 },
  { category: "أرز ومعكرونة", brand: "الهدى", name: "مكرونة ريجاتوني", base: 15 },
  { category: "أرز ومعكرونة", brand: "الهدى", name: "مكرونة ماكروني", base: 13 },
  { category: "أرز ومعكرونة", brand: "الهدى", name: "مكرونة بلدي", base: 12 },
  { category: "أرز وحبوب أخرى", brand: "الأمل", name: "حبوب قمح", base: 12 },
  { category: "أرز وحبوب أخرى", brand: "الهدى", name: "دقيق الحلواني", base: 15 },
  { category: "حبوب وإفطار", brand: "الكويتية", name: "موسلي بالعسل", base: 42 },
  { category: "حبوب وإفطار", brand: "نستله", name: "حبوب فيتامينات", base: 30 },
  // Oils & fats
  { category: "زيت ودهون", brand: "الأصيل", name: "زيت ذرة خفيف", base: 26 },
  { category: "زيت ودهون", brand: "الفجر", name: "زيت صاف", base: 18 },
  // Sugar
  { category: "سكر وحلويات", brand: "الهندي", name: "سكر كريستال", base: 13 },
  // Pulses
  { category: "بقوليات", brand: "الأمل", name: "عدس مجروش", base: 18 },
  { category: "بقوليات", brand: "الأمل", name: "فول سوداني", base: 15 },
  { category: "بقوليات", brand: "الأمل", name: "فول أخضر", base: 22 },
  // Spices
  { category: "بهارات وتوابل", brand: "العطار", name: "توابل مكسيكية", base: 22 },
  { category: "بهارات وتوابل", brand: "العطار", name: "بهارات الملوخية", base: 12 },
  { category: "بهارات وتوابل", brand: "الأصيل", name: "ملح ثوم", base: 14 },
  // Sauces & cans
  { category: "صوصات ومعلبات", brand: "الأهلي", name: "صلصة ديميجلاس", base: 24 },
  { category: "صوصات ومعلبات", brand: "ويت", name: "صلصة البيتزا", base: 16 },
  { category: "معلبات", brand: "فريش", name: "خضار مشكلة", base: 12 },
  { category: "معلبات", brand: "الأمل", name: "كشري", base: 20 },
  // Tea & coffee
  { category: "شاي وبن وسكر", brand: "النخالة", name: "شاي بورق", base: 26 },
  { category: "قهوة", brand: "الإيطالي", name: "قهوة إسبرسو داكنة", base: 48 },
  // Beverages
  { category: "مشروبات غازية", brand: "بيبسي", name: "بيبسي مكسيكو", base: 9 },
  { category: "عصائر ومشروبات جاهزة", brand: "المراعي", name: "عصير برتقال مركز", base: 15 },
  { category: "مياه وعصائر طبيعية", brand: "السنة", name: "مياه علاجية", base: 8 },
  // Snacks & sweets
  { category: "مقرمشات ووجبات خفيفة", brand: "أوريو", name: "شيبسي ببيكر", base: 12 },
  { category: "شوكولاتة وحلويات", brand: "كادبوري", name: "شوكولاتة بالكراميل والملح", base: 24 },
  { category: "بسكويت", brand: "الكانزو", name: "بسكويت شاي سادة", base: 9 },
  { category: "مكسرات وفواكه مجففة", brand: "الهلال", name: "قراصيا", base: 20 },
  { category: "مكسرات وفواكه مجففة", brand: "الهلال", name: "تمر مجدول", base: 35 },
  { category: "مكسرات وفواكه مجففة", brand: "الهلال", name: "سيقان اللوز", base: 60 },
  // Dairy
  { category: "ألبان ومنتجات ألبان", brand: "المراعي", name: "حليب مكمل غذائي", trackExpiry: true, base: 40 },
  { category: "ألبان ومنتجات ألبان", brand: "جهينة", name: "حليب بعسل", trackExpiry: true, base: 12 },
  { category: "أجبان", brand: "المراعي", name: "جبنة حلومي", trackExpiry: true, base: 25 },
  { category: "أجبان", brand: "جهينة", name: "جبنة بالشبت", trackExpiry: true, base: 20 },
  { category: "زبادي وحلويات ألبان", brand: "المراعي", name: "زبادي بالفانيلا", trackExpiry: true, base: 9 },
  // Household
  { category: "منظفات المنزل", brand: "أومو", name: "مسحوق غسيل تلقائي", base: 20 },
  { category: "منظفات المنزل", brand: "دومستوس", name: "مطهر مرحاض", base: 18 },
  { category: "منتجات ورقية", brand: "سانيتا", name: "مناديل أطفال", base: 20 },
  { category: "أدوات المطبخ", brand: "إيديال", name: "أكياس فريزر", base: 10 },
  // Personal care
  { category: "العناية الشخصية", brand: "نيفيا", name: "كريم يدين", base: 15 },
  { category: "العناية بالشعر", brand: "بانتين", name: "بلسم ترطيب", base: 30 },
  { category: "العناية بالأسنان", brand: "كولجيت", name: "خيط أسنان", base: 15 },
  { category: "مستحضرات العناية بالبشرة", brand: "غارنييه", name: "تونر هيدرو", base: 30 },
  // More FMCG variety
  { category: "مخبوزات ومعجنات", brand: "العاصمة", name: "بسبوسة", trackExpiry: true, base: 20 },
  { category: "مخبوزات ومعجنات", brand: "العاصمة", name: "كيك شيكولاتة", trackExpiry: true, base: 25 },
  { category: "خبز", brand: "النخالة", name: "خبز بر", trackExpiry: true, base: 2 },
  { category: "معلبات لحوم وأسماك", brand: "فريش", name: "جمبري مجمد", trackExpiry: true, base: 60 },
  { category: "آيس كريم", brand: "المراعي", name: "آيس كريم ليمون", trackExpiry: true, base: 30 },
  { category: "آيس كريم", brand: "المراعي", name: "آيس كريم شوكولاتة داكنة", trackExpiry: true, base: 32 },
  // Café drinks
  { category: "مشروبات ساخنة", brand: "الشمس", name: "شاي بالحليب", base: 10 },
  { category: "قهوة", brand: "الشمس", name: "كولدة", base: 25 },
  { category: "مشروبات باردة", brand: "المانجو", name: "مانجو مكس", base: 12 },
  { category: "مشروبات باردة", brand: "التوت", name: "عصير توت مثلج", base: 10 },
];

/* Fourth expansion block: final push past the 1200-product target. */
const EXTRA_FAMILIES_4: ExtraDef[] = [
  { category: "أرز ومعكرونة", brand: "الهدى", name: "أرز عنبر", base: 33 },
  { category: "أرز ومعكرونة", brand: "الهدى", name: "أرز جازان", base: 20 },
  { category: "أرز ومعكرونة", brand: "الهدى", name: "مكرونة كرواسون", base: 14 },
  { category: "أرز وحبوب أخرى", brand: "الأمل", name: "جريش بلدي", base: 16 },
  { category: "أرز وحبوب أخرى", brand: "الهدى", name: "دقيق متعدد الاستخدام", base: 12 },
  { category: "حبوب وإفطار", brand: "الكويتية", name: "كورن فلكس بالعسل", base: 30 },
  { category: "زيت ودهون", brand: "الفجر", name: "زيت ذرة نقي", base: 25 },
  { category: "زيت ودهون", brand: "الأصيل", name: "زيت الباتن", base: 15 },
  { category: "سكر وحلويات", brand: "النسور", name: "سكر مطحون", base: 14 },
  { category: "بقوليات", brand: "الأمل", name: "عدس أصفر فاخر", base: 22 },
  { category: "بقوليات", brand: "الأمل", name: "فول مدمس طازج", base: 12 },
  { category: "بهارات وتوابل", brand: "العطار", name: "بهارات راس الحانوت", base: 24 },
  { category: "بهارات وتوابل", brand: "العطار", name: "توابل الليمون", base: 16 },
  { category: "صوصات ومعلبات", brand: "الأهلي", name: "صلصة مكرونة", base: 15 },
  { category: "صوصات ومعلبات", brand: "ويت", name: "مايونيز خفيف", base: 18 },
  { category: "معلبات", brand: "فريش", name: "فواكه معلبة", base: 18 },
  { category: "معلبات", brand: "الأمل", name: "طماطم مجففة", base: 45 },
  { category: "شاي وبن وسكر", brand: "العروسة", name: "شاي أحمر", base: 24 },
  { category: "قهوة", brand: "الإيطالي", name: "قهوة ديليب", base: 42 },
  { category: "مشروبات ساخنة", brand: "الشمس", name: "كابوتشينو", base: 25 },
  { category: "مشروبات غازية", brand: "بيبسي", name: "بيبسي ليمون", base: 8 },
  { category: "عصائر ومشروبات جاهزة", brand: "الفجر", name: "عصير كرز", base: 12 },
  { category: "مياه وعصائر طبيعية", brand: "أكوا", name: "مياه صودا", base: 7 },
  { category: "مقرمشات ووجبات خفيفة", brand: "أوريو", name: "بفك بالملح", base: 12 },
  { category: "شوكولاتة وحلويات", brand: "كادبوري", name: "شوكولاتة بيضاء", base: 20 },
  { category: "بسكويت", brand: "الكانزو", name: "بسكويت الشوفان", base: 16 },
  { category: "مكسرات وفواكه مجففة", brand: "الهلال", name: "لوز محمص", base: 70 },
  { category: "ألبان ومنتجات ألبان", brand: "المراعي", name: "كوفي ميكس", trackExpiry: true, base: 20 },
  { category: "أجبان", brand: "دومتي", name: "جبنة شيتوز", trackExpiry: true, base: 22 },
  { category: "زبادي وحلويات ألبان", brand: "جهينة", name: "زبادي بالتوت البري", trackExpiry: true, base: 10 },
  { category: "منظفات المنزل", brand: "برسيل", name: "مسحوق غسيل مكثف", base: 24 },
  { category: "منتجات ورقية", brand: "سانيتا", name: "ورق تواليت مزدوج", base: 20 },
  { category: "أدوات المطبخ", brand: "إيديال", name: "أكياس استيك", base: 8 },
  { category: "العناية بالشعر", brand: "بانتين", name: "شامبو ضد القشرة", base: 30 },
  { category: "مستحضرات العناية بالبشرة", brand: "نيفيا", name: "مرطب شفاه", base: 12 },
  { category: "مشروبات ساخنة", brand: "الشمس", name: "موكا ساخنة", base: 30 },
  { category: "قهوة", brand: "التركي", name: "قهوة بالزنجبيل", base: 40 },
  { category: "مشروبات باردة", brand: "الفراولة", name: "فراولة مكس", base: 12 },
];

/* ------------------------------------------------------------------ *
 * Generator
 * ------------------------------------------------------------------ */

/**
 * Builds the full seed bundle. Deterministic: same input -> same output.
 *
 * Expands each family's variants into individual products, assigns globally
 * unique barcodes/SKUs, sets browsing metadata (description, online visibility,
 * minimum stock) and an inventory quantity profile.
 */
export function generateStoreSeed(): SeedBundle {
  const categories = CATEGORY_DEFS.map((c) => ({
    name: c.name,
    supportsSugarOptions: c.sugar,
    productCount: 0,
  }));

  // Expand compact EXTRA_FAMILIES rows into full FamilyDefs (generated size
  // variants from the base price + any explicit extra variants).
  const expandedExtras: CategoryFamilies[] = LARGE
    ? [...EXTRA_FAMILIES, ...EXTRA_FAMILIES_2, ...EXTRA_FAMILIES_3, ...EXTRA_FAMILIES_4].reduce<CategoryFamilies[]>(
        (acc, row) => {
          const group = acc.find((g) => g.category === row.category);
          const variants: VariantDef[] = [
            ...(row.base !== undefined ? sizes(row.base) : []),
            ...(row.extra ?? []),
          ];
          const family: FamilyDef = {
            brand: row.brand,
            name: row.name,
            unit: row.unit,
            trackExpiry: row.trackExpiry,
            variants: variants.length > 0 ? variants : [{ label: "قطعة", price: 20 }],
          };
          if (group) {
            group.families.push(family);
          } else {
            acc.push({ category: row.category, families: [family] });
          }
          return acc;
        },
        [],
      )
    : [];

  const allFamilies = [...FAMILIES, ...expandedExtras];

  // Brands are the union of the curated list plus every brand actually used by
  // any family template, so the generator never fails on a brand mismatch.
  const familyBrands = allFamilies.flatMap((g) => g.families.map((f) => f.brand));
  const brands = [...new Set([...BRAND_DEFS, ...familyBrands])].map((name) => ({
    name,
  }));

  const brandSet = new Set(brands.map((b) => b.name));
  const categorySet = new Set(categories.map((c) => c.name));

  const products: SeedProduct[] = [];
  let seq = 0;

  for (const group of allFamilies) {
    if (!categorySet.has(group.category)) {
      throw new Error(`unknown category in family template: ${group.category}`);
    }
    for (const family of group.families) {
      if (!brandSet.has(family.brand)) {
        throw new Error(`unknown brand in family template: ${family.brand}`);
      }
      for (const variant of family.variants) {
        const unit = family.unit ?? "قطعة";
        const trackExpiry = family.trackExpiry ?? false;
        const online = family.online ?? true;

        // Names combine the family name + variant label + brand so they stay
        // human-friendly and unique across the catalog.
        const name = `${family.name} - ${variant.label} (${family.brand})`;

        const sellingPrice = money(variant.price);
        const purchaseCost = money(variant.price * (0.6 + ((seq % 15) + 5) / 100));

        products.push({
          name,
          barcode: makeEan13(seq),
          sku: `HM-${seq.toString().padStart(5, "0")}`,
          categoryName: group.category,
          brandName: family.brand,
          unit,
          purchaseCost,
          sellingPrice,
          minimumStock: family.minStock ?? (online ? 5 : 0),
          trackExpiry,
          onlineVisible: online,
          description: `${family.name} بجودة عالية — ${variant.label}. متوفر بسعر ${sellingPrice} جنيه مصري.`,
          initialStock: 0,
        });
        seq += 1;
      }
    }
  }

  // Assign an inventory quantity profile: ~70% healthy / ~15% low /
  // ~10% near-out / ~5% out. Only online-visible products receive stock
  // (hidden/internal items start empty). Roughly 10% of products are hidden
  // (onlineVisible=false) so the storefront does not display everything.
  products.forEach((p, i) => {
    if (i % 10 === 9) {
      p.onlineVisible = false;
      p.minimumStock = 0;
      p.initialStock = 0;
      return;
    }
    if (!p.onlineVisible || p.sellingPrice <= 0) {
      p.initialStock = 0;
      return;
    }
    const bucket = i % 20;
    if (bucket < 14) {
      p.initialStock = 30 + ((i * 37) % 220);
    } else if (bucket < 17) {
      p.initialStock = Math.max(1, p.minimumStock + 1);
    } else if (bucket < 19) {
      p.initialStock = 1;
    } else {
      p.initialStock = 0;
    }
  });

  // Update per-category product counts.
  const byCategory = new Map<string, number>();
  for (const p of products) {
    byCategory.set(p.categoryName, (byCategory.get(p.categoryName) ?? 0) + 1);
  }
  for (const c of categories) {
    c.productCount = byCategory.get(c.name) ?? 0;
  }

  return {
    categories,
    brands,
    // sort by name for readability/failure determinism
    products: products.sort((a, b) => a.name.localeCompare(b.name, "ar")),
  };
}
