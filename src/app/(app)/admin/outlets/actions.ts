"use server";

import { revalidatePath } from "next/cache";

import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type OutletActionResult = { ok: true } | { ok: false; error: string };

export async function upsertOutletAction(input: {
  id?: string;
  name: string;
  address: string;
  taxPercent: number;
  serviceChargePercent: number;
  discountApprovalThreshold: number;
  isActive: boolean;
}): Promise<OutletActionResult> {
  const session = await getSessionContext();
  if (!session?.isMultiOutlet) return { ok: false, error: "Hanya owner yang bisa mengelola outlet." };
  if (!input.name.trim()) return { ok: false, error: "Nama outlet wajib diisi." };

  const supabase = await createClient();
  const payload = {
    name: input.name.trim(),
    address: input.address.trim() || null,
    tax_percent: input.taxPercent,
    service_charge_percent: input.serviceChargePercent,
    discount_approval_threshold: input.discountApprovalThreshold,
    is_active: input.isActive,
  };

  const { error } = input.id
    ? await supabase.from("outlets").update(payload).eq("id", input.id)
    : await supabase.from("outlets").insert(payload);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/outlets");
  return { ok: true };
}
