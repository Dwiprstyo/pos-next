"use server";

import { hash as hashArgon } from "@node-rs/argon2";
import { revalidatePath } from "next/cache";

import { getSessionContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type StaffActionResult = { ok: true } | { ok: false; error: string };

async function managerSession() {
  const session = await getSessionContext();
  if (!session || session.role !== "manager") return null;
  return session;
}

function hashPin(pin: string) {
  return hashArgon(pin, { algorithm: 2 });
}

export async function createStaffAction(input: {
  fullName: string;
  staffCode: string;
  role: "cashier" | "kitchen" | "manager";
  outletId: string | null;
  pin: string;
  isMultiOutlet: boolean;
}): Promise<StaffActionResult> {
  const session = await managerSession();
  if (!session) return { ok: false, error: "Tidak punya akses." };

  if (!input.fullName.trim() || !input.staffCode.trim()) {
    return { ok: false, error: "Nama dan kode staff wajib diisi." };
  }
  if (input.pin.length < 4) return { ok: false, error: "PIN minimal 4 digit." };

  const outletId = session.isMultiOutlet ? input.outletId : session.outletId;
  if (!outletId && !input.isMultiOutlet) {
    return { ok: false, error: "Pilih outlet untuk staff ini." };
  }

  const admin = createAdminClient();
  const email = input.isMultiOutlet
    ? `${input.staffCode.toLowerCase()}@owner.internal`
    : `${input.staffCode.toLowerCase()}-${(outletId ?? "x").slice(0, 8)}@outlet.internal`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: crypto.randomUUID(),
  });

  if (createError || !created.user) {
    return { ok: false, error: createError?.message ?? "Gagal membuat akun staff." };
  }

  const pinHash = await hashPin(input.pin);

  const { error } = await admin.from("staff").insert({
    user_id: created.user.id,
    outlet_id: input.isMultiOutlet ? null : outletId,
    staff_code: input.staffCode.trim().toUpperCase(),
    full_name: input.fullName.trim(),
    role: input.role,
    pin_hash: pinHash,
    is_multi_outlet: input.isMultiOutlet,
  });

  if (error) {
    await admin.auth.admin.deleteUser(created.user.id);
    if (error.message.includes("duplicate")) return { ok: false, error: "Kode staff sudah dipakai." };
    return { ok: false, error: error.message };
  }

  await admin.from("audit_logs").insert({
    staff_id: session.staffId,
    outlet_id: outletId,
    action: "staff.create",
    entity_type: "staff",
    metadata: { staff_code: input.staffCode, role: input.role },
  });

  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function updateStaffAction(input: {
  id: string;
  fullName: string;
  role: "cashier" | "kitchen" | "manager";
  isActive: boolean;
}): Promise<StaffActionResult> {
  const session = await managerSession();
  if (!session) return { ok: false, error: "Tidak punya akses." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff")
    .update({
      full_name: input.fullName.trim(),
      role: input.role,
      is_active: input.isActive,
    })
    .eq("id", input.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function resetPinAction(staffId: string, pin: string): Promise<StaffActionResult> {
  const session = await managerSession();
  if (!session) return { ok: false, error: "Tidak punya akses." };
  if (pin.length < 4) return { ok: false, error: "PIN minimal 4 digit." };

  const admin = createAdminClient();
  const pinHash = await hashPin(pin);

  const { error } = await admin
    .from("staff")
    .update({ pin_hash: pinHash, failed_pin_attempts: 0, locked_until: null })
    .eq("id", staffId);

  if (error) return { ok: false, error: error.message };

  await admin.from("audit_logs").insert({
    staff_id: session.staffId,
    outlet_id: session.outletId,
    action: "staff.reset_pin",
    entity_type: "staff",
    entity_id: staffId,
  });

  revalidatePath("/admin/staff");
  return { ok: true };
}
