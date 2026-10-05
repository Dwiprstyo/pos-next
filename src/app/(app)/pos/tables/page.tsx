import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { TablesClient } from "./tables-client";

export const dynamic = "force-dynamic";

export default async function TablesPage() {
  const session = await requireRole(["cashier", "manager"]);
  const supabase = await createClient();

  const { data: tables } = await supabase
    .from("dining_tables")
    .select("id, label, status, current_order_id")
    .eq("outlet_id", session.outletId ?? "00000000-0000-0000-0000-000000000000")
    .order("label");

  const orderIds = (tables ?? [])
    .map((table) => table.current_order_id)
    .filter((id): id is string => Boolean(id));

  const { data: orders } = orderIds.length
    ? await supabase
        .from("orders")
        .select("id, order_number, total, created_at, status")
        .in("id", orderIds)
    : { data: [] };

  return <TablesClient tables={tables ?? []} orders={orders ?? []} />;
}
