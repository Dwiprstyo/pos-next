"use client";

import { AlertTriangle, Loader2, Plus, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { numberID, formatDateTime } from "@/lib/format";

import { adjustStockAction, upsertIngredientAction } from "./actions";

type Ingredient = {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock_alert: number;
};

type Transaction = {
  id: string;
  qty_change: number;
  reason: string;
  created_at: string;
  ingredients: { name: string; unit: string } | null;
};

export function StockClient({
  ingredients,
  transactions,
  outlets,
  outletId,
  isMultiOutlet,
  outletName,
}: {
  ingredients: Ingredient[];
  transactions: Transaction[];
  outlets: { id: string; name: string }[];
  outletId: string | null;
  isMultiOutlet: boolean;
  outletName: string;
}) {
  const router = useRouter();
  const [adjust, setAdjust] = useState<{ ingredient: Ingredient; mode: "in" | "out"; qty: string; reason: string } | null>(
    null,
  );
  const [form, setForm] = useState<{
    id?: string;
    name: string;
    unit: string;
    minStockAlert: string;
    initialStock: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveAdjust() {
    if (!adjust) return;
    const qty = Number(adjust.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Jumlah tidak valid");
      return;
    }
    setSaving(true);
    const result = await adjustStockAction({
      ingredientId: adjust.ingredient.id,
      qtyChange: adjust.mode === "in" ? qty : -qty,
      reason: adjust.reason || (adjust.mode === "in" ? "restock" : "manual_adjustment"),
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Stok diperbarui");
    setAdjust(null);
    router.refresh();
  }

  async function saveIngredient() {
    if (!form) return;
    setSaving(true);
    const result = await upsertIngredientAction({
      id: form.id,
      outletId: outletId ?? undefined,
      name: form.name,
      unit: form.unit,
      minStockAlert: Number(form.minStockAlert) || 0,
      initialStock: Number(form.initialStock) || 0,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Bahan disimpan");
    setForm(null);
    router.refresh();
  }

  const lowStock = ingredients.filter(
    (ingredient) => Number(ingredient.current_stock) <= Number(ingredient.min_stock_alert),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Stok — {outletName}</h1>
          <p className="text-sm text-muted-foreground">Stok terpotong otomatis saat pesanan dibayar.</p>
        </div>
        <div className="flex items-center gap-2">
          {isMultiOutlet ? (
            <Select
              value={outletId ?? ""}
              onValueChange={(value) => router.push(`/admin/stock?outlet=${value ?? ""}`)}
              items={outlets.map((outlet) => ({ value: outlet.id, label: outlet.name }))}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Pilih outlet" />
              </SelectTrigger>
              <SelectContent>
                {outlets.map((outlet) => (
                  <SelectItem key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button
            onClick={() => setForm({ name: "", unit: "gram", minStockAlert: "0", initialStock: "0" })}
            disabled={!outletId}
          >
            <Plus className="size-4" />
            Bahan
          </Button>
        </div>
      </div>

      {lowStock.length > 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-status-unpaid/50 bg-status-unpaid/10 p-3 text-sm">
          <AlertTriangle className="size-4 text-status-unpaid" />
          {lowStock.length} bahan di bawah stok minimum: {lowStock.map((item) => item.name).join(", ")}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bahan &amp; Stok</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Stok</TableHead>
                <TableHead>Min</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ingredients.map((ingredient) => {
                const low = Number(ingredient.current_stock) <= Number(ingredient.min_stock_alert);
                return (
                  <TableRow key={ingredient.id}>
                    <TableCell className="font-medium">{ingredient.name}</TableCell>
                    <TableCell>
                      {numberID(ingredient.current_stock)} {ingredient.unit}
                    </TableCell>
                    <TableCell>
                      {numberID(ingredient.min_stock_alert)} {ingredient.unit}
                    </TableCell>
                    <TableCell>
                      {low ? <Badge variant="destructive">Low</Badge> : <Badge variant="secondary">OK</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setAdjust({ ingredient, mode: "in", qty: "", reason: "restock" })
                          }
                        >
                          Masuk
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setAdjust({ ingredient, mode: "out", qty: "", reason: "manual_adjustment" })
                          }
                        >
                          <SlidersHorizontal className="size-4" />
                          Keluar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {ingredients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Belum ada bahan.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mutasi Terakhir</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Bahan</TableHead>
                <TableHead>Perubahan</TableHead>
                <TableHead>Alasan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(transaction.created_at)}
                  </TableCell>
                  <TableCell>{transaction.ingredients?.name ?? "-"}</TableCell>
                  <TableCell
                    className={Number(transaction.qty_change) < 0 ? "text-destructive" : "text-status-empty"}
                  >
                    {Number(transaction.qty_change) > 0 ? "+" : ""}
                    {numberID(transaction.qty_change)} {transaction.ingredients?.unit ?? ""}
                  </TableCell>
                  <TableCell className="text-xs">{transaction.reason}</TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Belum ada mutasi.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(adjust)} onOpenChange={(open) => !open && setAdjust(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjust?.mode === "in" ? "Stok Masuk" : "Stok Keluar"} — {adjust?.ingredient.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Jumlah ({adjust?.ingredient.unit})</Label>
              <Input
                type="number"
                min={0}
                value={adjust?.qty ?? ""}
                onChange={(event) => setAdjust((prev) => (prev ? { ...prev, qty: event.target.value } : prev))}
              />
            </div>
            <div className="space-y-1">
              <Label>Alasan</Label>
              <Input
                value={adjust?.reason ?? ""}
                onChange={(event) => setAdjust((prev) => (prev ? { ...prev, reason: event.target.value } : prev))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjust(null)}>
              Batal
            </Button>
            <Button onClick={saveAdjust} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(form)} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit Bahan" : "Bahan Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nama</Label>
              <Input
                value={form?.name ?? ""}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Satuan</Label>
                <Select
                  value={form?.unit ?? "gram"}
                  onValueChange={(value) => setForm((prev) => (prev ? { ...prev, unit: value ?? "gram" } : prev))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["gram", "ml", "pcs"].map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Min. Alert</Label>
                <Input
                  type="number"
                  value={form?.minStockAlert ?? "0"}
                  onChange={(event) =>
                    setForm((prev) => (prev ? { ...prev, minStockAlert: event.target.value } : prev))
                  }
                />
              </div>
            </div>
            {!form?.id ? (
              <div className="space-y-1">
                <Label>Stok Awal</Label>
                <Input
                  type="number"
                  value={form?.initialStock ?? "0"}
                  onChange={(event) =>
                    setForm((prev) => (prev ? { ...prev, initialStock: event.target.value } : prev))
                  }
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Batal
            </Button>
            <Button onClick={saveIngredient} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
