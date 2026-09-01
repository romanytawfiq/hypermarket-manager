import { DEFAULT_CAFE_SUGAR, type CafeSugarLevel } from "@/lib/cafe/sugar";

/**
 * Pure helpers for the café order builder cart (Phase 7.1).
 *
 * Sugar belongs to the individual cup. `selectSugar` enforces the split rule:
 * changing the sugar of a line with quantity > 1 pulls exactly one cup off with
 * the new sugar and keeps the rest on the current sugar — so `2 × قهوة`
 * (1 سادة + 1 كراميل) becomes two distinct lines and is never a single line
 * with one sugar.
 *
 * Kept DOM-free so the behavior is directly unit-testable.
 */

export interface CafeCartLine {
  id: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  supportsSugarOptions: boolean;
  sugarLevel: CafeSugarLevel | null;
  notes: string;
}

export interface CafeCartProduct {
  id: string;
  name: string;
  unitPrice: number;
  supportsSugarOptions: boolean;
}

export function makeLineId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Merge key for identical cups: same product + same sugar. */
export function lineComboKey(line: Pick<CafeCartLine, "productId" | "sugarLevel">): string {
  return `${line.productId}|${line.sugarLevel ?? ""}`;
}

/**
 * Returns a new cart where the line `lineId` now uses `nextSugar`.
 * Quantity > 1 → split: one cup is pulled off with the new sugar, the rest keep
 * their current sugar. Different sugar never merges with another cup line.
 */
export function selectSugar(
  lines: CafeCartLine[],
  lineId: string,
  nextSugar: CafeSugarLevel,
): CafeCartLine[] {
  const target = lines.find((l) => l.id === lineId);
  if (!target || target.sugarLevel === nextSugar) return lines;

  if (target.quantity <= 1) {
    return lines.map((l) => (l.id === lineId ? { ...l, sugarLevel: nextSugar } : l));
  }

  const rest = lines.map((l) => (l.id === lineId ? { ...l, quantity: l.quantity - 1 } : l));
  return [
    ...rest,
    {
      id: makeLineId(),
      productId: target.productId,
      name: target.name,
      unitPrice: target.unitPrice,
      quantity: 1,
      supportsSugarOptions: target.supportsSugarOptions,
      sugarLevel: nextSugar,
      notes: target.notes,
    },
  ];
}

/**
 * Adds one cup of `product` to the cart. When an identical cup (same product +
 * sugar, whatever its notes) already exists, its quantity is incremented;
 * otherwise a new line is created.
 */
export function upsertLine(
  lines: CafeCartLine[],
  product: CafeCartProduct,
  sugar: CafeSugarLevel | null,
): CafeCartLine[] {
  const existing = lines.find((l) => l.productId === product.id && l.sugarLevel === sugar);
  if (existing) {
    return lines.map((l) => (l.id === existing.id ? { ...l, quantity: l.quantity + 1 } : l));
  }
  return [
    ...lines,
    {
      id: makeLineId(),
      productId: product.id,
      name: product.name,
      unitPrice: product.unitPrice,
      quantity: 1,
      supportsSugarOptions: product.supportsSugarOptions,
      sugarLevel: sugar,
      notes: "",
    },
  ];
}

/** Default sugar preselected when adding a sugar-capable product. */
export function defaultSugarFor(product: Pick<CafeCartProduct, "supportsSugarOptions">): CafeSugarLevel | null {
  return product.supportsSugarOptions ? DEFAULT_CAFE_SUGAR : null;
}