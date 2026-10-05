"use server";

import { revalidatePath } from "next/cache";

import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function refreshReportsAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSessionContext();
  if (!session || session.role !== "manager") return { ok: false, error: "Tidak punya akses." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("refresh_daily_sales_summary");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/reports");
  return { ok: true };
}
