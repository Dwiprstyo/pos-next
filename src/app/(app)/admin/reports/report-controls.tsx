"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { refreshReportsAction } from "./actions";

export function ReportControls({
  from,
  to,
  outlets,
  outletFilter,
  isMultiOutlet,
}: {
  from: string;
  to: string;
  outlets: { id: string; name: string }[];
  outletFilter?: string;
  isMultiOutlet: boolean;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleRefresh() {
    setRefreshing(true);
    const result = await refreshReportsAction();
    setRefreshing(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Ringkasan harian diperbarui");
    router.refresh();
  }

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams({ from, to });
    if (isMultiOutlet && outletFilter) params.set("outlet", outletFilter);
    if (key === "outlet") {
      if (value === "all") params.delete("outlet");
      else params.set("outlet", value);
    } else {
      params.set(key, value);
    }
    startTransition(() => router.push(`/admin/reports?${params.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Dari</label>
        <Input type="date" defaultValue={from} onChange={(event) => updateParam("from", event.target.value)} className="w-36" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Sampai</label>
        <Input type="date" defaultValue={to} onChange={(event) => updateParam("to", event.target.value)} className="w-36" />
      </div>
      {isMultiOutlet ? (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Outlet</label>
          <Select
            value={outletFilter ?? "all"}
            onValueChange={(value) => updateParam("outlet", value ?? "all")}
            items={[
              { value: "all", label: "Semua outlet" },
              ...outlets.map((outlet) => ({ value: outlet.id, label: outlet.name })),
            ]}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua outlet</SelectItem>
              {outlets.map((outlet) => (
                <SelectItem key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <Button variant="outline" onClick={handleRefresh} disabled={refreshing || pending}>
        {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        Refresh
      </Button>
    </div>
  );
}
