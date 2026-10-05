"use client";

import { Loader2, Pencil, Plus } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { rupiah } from "@/lib/format";

import { upsertOutletAction } from "./actions";

type Outlet = {
  id: string;
  name: string;
  address: string | null;
  tax_percent: number;
  service_charge_percent: number;
  discount_approval_threshold: number;
  is_active: boolean;
};

type FormState = {
  id?: string;
  name: string;
  address: string;
  taxPercent: string;
  serviceChargePercent: string;
  discountApprovalThreshold: string;
  isActive: boolean;
};

export function OutletsClient({ outlets }: { outlets: Outlet[] }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  function edit(outlet: Outlet) {
    setForm({
      id: outlet.id,
      name: outlet.name,
      address: outlet.address ?? "",
      taxPercent: String(outlet.tax_percent),
      serviceChargePercent: String(outlet.service_charge_percent),
      discountApprovalThreshold: String(outlet.discount_approval_threshold),
      isActive: outlet.is_active,
    });
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    const result = await upsertOutletAction({
      id: form.id,
      name: form.name,
      address: form.address,
      taxPercent: Number(form.taxPercent) || 0,
      serviceChargePercent: Number(form.serviceChargePercent) || 0,
      discountApprovalThreshold: Number(form.discountApprovalThreshold) || 0,
      isActive: form.isActive,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Outlet disimpan");
    setForm(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Outlet</h1>
          <p className="text-sm text-muted-foreground">Pengaturan pajak, service, dan approval diskon.</p>
        </div>
        <Button
          onClick={() =>
            setForm({
              name: "",
              address: "",
              taxPercent: "10",
              serviceChargePercent: "0",
              discountApprovalThreshold: "0",
              isActive: true,
            })
          }
        >
          <Plus className="size-4" />
          Outlet Baru
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Outlet</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Pajak</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Batas Diskon</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {outlets.map((outlet) => (
                <TableRow key={outlet.id}>
                  <TableCell>
                    <p className="font-medium">{outlet.name}</p>
                    <p className="text-xs text-muted-foreground">{outlet.address ?? "-"}</p>
                  </TableCell>
                  <TableCell>{Number(outlet.tax_percent)}%</TableCell>
                  <TableCell>{Number(outlet.service_charge_percent)}%</TableCell>
                  <TableCell>{rupiah(outlet.discount_approval_threshold)}</TableCell>
                  <TableCell>
                    {outlet.is_active ? <Badge variant="secondary">Aktif</Badge> : <Badge variant="outline">Nonaktif</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => edit(outlet)}>
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(form)} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit Outlet" : "Outlet Baru"}</DialogTitle>
          </DialogHeader>
          {form ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Nama</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                />
              </div>
              <div className="space-y-1">
                <Label>Alamat</Label>
                <Input
                  value={form.address}
                  onChange={(event) => setForm((prev) => (prev ? { ...prev, address: event.target.value } : prev))}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Pajak %</Label>
                  <Input
                    type="number"
                    value={form.taxPercent}
                    onChange={(event) =>
                      setForm((prev) => (prev ? { ...prev, taxPercent: event.target.value } : prev))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Service %</Label>
                  <Input
                    type="number"
                    value={form.serviceChargePercent}
                    onChange={(event) =>
                      setForm((prev) => (prev ? { ...prev, serviceChargePercent: event.target.value } : prev))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Batas Diskon</Label>
                  <Input
                    type="number"
                    value={form.discountApprovalThreshold}
                    onChange={(event) =>
                      setForm((prev) =>
                        prev ? { ...prev, discountApprovalThreshold: event.target.value } : prev,
                      )
                    }
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm((prev) => (prev ? { ...prev, isActive: checked } : prev))}
                />
                <Label>Aktif</Label>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Batal
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
