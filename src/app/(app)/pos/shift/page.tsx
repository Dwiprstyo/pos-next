import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { ShiftClient } from "./shift-client";

export const dynamic = "force-dynamic";

export default async function ShiftPage() {
  const session = await requireRole(["cashier", "manager"]);
  const supabase = await createClient();

  const { data: shift } = await supabase
    .from("shifts")
    .select("id, opened_at, opening_cash, closed_at")
    .eq("staff_id", session.staffId)
    .is("closed_at", null)
    .maybeSingle();

  let summary = null;

  if (shift) {
    const { data } = await supabase.rpc("shift_summary", { p_shift_id: shift.id });
    summary = data?.[0] ?? null;
  }

  return (
    <ShiftClient
      shift={shift}
      summary={summary}
      staffName={session.fullName}
      outletName={session.outletName}
    />
  );
}
