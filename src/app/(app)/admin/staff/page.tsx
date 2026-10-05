import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { StaffClient } from "./staff-client";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const session = await requireRole(["manager"]);
  const supabase = await createClient();

  const staffQuery = supabase
    .from("staff")
    .select("id, staff_code, full_name, role, outlet_id, is_multi_outlet, is_active, locked_until, outlets(name)")
    .order("full_name");

  const [{ data: staff }, { data: outlets }] = await Promise.all([
    session.isMultiOutlet ? staffQuery : staffQuery.eq("outlet_id", session.outletId ?? ""),
    session.isMultiOutlet
      ? supabase.from("outlets").select("id, name").eq("is_active", true).order("name")
      : supabase.from("outlets").select("id, name").eq("id", session.outletId ?? ""),
  ]);

  return (
    <StaffClient
      staff={staff ?? []}
      outlets={outlets ?? []}
      isMultiOutlet={session.isMultiOutlet}
      currentStaffId={session.staffId}
    />
  );
}
