"use client";

import { CreditCard, PlusCircle, Receipt } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime, rupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

type OrderItem = {
  id: string;
  name: string;
  qty: number;
  kitchen_status: "new" | "cooking" | "ready" | "served";
  notes: string | null;
};

type OpenOrder = {
  id: string;
  order_number: number;
  order_type: "dine_in" | "takeaway";
  total: number;
  created_at: string;
  table_id: string | null;
  table_label: string | null;
  items: OrderItem[];
};

const KITCHEN_LABEL: Record<OrderItem["kitchen_status"], string> = {
  new: "Baru",
  cooking: "Dimasak",
  ready: "Siap",
  served: "Disajikan",
};

export function OrdersClient({ orders }: { orders: OpenOrder[] }) {
  const [filter, setFilter] = useState<"all" | "dine_in" | "takeaway">("all");

  const filtered = useMemo(
    () => orders.filter((order) => filter === "all" || order.order_type === filter),
    [orders, filter],
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Pesanan Berjalan</h1>
          <p className="text-sm text-muted-foreground">
            {orders.length} order belum dibayar. Bisa tambah item atau langsung bayar.
          </p>
        </div>
        <div className="flex gap-2">
          {(
            [
              { value: "all", label: "Semua" },
              { value: "dine_in", label: "Dine-in" },
              { value: "takeaway", label: "Takeaway" },
            ] as const
          ).map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={filter === option.value ? "default" : "outline"}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
            <Receipt className="size-6" />
            <p className="text-sm">Tidak ada pesanan berjalan.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((order) => {
            const served = order.items.filter((item) => item.kitchen_status === "served").length;
            return (
              <Card key={order.id} data-testid="open-order-card">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>#{order.order_number}</span>
                    <Badge variant={order.table_label ? "default" : "secondary"}>
                      {order.table_label
                        ? `Meja ${order.table_label}`
                        : order.order_type === "dine_in"
                          ? "Tanpa meja"
                          : "Takeaway"}
                    </Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(order.created_at)} • {order.items.length} item • {served} disajikan
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-1 text-sm">
                    {order.items.slice(0, 5).map((item) => (
                      <li key={item.id} className="flex items-start justify-between gap-2">
                        <span>
                          {item.qty}× {item.name}
                          {item.notes ? (
                            <span className="block text-xs italic text-muted-foreground">{item.notes}</span>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-xs",
                            item.kitchen_status === "served" ? "text-status-empty" : "text-muted-foreground",
                          )}
                        >
                          {KITCHEN_LABEL[item.kitchen_status]}
                        </span>
                      </li>
                    ))}
                    {order.items.length > 5 ? (
                      <li className="text-xs text-muted-foreground">+{order.items.length - 5} item lainnya</li>
                    ) : null}
                  </ul>

                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="font-semibold">{rupiah(order.total)}</span>
                    <div className="flex gap-2">
                      <Link
                        href={`/pos?order=${order.id}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        <PlusCircle className="size-4" />
                        Tambah Item
                      </Link>
                      <Link
                        href={`/pos/checkout?order=${order.id}`}
                        className={buttonVariants({ size: "sm" })}
                      >
                        <CreditCard className="size-4" />
                        Bayar
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
