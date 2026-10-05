"use client";

import { Loader2, Minus, Plus, Search, Send, Trash2, Wallet, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LandscapeHint } from "@/components/landscape-hint";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { rupiah } from "@/lib/format";
import { enqueueOrder } from "@/lib/offline/db";
import { flushOrderQueue } from "@/lib/offline/sync";
import type { CartLine, DiningTable, MenuCategory, MenuItem } from "@/lib/pos-types";
import { createClient } from "@/lib/supabase/client";
import { cartSubtotal, lineUnitPrice, useCartStore } from "@/stores/cart";
import { cn } from "@/lib/utils";

import { createOrderAction } from "./actions";

type OutletConfig = {
  id: string;
  name: string;
  tax_percent: number;
  service_charge_percent: number;
  discount_approval_threshold: number;
};

type AppendOrder = {
  id: string;
  order_number: number;
  order_type: "dine_in" | "takeaway";
  table_id: string | null;
};

export function PosClient({
  categories,
  items,
  tables,
  outlet,
  initialTableId,
  appendOrder,
  initialLines,
}: {
  categories: MenuCategory[];
  items: MenuItem[];
  tables: DiningTable[];
  outlet: OutletConfig;
  initialTableId: string | null;
  appendOrder: AppendOrder | null;
  initialLines: CartLine[];
}) {
  const router = useRouter();
  const {
    lines,
    tableId,
    orderType,
    appendOrderId,
    setTable,
    setOrderType,
    setAppendOrder,
    setLines,
    addLine,
    updateQty,
    updateNotes,
    removeLine,
    clear,
    toPayload,
  } = useCartStore();

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [variantItem, setVariantItem] = useState<MenuItem | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [variantQty, setVariantQty] = useState(1);
  const [variantNotes, setVariantNotes] = useState("");

  useEffect(() => {
    if (appendOrder) {
      setAppendOrder(appendOrder.id);
      setOrderType(appendOrder.order_type);
      setTable(appendOrder.table_id);
      setLines(initialLines);
    } else if (initialTableId) {
      setAppendOrder(null);
      setLines([]);
      setTable(initialTableId);
      setOrderType("dine_in");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appendOrder?.id, initialTableId]);

  useEffect(() => {
    const supabase = createClient();
    const flush = async () => {
      const result = await flushOrderQueue(supabase);
      if (result.synced > 0) {
        toast.success(`${result.synced} pesanan offline berhasil disinkronkan`);
        router.refresh();
      }
    };
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [router]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (activeCategory !== "all" && item.category_id !== activeCategory) return false;
      if (query && !item.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [items, activeCategory, search]);

  const subtotal = cartSubtotal(lines);
  const serviceCharge = (subtotal * Number(outlet.service_charge_percent)) / 100;
  const tax = (subtotal * Number(outlet.tax_percent)) / 100;
  const total = subtotal + serviceCharge + tax;

  function handleMenuClick(item: MenuItem) {
    if (item.variant_groups.length === 0) {
      addLine(item, []);
      return;
    }
    setVariantItem(item);
    setSelected({});
    setVariantQty(1);
    setVariantNotes("");
  }

  function toggleOption(groupId: string, optionId: string, maxSelect: number) {
    setSelected((prev) => {
      const current = prev[groupId] ?? [];
      if (maxSelect <= 1) {
        return { ...prev, [groupId]: current.includes(optionId) ? [] : [optionId] };
      }
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
      }
      if (current.length >= maxSelect) return prev;
      return { ...prev, [groupId]: [...current, optionId] };
    });
  }

  function confirmVariants() {
    if (!variantItem) return;
    const chosen: { option: (typeof variantItem.variant_groups)[number]["options"][number]; groupName: string }[] = [];

    for (const group of variantItem.variant_groups) {
      const optionIds = selected[group.id] ?? [];
      if (group.is_required && optionIds.length < Math.max(group.min_select, 1)) {
        toast.error(`Pilih ${group.name} terlebih dahulu`);
        return;
      }
      for (const optionId of optionIds) {
        const option = group.options.find((candidate) => candidate.id === optionId);
        if (option) chosen.push({ option, groupName: group.name });
      }
    }

    addLine(
      variantItem,
      chosen.map((entry) => entry.option),
      variantQty,
      variantNotes,
    );
    setVariantItem(null);
  }

  async function submit(mode: "kitchen" | "pay") {
    if (lines.length === 0) {
      toast.error("Keranjang masih kosong");
      return;
    }
    const clientId = crypto.randomUUID();
    const payload = toPayload();
    setSubmitting(true);

    try {
      const result = await createOrderAction({
        clientId,
        tableId: orderType === "dine_in" ? tableId : null,
        orderType,
        items: payload,
        appendOrderId,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      clear();

      if (mode === "pay") {
        router.push(`/pos/checkout?order=${result.data.orderId}`);
      } else {
        toast.success(`Pesanan #${result.data.orderNumber} dikirim ke dapur`);
      }
    } catch {
      await enqueueOrder({
        clientId,
        tableId: orderType === "dine_in" ? tableId : null,
        orderType,
        items: payload,
        createdAt: Date.now(),
        status: "pending",
        attempts: 0,
      });
      clear();
      toast.warning("Koneksi terputus — pesanan disimpan offline dan akan disinkronkan otomatis.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col lg:h-svh lg:flex-row">
      <LandscapeHint className="lg:hidden" />
      <section className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari menu..."
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={orderType === "dine_in" ? "default" : "outline"}
              onClick={() => setOrderType("dine_in")}
            >
              Dine-in
            </Button>
            <Button
              variant={orderType === "takeaway" ? "default" : "outline"}
              onClick={() => setOrderType("takeaway")}
            >
              Takeaway
            </Button>
          </div>
        </div>

        {orderType === "dine_in" ? (
          <div className="mb-3">
            <Select
              value={tableId ?? "none"}
              onValueChange={(value) => setTable(!value || value === "none" ? null : value)}
              items={[
                { value: "none", label: "Tanpa meja (opsional)" },
                ...tables.map((table) => ({
                  value: table.id,
                  label: `${table.label} — ${table.status}`,
                })),
              ]}
            >
              <SelectTrigger className="w-full sm:w-60">
                <SelectValue placeholder="Tanpa meja (opsional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Tanpa meja (opsional)</SelectItem>
                {tables.map((table) => (
                  <SelectItem
                    key={table.id}
                    value={table.id}
                    disabled={table.status !== "empty" && table.current_order_id !== appendOrderId}
                  >
                    {table.label} — {table.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={activeCategory === "all" ? "default" : "outline"}
            onClick={() => setActiveCategory("all")}
          >
            Semua
          </Button>
          {categories.map((category) => (
            <Button
              key={category.id}
              size="sm"
              variant={activeCategory === category.id ? "default" : "outline"}
              onClick={() => setActiveCategory(category.id)}
            >
              {category.name}
            </Button>
          ))}
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-3 xl:grid-cols-4">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleMenuClick(item)}
                className="flex min-h-28 flex-col items-start justify-between rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:shadow-sm"
              >
                <div>
                  <p className="text-[15px] font-medium leading-snug">{item.name}</p>
                  <Badge variant="outline" className="mt-1 text-[10px] uppercase">
                    {item.station}
                  </Badge>
                </div>
                <p className="mt-2 text-base font-semibold">{rupiah(item.base_price)}</p>
              </button>
            ))}
            {filteredItems.length === 0 ? (
              <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
                Tidak ada menu yang cocok.
              </p>
            ) : null}
          </div>
        </ScrollArea>
      </section>

      <aside className="flex w-full shrink-0 flex-col border-t bg-card lg:w-96 lg:border-l lg:border-t-0">
        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              Keranjang {appendOrder ? `#${appendOrder.order_number}` : ""}
            </h2>
            {appendOrder ? <Badge variant="secondary">Tambah item</Badge> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {orderType === "dine_in"
              ? (tables.find((table) => table.id === tableId)?.label ?? "Tanpa meja")
              : "Takeaway"}
          </p>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 p-4">
            {lines.map((line) => (
              <div key={line.key} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{line.name}</p>
                    {line.variants.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {line.variants.map((variant) => variant.name).join(", ")}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">{rupiah(lineUnitPrice(line))}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeLine(line.key)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-10"
                      onClick={() => updateQty(line.key, line.qty - 1)}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-9 text-center text-base font-semibold">{line.qty}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-10"
                      onClick={() => updateQty(line.key, line.qty + 1)}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  <span className="text-sm font-semibold">{rupiah(lineUnitPrice(line) * line.qty)}</span>
                </div>
                <Input
                  value={line.notes}
                  onChange={(event) => updateNotes(line.key, event.target.value)}
                  placeholder="Catatan dapur..."
                  className="mt-2 h-10 text-sm"
                />
              </div>
            ))}
            {lines.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Keranjang kosong</p>
            ) : null}
          </div>
        </ScrollArea>

        <div className="space-y-2 border-t p-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{rupiah(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Service ({Number(outlet.service_charge_percent)}%)
            </span>
            <span>{rupiah(serviceCharge)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pajak ({Number(outlet.tax_percent)}%)</span>
            <span>{rupiah(tax)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <span>Total</span>
            <span>{rupiah(total)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button
              variant="outline"
              data-testid="cart-kitchen"
              disabled={submitting}
              onClick={() => submit("kitchen")}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Ke Dapur
            </Button>
            <Button data-testid="cart-pay" disabled={submitting} onClick={() => submit("pay")}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
              Bayar
            </Button>
          </div>
          <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
            <WifiOff className="size-3" /> Mode offline: pesanan disimpan lokal lalu disinkronkan
          </p>
        </div>
      </aside>

      <Dialog open={Boolean(variantItem)} onOpenChange={(open) => !open && setVariantItem(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{variantItem?.name}</DialogTitle>
            <DialogDescription>Pilih varian untuk item ini.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {variantItem?.variant_groups.map((group) => (
              <div key={group.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    {group.name}
                    {group.is_required ? <span className="text-destructive"> *</span> : null}
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {group.max_select > 1 ? `maks ${group.max_select}` : "pilih satu"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.options.map((option) => {
                    const active = (selected[group.id] ?? []).includes(option.id);
                    return (
                      <Button
                        key={option.id}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className={cn(active && "ring-2 ring-ring")}
                        onClick={() => toggleOption(group.id, option.id, group.max_select)}
                      >
                        {option.name}
                        {option.extra_price > 0 ? ` (+${rupiah(option.extra_price)})` : ""}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="space-y-2">
              <Label>Jumlah</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setVariantQty((qty) => Math.max(1, qty - 1))}
                >
                  <Minus className="size-4" />
                </Button>
                <span className="w-10 text-center font-medium">{variantQty}</span>
                <Button variant="outline" size="icon" onClick={() => setVariantQty((qty) => qty + 1)}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="variant-notes">Catatan</Label>
              <Textarea
                id="variant-notes"
                value={variantNotes}
                onChange={(event) => setVariantNotes(event.target.value)}
                placeholder="cth. tanpa bawang"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVariantItem(null)}>
              Batal
            </Button>
            <Button onClick={confirmVariants}>Tambah ke keranjang</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
