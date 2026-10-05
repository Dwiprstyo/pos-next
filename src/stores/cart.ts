"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { CartLine, MenuItem, OrderItemPayload, VariantOption } from "@/lib/pos-types";

type CartState = {
  tableId: string | null;
  orderType: "dine_in" | "takeaway";
  appendOrderId: string | null;
  lines: CartLine[];
  setTable: (tableId: string | null) => void;
  setOrderType: (orderType: "dine_in" | "takeaway") => void;
  setAppendOrder: (orderId: string | null) => void;
  setLines: (lines: CartLine[]) => void;
  addLine: (item: MenuItem, variants: VariantOption[], qty?: number, notes?: string) => void;
  updateQty: (key: string, qty: number) => void;
  updateNotes: (key: string, notes: string) => void;
  removeLine: (key: string) => void;
  clear: () => void;
  toPayload: () => OrderItemPayload[];
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      tableId: null,
      orderType: "dine_in",
      appendOrderId: null,
      lines: [],

      setTable: (tableId) => set({ tableId }),
      setOrderType: (orderType) =>
        set((state) => ({ orderType, tableId: orderType === "takeaway" ? null : state.tableId })),
      setAppendOrder: (appendOrderId) => set({ appendOrderId }),
      setLines: (lines) => set({ lines }),

      addLine: (item, variants, qty = 1, notes = "") =>
        set((state) => {
          const variantKey = variants
            .map((v) => v.id)
            .sort()
            .join("|");
          const existing = state.lines.find(
            (line) =>
              line.menuItemId === item.id &&
              line.variants
                .map((v) => v.optionId)
                .sort()
                .join("|") === variantKey &&
              line.notes === notes,
          );

          if (existing) {
            return {
              lines: state.lines.map((line) =>
                line.key === existing.key ? { ...line, qty: line.qty + qty } : line,
              ),
            };
          }

          const line: CartLine = {
            key: crypto.randomUUID(),
            menuItemId: item.id,
            name: item.name,
            basePrice: item.base_price,
            station: item.station,
            qty,
            notes,
            variants: variants.map((variant) => ({
              optionId: variant.id,
              groupName: "",
              name: variant.name,
              extraPrice: variant.extra_price,
            })),
          };

          return { lines: [...state.lines, line] };
        }),

      updateQty: (key, qty) =>
        set((state) => ({
          lines:
            qty <= 0
              ? state.lines.filter((line) => line.key !== key)
              : state.lines.map((line) => (line.key === key ? { ...line, qty } : line)),
        })),

      updateNotes: (key, notes) =>
        set((state) => ({
          lines: state.lines.map((line) => (line.key === key ? { ...line, notes } : line)),
        })),

      removeLine: (key) => set((state) => ({ lines: state.lines.filter((line) => line.key !== key) })),

      clear: () => set({ lines: [], tableId: null, appendOrderId: null }),

      toPayload: () =>
        get().lines.map((line) => ({
          menu_item_id: line.menuItemId,
          qty: line.qty,
          notes: line.notes || null,
          variant_option_ids: line.variants.map((variant) => variant.optionId),
        })),
    }),
    {
      name: "pos-cart",
      partialize: (state) => ({
        tableId: state.tableId,
        orderType: state.orderType,
        appendOrderId: state.appendOrderId,
        lines: state.lines,
      }),
    },
  ),
);

export function lineUnitPrice(line: CartLine) {
  return line.basePrice + line.variants.reduce((sum, variant) => sum + variant.extraPrice, 0);
}

export function cartSubtotal(lines: CartLine[]) {
  return lines.reduce((sum, line) => sum + lineUnitPrice(line) * line.qty, 0);
}
