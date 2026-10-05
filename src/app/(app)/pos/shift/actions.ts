"use server";

import { revalidatePath } from "next/cache";

import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ShiftActionResult =
  | { ok: true; shiftId: string }
  | { ok: false; error: string };

function friendly(message: string) {
  if (message.includes("invalid_opening_cash")) return "Kas awal tidak valid.";
  if (message.includes("not_authorized")) return "Tidak punya akses.";
  if (message.includes("shift_not_found")) return "Shift tidak ditemukan.";
  return message;
}

export async function openShiftAction(openingCash: number): Promise<ShiftActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesi berakhir." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_shift", { p_opening_cash: openingCash });

  if (error) return { ok: false, error: friendly(error.message) };

  revalidatePath("/pos");
  revalidatePath("/pos/shift");
  return { ok: true, shiftId: data.id };
}

export async function closeShiftAction(
  shiftId: string,
  actualCash: number,
): Promise<ShiftActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesi berakhir." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_shift", {
    p_shift_id: shiftId,
    p_closing_cash_actual: actualCash,
  });

  if (error) return { ok: false, error: friendly(error.message) };

  revalidatePath("/pos");
  revalidatePath("/pos/shift");
  return { ok: true, shiftId: data.id };
}
