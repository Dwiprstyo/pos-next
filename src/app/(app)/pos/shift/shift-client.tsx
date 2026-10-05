"use client";

import { Loader2, Lock, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { logout } from "@/app/login/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rupiah, formatDateTime } from "@/lib/format";

import { closeShiftAction, openShiftAction } from "./actions";

type Shift = {
  id: string;
  opened_at: string;
  opening_cash: number;
  closed_at: string | null;
};

type ShiftSummary = {
  opening_cash: number;
  cash_sales: number;
  non_cash_sales: number;
  total_sales: number;
  orders_count: number;
  expected_cash: number;
  closing_cash_actual: number | null;
  cash_variance: number | null;
  opened_at: string;
  closed_at: string | null;
};

export function ShiftClient({
  shift,
  summary,
  staffName,
  outletName,
}: {
  shift: Shift | null;
  summary: ShiftSummary | null;
  staffName: string;
  outletName: string | null;
}) {
  const router = useRouter();
  const [openingCash, setOpeningCash] = useState("");
  const [actualCash, setActualCash] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleOpen() {
    const value = Number(openingCash);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Kas awal tidak valid");
      return;
    }
    setLoading(true);
    try {
      const result = await openShiftAction(value);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Shift dibuka");
      router.push("/pos");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleClose() {
    if (!shift) return;
    const value = Number(actualCash);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Kas aktual tidak valid");
      return;
    }
    setLoading(true);
    try {
      const result = await closeShiftAction(shift.id, value);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Shift ditutup. Sesi berakhir.");
      await logout();
    } finally {
      setLoading(false);
    }
  }

  if (!shift) {
    return (
      <div className="mx-auto max-w-md p-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-5" /> Buka Shift
            </CardTitle>
            <CardDescription>
              {staffName} • {outletName ?? "Outlet"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="opening-cash">Kas Awal (Rp)</Label>
              <Input
                id="opening-cash"
                type="number"
                min={0}
                value={openingCash}
                onChange={(event) => setOpeningCash(event.target.value)}
                placeholder="500000"
              />
              <div className="flex flex-wrap gap-2">
                {[100000, 200000, 500000, 1000000].map((amount) => (
                  <Button
                    key={amount}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setOpeningCash(String(amount))}
                  >
                    {rupiah(amount)}
                  </Button>
                ))}
              </div>
            </div>
            <Button className="w-full" onClick={handleOpen} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Buka Shift"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Kas awal = uang modal di laci kasir. Isi sesuai hitungan fisik sebelum transaksi pertama.
              Setelah shift dibuka nilainya tidak bisa diubah; selisih akan tercatat sebagai variance saat tutup
              shift. Sesi login berlaku 12 jam.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const variance = summary ? Number(summary.expected_cash) - Number(actualCash || 0) : 0;

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Wallet className="size-5" /> Shift Aktif
            </span>
            <Badge variant="secondary">Open</Badge>
          </CardTitle>
          <CardDescription>
            Dibuka {formatDateTime(shift.opened_at)} oleh {staffName}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Kas awal</span>
            <span>{rupiah(summary?.opening_cash ?? shift.opening_cash)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Penjualan tunai</span>
            <span>{rupiah(summary?.cash_sales ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Penjualan non-tunai</span>
            <span>{rupiah(summary?.non_cash_sales ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Jumlah pesanan</span>
            <span>{summary?.orders_count ?? 0}</span>
          </div>
          <div className="flex justify-between border-t pt-2 font-medium">
            <span>Kas seharusnya</span>
            <span>{rupiah(summary?.expected_cash ?? shift.opening_cash)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="size-4" /> Tutup Shift
          </CardTitle>
          <CardDescription>Hitung uang fisik di kasir lalu masukkan jumlahnya.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="actual-cash">Kas Aktual (Rp)</Label>
            <Input
              id="actual-cash"
              type="number"
              min={0}
              value={actualCash}
              onChange={(event) => setActualCash(event.target.value)}
              placeholder="0"
            />
          </div>
          {actualCash ? (
            <p className={variance === 0 ? "text-sm" : variance > 0 ? "text-sm text-destructive" : "text-sm text-status-occupied"}>
              Selisih: {rupiah(Math.abs(variance))} {variance === 0 ? "(pas)" : variance > 0 ? "(kurang)" : "(lebih)"}
            </p>
          ) : null}
          <Button variant="destructive" className="w-full" onClick={handleClose} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Tutup Shift & Keluar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
