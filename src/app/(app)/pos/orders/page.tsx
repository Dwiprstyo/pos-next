import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { OrdersClient } from "./orders-client";

export const dynamic = "force-dynamic";

export default async function OpenOrdersPage() {
  const session = await requireRole(["cashier", "manager"]);
  if (!session.outletId) redirect("/admin/reports");

  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, order_number, order_type, total, created_at, table_id, dining_tables!orders_table_id_fkey(label), order_items(id, menu_name, qty, kitchen_status, notes)",
    )
    .eq("outlet_id", session.outletId)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  return (
    <OrdersClient
      orders={(orders ?? []).map((order) => {
        const table = Array.isArray(order.dining_tables) ? order.dining_tables[0] : order.dining_tables;
        return {
          id: order.id,
          order_number: order.order_number,
          order_type: order.order_type,
          total: Number(order.total),
          created_at: order.created_at,
          table_id: order.table_id,
          table_label: table?.label ?? null,
          items: (order.order_items ?? []).map((item) => ({
            id: item.id,
            name: item.menu_name,
            qty: item.qty,
            kitchen_status: item.kitchen_status,
            notes: item.notes,
          })),
        };
      })}
    />
  );
}
