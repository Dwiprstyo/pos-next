import { requireRole } from "@/lib/auth";
import type { KdsItem } from "@/lib/pos-types";
import { createClient } from "@/lib/supabase/server";

import { KdsBoard } from "./kds-board";

export const dynamic = "force-dynamic";

export default async function KdsPage() {
  const session = await requireRole(["kitchen", "manager"]);
  const supabase = await createClient();

  let query = supabase
    .from("kds_order_items_view")
    .select("*")
    .order("order_created_at", { ascending: true })
    .order("item_created_at", { ascending: true });

  if (session.outletId) {
    query = query.eq("outlet_id", session.outletId);
  }

  const { data } = await query;

  return (
    <KdsBoard
      initialItems={(data ?? []) as unknown as KdsItem[]}
      outletId={session.outletId}
      staffName={session.fullName}
      outletName={session.outletName}
    />
  );
}
