"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Guest online-store cart (Phase 9).
 *
 * Client-only, transient state persisted to localStorage so the cart survives
 * navigation and a refresh. It stores ONLY product id + quantity + a display
 * price for UX; every price/total is recomputed server-side at checkout and is
 * never trusted. Availability/cart-max are validated again on the server.
 */
export interface CartLine {
  productId: string;
  quantity: number;
  /** Server-derived display unit price (for UX only). */
  unitPrice: number;
  name: string;
  unit: string;
  available: number;
}

interface CartState {
  lines: CartLine[];
  add: (line: Omit<CartLine, "quantity">, qty?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (line, qty = 1) =>
        set((state) => {
          const existing = state.lines.find((l) => l.productId === line.productId);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.productId === line.productId
                  ? { ...l, quantity: Math.min(l.quantity + qty, line.available) }
                  : l,
              ),
            };
          }
          return {
            lines: [...state.lines, { ...line, quantity: Math.min(qty, line.available) }],
          };
        }),
      setQuantity: (productId, quantity) =>
        set((state) => ({
          lines: state.lines.map((l) =>
            l.productId === productId
              ? { ...l, quantity: Math.max(1, Math.min(quantity, l.available)) }
              : l,
          ),
        })),
      remove: (productId) =>
        set((state) => ({ lines: state.lines.filter((l) => l.productId !== productId) })),
      clear: () => set({ lines: [] }),
    }),
    { name: "nexa-store-cart" },
  ),
);

/** Subtotal of the current cart (UX only; server recomputes at checkout). */
export function cartSubtotal(lines: CartLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) * 100) / 100;
}