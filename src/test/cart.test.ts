import { describe, it, expect } from "vitest";
import {
  selectSugar,
  upsertLine,
  defaultSugarFor,
  type CafeCartLine,
} from "@/lib/cafe/cart";
import type { CafeSugarLevel } from "@/lib/cafe/sugar";

function line(overrides: Partial<CafeCartLine> & { id: string; productId: string; quantity: number }): CafeCartLine {
  return {
    name: "قهوة تركية",
    unitPrice: 25,
    supportsSugarOptions: true,
    sugarLevel: "STANDARD",
    notes: "",
    ...overrides,
  };
}

describe("café cart per-cup sugar logic (Phase 7.1)", () => {
  it("changes the sugar of a single-cup line in place", () => {
    const result = selectSugar(
      [line({ id: "a", productId: "p1", quantity: 1, sugarLevel: "STANDARD" })],
      "a",
      "CARAMEL",
    );
    expect(result[0]!.sugarLevel).toBe("CARAMEL");
    expect(result[0]!.quantity).toBe(1);
    expect(selectSugar([line({ id: "a", productId: "p1", quantity: 1, sugarLevel: "STANDARD" })], "a", "STANDARD")).toHaveLength(1);
  });

  it("splits one cup off when sugar changes on a quantity > 1 line", () => {
    const before = [line({ id: "a", productId: "p1", quantity: 2, sugarLevel: "STANDARD" })];
    const after = selectSugar(before, "a", "PLAIN");
    expect(after).toHaveLength(2);

    const original = after.find((l) => l.id === "a")!;
    const split = after.find((l) => l.id !== "a")!;
    expect(original.quantity).toBe(1);
    expect(original.sugarLevel).toBe("STANDARD");
    expect(split.quantity).toBe(1);
    expect(split.sugarLevel).toBe("PLAIN");
    expect(split.productId).toBe("p1");
  });

  it("splits one cup at a time (2 remaining cups keep their sugar when one moves)", () => {
    const before = [line({ id: "a", productId: "p1", quantity: 3, sugarLevel: "STANDARD" })];
    const after = selectSugar(before, "a", "EXTRA");
    expect(after).toHaveLength(2);
    expect(after.find((l) => l.id === "a")!.quantity).toBe(2);
    expect(after.find((l) => l.id !== "a")!.quantity).toBe(1);
  });

  it("keeps the line's customization when splitting", () => {
    const before = [line({ id: "a", productId: "p1", quantity: 3, sugarLevel: "STANDARD", notes: "حليب" })];
    const after = selectSugar(before, "a", "PLAIN");
    expect(after.find((l) => l.id !== "a")!.notes).toBe("حليب");
  });

  it("upsertLine increments an existing identical cup (same product + sugar)", () => {
    const before = [line({ id: "a", productId: "p1", quantity: 1, sugarLevel: "STANDARD" })];
    const after = upsertLine(before, { id: "p1", name: "قهوة تركية", unitPrice: 25, supportsSugarOptions: true }, "STANDARD");
    expect(after).toHaveLength(1);
    expect(after[0]!.quantity).toBe(2);
  });

  it("upsertLine creates a new line for a different sugar (never merges)", () => {
    const before = [line({ id: "a", productId: "p1", quantity: 1, sugarLevel: "STANDARD" })];
    const after = upsertLine(before, { id: "p1", name: "قهوة تركية", unitPrice: 25, supportsSugarOptions: true }, "CARAMEL");
    expect(after).toHaveLength(2);
    expect(after.map((l) => l.sugarLevel)).toEqual(["STANDARD", "CARAMEL"]);
    expect(after[0]!.quantity).toBe(1);
    expect(after[1]!.quantity).toBe(1);
  });

  it("default sugar preselects STANDARD for sugar-capable products and null otherwise", () => {
    expect(defaultSugarFor({ supportsSugarOptions: true })).toBe("STANDARD" as CafeSugarLevel);
    expect(defaultSugarFor({ supportsSugarOptions: false })).toBeNull();
  });
});