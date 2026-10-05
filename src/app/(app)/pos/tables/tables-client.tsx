"use client";

import { CreditCard, PlusCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { rupiah, formatTime } from "@/lib/format";
import type { DiningTable } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

type OrderSummary = {
  id: string;
  order_number: number;
  total: number;
  created_at: string;
  status: "open" | "paid" | "void";
};

const STATUS_STYLES: Record<DiningTable["status"], string> = {
  empty: "border-status-empty/40 bg-status-empty/10",
  occupied: "border-status-occupied/40 bg-status-occupied/10",
  unpaid: "border-status-unpaid/50 bg-status-unpaid/15",
};

const STATUS_LABEL: Record<DiningTable["status"], string> = {
  empty: "Kosong",
  occupied: "Terisi",
  unpaid: "Belum Bayar",
};

export function TablesClient({
  tables,
  orders,
}: {
  tables: DiningTable[];
  orders: OrderSummary[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<DiningTable | null>(null);
  const order = orders.find((candidate) => candidate.id === selected?.current_order_id);

  function handleClick(table: DiningTable) {
    if (table.status === "empty" || !table.current_order_id) {
      router.push(`/pos?table=${table.id}`);
      return;
    }
    setSelected(table);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Floor Plan</h1>
        <div className="flex gap-2 text-xs">
          {(["empty", "occupied", "unpaid"] as const).map((status) => (
            <span key={status} className="flex items-center gap-1">
              <span className={cn("size-3 rounded-full border", STATUS_STYLES[status])} />
              {STATUS_LABEL[status]}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tables.map((table) => (
          <button
            key={table.id}
            type="button"
            onClick={() => handleClick(table)}
            className={cn(
              "flex min-h-28 flex-col items-start justify-between rounded-xl border-2 p-4 text-left transition hover:shadow-md",
              STATUS_STYLES[table.status],
            )}
          >
            <span className="text-2xl font-bold">{table.label}</span>
            <Badge variant="outline">{STATUS_LABEL[table.status]}</Badge>
          </button>
        ))}
        {tables.length === 0 ? (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
            Belum ada meja untuk outlet ini.
          </p>
        ) : null}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Meja {selected?.label}</DialogTitle>
            <DialogDescription>
              {order
                ? `Pesanan #${order.order_number} • ${formatTime(order.created_at)} • ${rupiah(order.total)}`
                : "Pesanan sedang dimuat..."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                if (!selected) return;
                router.push(`/pos?table=${selected.id}&order=${selected.current_order_id}`);
              }}
            >
              <PlusCircle className="size-4" />
              Tambah item
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                if (!selected?.current_order_id) return;
                router.push(`/pos/checkout?order=${selected.current_order_id}`);
              }}
            >
              <CreditCard className="size-4" />
              Bayar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
