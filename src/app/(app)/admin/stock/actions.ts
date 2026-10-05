"use server";

import { revalidatePath } from "next/cache";

import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type StockActionResult = { ok: true } | { ok: false; error: string };

export async function adjustStockAction(input: {
  ingredientId: string;
  qtyChange: number;
  reason: string;
}): Promise<StockActionResult> {
  const session = await getSessionContext();
  if (!session || session.role !== "manager") return { ok: false, error: "Tidak punya akses." };

  if (!Number.isFinite(input.qtyChange) || input.qtyChange === 0) {
    return { ok: false, error: "Perubahan stok tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_stock", {
    p_ingredient_id: input.ingredientId,
    p_qty_change: input.qtyChange,
    p_reason: input.reason,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/stock");
  return { ok: true };
}

export async function upsertIngredientAction(input: {
  id?: string;
  outletId?: string;
  name: string;
  unit: string;
  minStockAlert: number;
  initialStock?: number;
}): Promise<StockActionResult> {
  const session = await getSessionContext();
  if (!session || session.role !== "manager") return { ok: false, error: "Tidak punya akses." };

  const outletId = session.isMultiOutlet ? input.outletId : session.outletId;
  if (!outletId) return { ok: false, error: "Pilih outlet terlebih dahulu." };

  if (!input.name.trim() || !input.unit.trim()) {
    return { ok: false, error: "Nama dan satuan wajib diisi." };
  }

  const supabase = await createClient();

  if (input.id) {
    const { error } = await supabase
      .from("ingredients")
      .update({
        name: input.name.trim(),
        unit: input.unit.trim(),
        min_stock_alert: input.minStockAlert,
      })
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("ingredients").insert({
      outlet_id: outletId,
      name: input.name.trim(),
      unit: input.unit.trim(),
      current_stock: input.initialStock ?? 0,
      min_stock_alert: input.minStockAlert,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/stock");
  return { ok: true };
}
