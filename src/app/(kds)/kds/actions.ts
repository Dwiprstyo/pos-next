"use server";

import { revalidatePath } from "next/cache";

import { getSessionContext } from "@/lib/auth";
import type { KdsItem } from "@/lib/pos-types";
import { createClient } from "@/lib/supabase/server";

export async function advanceKitchenStatus(
  itemId: string,
  next: "cooking" | "ready" | "served",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesi berakhir." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_kitchen_status", {
    p_order_item_id: itemId,
    p_new_status: next,
  });

  if (error) {
    if (error.message.includes("invalid_transition")) return { ok: false, error: "Status tidak valid." };
    if (error.message.includes("not_authorized")) return { ok: false, error: "Tidak punya akses." };
    return { ok: false, error: error.message };
  }

  revalidatePath("/kds");
  return { ok: true };
}

export async function fetchKdsItems(): Promise<KdsItem[]> {
  const session = await getSessionContext();
  if (!session) return [];

  const supabase = await createClient();
  let query = supabase
    .from("kds_order_items_view")
    .select("*")
    .order("order_created_at", { ascending: true })
    .order("item_created_at", { ascending: true });

  if (session.outletId) {
    query = query.eq("outlet_id", session.outletId);
  }

  const { data, error } = await query;

  if (error) return [];

  return (data ?? []) as unknown as KdsItem[];
}
