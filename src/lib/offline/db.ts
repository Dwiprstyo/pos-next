"use client";

import Dexie, { type EntityTable } from "dexie";

export type QueuedOrderItem = {
  menu_item_id: string;
  qty: number;
  notes?: string | null;
  variant_option_ids?: string[];
};

export type QueuedOrder = {
  clientId: string;
  tableId: string | null;
  orderType: "dine_in" | "takeaway";
  items: QueuedOrderItem[];
  createdAt: number;
  status: "pending" | "failed";
  error?: string;
  attempts: number;
};

const db = new Dexie("pos-kds") as Dexie & {
  queuedOrders: EntityTable<QueuedOrder, "clientId">;
};

db.version(1).stores({
  queuedOrders: "clientId, createdAt, status",
});

export { db };

export async function enqueueOrder(order: QueuedOrder) {
  await db.queuedOrders.put(order);
}

export async function listQueuedOrders() {
  return db.queuedOrders.orderBy("createdAt").toArray();
}

export async function removeQueuedOrder(clientId: string) {
  await db.queuedOrders.delete(clientId);
}

export async function markQueuedOrderFailed(clientId: string, error: string) {
  const order = await db.queuedOrders.get(clientId);
  if (!order) return;
  await db.queuedOrders.update(clientId, {
    status: "failed",
    error,
    attempts: order.attempts + 1,
  });
}
