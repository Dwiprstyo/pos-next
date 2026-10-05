"use client";

import { Bell, BellOff, ChefHat, Loader2, LogOut, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { logout } from "@/app/login/actions";
import { LandscapeHint } from "@/components/landscape-hint";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { KdsItem, KdsRealtimePayload } from "@/lib/pos-types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { advanceKitchenStatus, fetchKdsItems } from "./actions";

type ColumnStatus = "new" | "cooking" | "ready";

const COLUMNS: {
  status: ColumnStatus;
  label: string;
  next: "cooking" | "ready" | "served";
  action: string;
  accent: string;
}[] = [
  { status: "new", label: "Baru", next: "cooking", action: "Mulai Masak", accent: "border-t-kitchen-new" },
  { status: "cooking", label: "Dimasak", next: "ready", action: "Siap", accent: "border-t-kitchen-cooking" },
  { status: "ready", label: "Siap Saji", next: "served", action: "Disajikan", accent: "border-t-kitchen-ready" },
];

function elapsedLabel(from: string, now: number) {
  const diff = Math.max(0, now - new Date(from).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}j ${minutes % 60}m`;
}

export function KdsBoard({
  initialItems,
  outletId,
  staffName,
  outletName,
}: {
  initialItems: KdsItem[];
  outletId: string | null;
  staffName: string;
  outletName: string | null;
}) {
  const [items, setItems] = useState<KdsItem[]>(initialItems);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const knownIds = useRef<Set<string>>(new Set(initialItems.map((item) => item.id)));
  const soundRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beep = useCallback(() => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = audioCtxRef.current ?? new Ctx();
      audioCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // audio not available
    }
  }, []);

  const refresh = useCallback(async () => {
    const next = await fetchKdsItems();
    const fresh = next.filter((item) => !knownIds.current.has(item.id)).map((item) => item.id);
    knownIds.current = new Set(next.map((item) => item.id));

    if (fresh.length > 0) {
      setNewIds((prev) => new Set([...prev, ...fresh]));
      if (soundRef.current) beep();
    }

    setItems(next);
  }, [beep]);

  // Coalesce bursts of realtime events into a single refetch.
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void refresh();
    }, 250);
  }, [refresh]);

  useEffect(() => {
    if (!outletId) return;

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      // Realtime RLS authorizes against the user JWT, not the anon key.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase
        .channel(`kds:${outletId}`, { config: { private: true } })
        .on("broadcast", { event: "order_item_change" }, (message) => {
          const payload = message.payload as KdsRealtimePayload | undefined;
          if (payload?.id) {
            setNewIds((prev) => new Set(prev).add(payload.id));
            if (soundRef.current) beep();
          }
          scheduleRefresh();
        })
        .on("broadcast", { event: "order_change" }, () => {
          scheduleRefresh();
        })
        .subscribe((status) => {
          setConnected(status === "SUBSCRIBED");
        });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [outletId, scheduleRefresh, beep]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!connected) void refresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [connected, refresh]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const grouped = useMemo(() => {
    return COLUMNS.map((column) => {
      const columnItems = items.filter((item) => item.kitchen_status === column.status);
      const orders = new Map<string, KdsItem[]>();
      for (const item of columnItems) {
        const list = orders.get(item.order_id) ?? [];
        list.push(item);
        orders.set(item.order_id, list);
      }
      return {
        column,
        groups: Array.from(orders.entries()).map(([orderId, orderItems]) => ({
          orderId,
          orderItems: orderItems.sort(
            (a, b) => new Date(a.item_created_at).getTime() - new Date(b.item_created_at).getTime(),
          ),
        })),
      };
    });
  }, [items]);

  async function handleAdvance(item: KdsItem, next: "cooking" | "ready" | "served") {
    setPendingItemId(item.id);
    // Optimistic: move the card immediately, reconcile from the server after.
    setItems((prev) =>
      prev.map((candidate) =>
        candidate.id === item.id ? { ...candidate, kitchen_status: next } : candidate,
      ),
    );

    const result = await advanceKitchenStatus(item.id, next);
    setPendingItemId(null);

    if (!result.ok) {
      toast.error(result.error);
      await refresh();
      return;
    }

    setNewIds((prev) => {
      const clone = new Set(prev);
      clone.delete(item.id);
      return clone;
    });
    scheduleRefresh();
  }

  function acknowledge(ids: string[]) {
    setNewIds((prev) => {
      const clone = new Set(prev);
      ids.forEach((id) => clone.delete(id));
      return clone;
    });
  }

  function toggleSound() {
    if (!soundEnabled) {
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = audioCtxRef.current ?? new Ctx();
        audioCtxRef.current = ctx;
        void ctx.resume();
      } catch {
        // ignore
      }
    }
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundRef.current = next;
  }

  return (
    <div className="flex h-svh flex-col">
      <LandscapeHint />
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ChefHat className="size-5" />
          </div>
          <div className="leading-tight">
            <h1 className="text-lg font-semibold">Kitchen Display</h1>
            <p className="text-xs text-muted-foreground">
              {outletName ?? "Semua outlet"} • {staffName} •{" "}
              {connected ? (
                <span className="text-status-empty">realtime</span>
              ) : (
                <span className="text-status-unpaid">polling fallback</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={soundEnabled ? "default" : "outline"} size="sm" onClick={toggleSound}>
            {soundEnabled ? <Volume2 className="size-4" /> : <BellOff className="size-4" />}
            <span className="hidden sm:inline">{soundEnabled ? "Suara Aktif" : "Suara Mati"}</span>
          </Button>
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">
              <LogOut className="size-4" />
              Keluar
            </Button>
          </form>
          <ThemeToggle />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-3">
        {grouped.map(({ column, groups }) => (
          <section key={column.status} className="flex min-h-0 flex-col rounded-lg bg-muted/30">
            <div className={cn("flex items-center justify-between rounded-t-lg border-t-4 bg-card px-4 py-3", column.accent)}>
              <h2 className="text-lg font-semibold">{column.label}</h2>
              <Badge variant="secondary">{groups.reduce((sum, group) => sum + group.orderItems.length, 0)}</Badge>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {groups.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  <Bell className="mx-auto mb-2 size-5 opacity-50" />
                  Tidak ada item
                </p>
              ) : null}

              {groups.map((group) => {
                const first = group.orderItems[0];
                const hasNew = group.orderItems.some((item) => newIds.has(item.id));
                return (
                  <article
                    key={group.orderId}
                    onClick={() => acknowledge(group.orderItems.map((item) => item.id))}
                    className={cn(
                      "rounded-lg border-2 bg-card p-3 shadow-sm",
                      hasNew ? "animate-pulse border-kitchen-new" : "border-border",
                    )}
                  >
                    <header className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold">#{first.order_number}</span>
                        <Badge variant="outline">
                          {first.table_label
                            ? `Meja ${first.table_label}`
                            : first.order_type === "dine_in"
                              ? "Tanpa meja"
                              : "Takeaway"}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{elapsedLabel(first.order_created_at, now)}</span>
                    </header>

                    <div className="space-y-3">
                      {group.orderItems.map((item) => (
                        <div
                          key={item.id}
                          data-testid="kds-item"
                          data-menu={item.menu_name}
                          className="border-t border-dashed pt-3 first:border-t-0 first:pt-0"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-lg font-bold">
                                {item.qty}
                              </span>
                              <div>
                                <p className="text-2xl font-semibold leading-tight">{item.menu_name}</p>
                                {item.variants ? (
                                  <p className="text-sm text-muted-foreground">{item.variants}</p>
                                ) : null}
                                {item.notes ? (
                                  <p className="text-sm font-medium text-kitchen-cooking">{item.notes}</p>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <Button
                            className="mt-3 h-12 w-full text-base"
                            variant={column.status === "ready" ? "default" : "outline"}
                            disabled={pendingItemId === item.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleAdvance(item, column.next);
                            }}
                          >
                            {pendingItemId === item.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : null}
                            {column.action}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
