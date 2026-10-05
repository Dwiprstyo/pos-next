import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { OutletsClient } from "./outlets-client";

export const dynamic = "force-dynamic";

export default async function AdminOutletsPage() {
  const session = await requireRole(["manager"]);
  if (!session.isMultiOutlet) redirect("/admin/reports");

  const supabase = await createClient();
  const { data: outlets } = await supabase
    .from("outlets")
    .select("id, name, address, tax_percent, service_charge_percent, discount_approval_threshold, is_active")
    .order("name");

  return <OutletsClient outlets={outlets ?? []} />;
}
