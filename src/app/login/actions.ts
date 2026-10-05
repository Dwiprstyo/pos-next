"use server";

import { verify as verifyArgon } from "@node-rs/argon2";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { defaultHomeFor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

const rateLimiter = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(key: string) {
  const now = Date.now();
  const entry = rateLimiter.get(key);

  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimiter.set(key, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_MAX;
}

export type PinLoginState = {
  error?: string;
  ok?: boolean;
  redirectTo?: string;
};

export async function pinLogin(_prev: PinLoginState, formData: FormData): Promise<PinLoginState> {
  const outletId = String(formData.get("outletId") ?? "").trim();
  const staffCode = String(formData.get("staffCode") ?? "").trim().toUpperCase();
  const pin = String(formData.get("pin") ?? "").trim();

  if (!outletId || !staffCode || !pin) {
    return { error: "Pilih outlet, isi kode staff dan PIN." };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  if (isRateLimited(`${ip}:${staffCode}`)) {
    return { error: "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi." };
  }

  const admin = createAdminClient();

  const { data: candidates, error } = await admin
    .from("staff")
    .select("id, user_id, outlet_id, role, pin_hash, failed_pin_attempts, locked_until, is_multi_outlet")
    .eq("staff_code", staffCode)
    .eq("is_active", true);

  if (error) {
    return { error: "Gagal memuat data staff." };
  }

  const staff = (candidates ?? []).find(
    (s) => s.outlet_id === outletId || (s.is_multi_outlet && s.outlet_id === null),
  );

  if (!staff) {
    return { error: "Kode staff tidak ditemukan di outlet ini." };
  }

  if (staff.locked_until && new Date(staff.locked_until) > new Date()) {
    const until = new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(
      new Date(staff.locked_until),
    );
    return { error: `Akun terkunci sampai ${until} WIB.` };
  }

  if (!staff.user_id) {
    return { error: "Staff belum diaktivasi. Hubungi manager." };
  }

  const valid = await verifyArgon(staff.pin_hash, pin).catch(() => false);

  if (!valid) {
    const attempts = (staff.failed_pin_attempts ?? 0) + 1;
    const shouldLock = attempts >= MAX_ATTEMPTS;

    await admin
      .from("staff")
      .update({
        failed_pin_attempts: shouldLock ? 0 : attempts,
        locked_until: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      })
      .eq("id", staff.id);

    await admin.from("audit_logs").insert({
      staff_id: staff.id,
      outlet_id: staff.outlet_id,
      action: "auth.pin_failed",
      metadata: { attempts, ip },
    });

    return {
      error: shouldLock
        ? `PIN salah ${MAX_ATTEMPTS}x. Akun terkunci ${LOCK_MINUTES} menit.`
        : `PIN salah. Sisa ${MAX_ATTEMPTS - attempts} percobaan.`,
    };
  }

  await admin
    .from("staff")
    .update({ failed_pin_attempts: 0, locked_until: null })
    .eq("id", staff.id);

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(staff.user_id);

  if (userError || !userData.user?.email) {
    return { error: "Akun auth staff tidak valid. Hubungi manager." };
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });

  if (linkError || !link.properties?.hashed_token) {
    return { error: "Gagal membuat sesi login." };
  }

  const supabase = await createClient();
  const { error: otpError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });

  if (otpError) {
    return { error: "Gagal membuat sesi login." };
  }

  await admin.from("audit_logs").insert({
    staff_id: staff.id,
    outlet_id: staff.outlet_id,
    action: "auth.login",
    metadata: { ip },
  });

  return { ok: true, redirectTo: defaultHomeFor(staff.role as "cashier" | "kitchen" | "manager") };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
