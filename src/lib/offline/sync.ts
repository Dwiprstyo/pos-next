"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { listQueuedOrders, markQueuedOrderFailed, removeQueuedOrder } from "./db";

export type FlushResult = {
  synced: number;
  failed: number;
};

export async function flushOrderQueue(
  supabase: SupabaseClient<Database>,
): Promise<FlushResult> {
  const queued = await listQueuedOrders();
  let synced = 0;
  let failed = 0;

  for (const order of queued) {
    const { error } = await supabase.rpc("create_order", {
      p_client_id: order.clientId,
      p_table_id: (order.tableId ?? null) as unknown as string,
      p_order_type: order.orderType,
      p_items: order.items as unknown as Database["public"]["Functions"]["create_order"]["Args"]["p_items"],
    });

    if (error) {
      failed += 1;
      await markQueuedOrderFailed(order.clientId, error.message);
    } else {
      synced += 1;
      await removeQueuedOrder(order.clientId);
    }
  }

  return { synced, failed };
}
