import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type AppRole = "cashier" | "kitchen" | "manager";

export type SessionContext = {
  userId: string;
  staffId: string;
  role: AppRole;
  outletId: string | null;
  isMultiOutlet: boolean;
  fullName: string;
  staffCode: string;
  outletName: string | null;
};

export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();

  // getClaims verifies the JWT locally when the project uses asymmetric signing
  // keys (no auth-server round trip); falls back to getUser otherwise.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) return null;

  const { data: staff } = await supabase
    .from("staff")
    .select("id, full_name, staff_code, role, outlet_id, is_multi_outlet, outlets(name)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (!staff) return null;

  const outlet = Array.isArray(staff.outlets) ? staff.outlets[0] : staff.outlets;

  return {
    userId,
    staffId: staff.id,
    role: staff.role as AppRole,
    outletId: staff.outlet_id,
    isMultiOutlet: staff.is_multi_outlet,
    fullName: staff.full_name,
    staffCode: staff.staff_code,
    outletName: outlet?.name ?? null,
  };
});

export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  return session;
}

export async function requireRole(roles: AppRole[]): Promise<SessionContext> {
  const session = await requireSession();
  if (!roles.includes(session.role)) redirect(defaultHomeFor(session.role));
  return session;
}

export function defaultHomeFor(role: AppRole) {
  if (role === "kitchen") return "/kds";
  if (role === "cashier") return "/pos";
  return "/admin/reports";
}
