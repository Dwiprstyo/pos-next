"use client";

import { KeyRound, Loader2, Pencil, Plus, UserPlus } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

import { createStaffAction, resetPinAction, updateStaffAction } from "./actions";

type StaffRow = {
  id: string;
  staff_code: string;
  full_name: string;
  role: "cashier" | "kitchen" | "manager";
  outlet_id: string | null;
  is_multi_outlet: boolean;
  is_active: boolean;
  locked_until: string | null;
  outlets: { name: string } | null;
};

type Outlet = { id: string; name: string };

const ROLE_LABEL: Record<StaffRow["role"], string> = {
  cashier: "Kasir",
  kitchen: "Dapur",
  manager: "Manager",
};

export function StaffClient({
  staff,
  outlets,
  isMultiOutlet,
  currentStaffId,
}: {
  staff: StaffRow[];
  outlets: Outlet[];
  isMultiOutlet: boolean;
  currentStaffId: string;
}) {
  const router = useRouter();
  const [createForm, setCreateForm] = useState<{
    fullName: string;
    staffCode: string;
    role: StaffRow["role"];
    outletId: string;
    pin: string;
    isMultiOutlet: boolean;
  } | null>(null);
  const [editForm, setEditForm] = useState<{
    id: string;
    fullName: string;
    role: StaffRow["role"];
    isActive: boolean;
  } | null>(null);
  const [pinForm, setPinForm] = useState<{ id: string; name: string; pin: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!createForm) return;
    setSaving(true);
    const result = await createStaffAction({
      fullName: createForm.fullName,
      staffCode: createForm.staffCode,
      role: createForm.role,
      outletId: createForm.outletId || null,
      pin: createForm.pin,
      isMultiOutlet: createForm.isMultiOutlet,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Staff dibuat");
    setCreateForm(null);
    router.refresh();
  }

  async function handleUpdate() {
    if (!editForm) return;
    setSaving(true);
    const result = await updateStaffAction({
      id: editForm.id,
      fullName: editForm.fullName,
      role: editForm.role,
      isActive: editForm.isActive,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Staff diperbarui");
    setEditForm(null);
    router.refresh();
  }

  async function handleResetPin() {
    if (!pinForm) return;
    setSaving(true);
    const result = await resetPinAction(pinForm.id, pinForm.pin);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("PIN direset");
    setPinForm(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Staff</h1>
          <p className="text-sm text-muted-foreground">Kelola akses kasir, dapur, dan manager.</p>
        </div>
        <Button
          onClick={() =>
            setCreateForm({
              fullName: "",
              staffCode: "",
              role: "cashier",
              outletId: outlets[0]?.id ?? "",
              pin: "",
              isMultiOutlet: false,
            })
          }
        >
          <UserPlus className="size-4" />
          Staff Baru
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Staff</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Kode</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Outlet</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.full_name}</TableCell>
                  <TableCell>{member.staff_code}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{ROLE_LABEL[member.role]}</Badge>
                  </TableCell>
                  <TableCell>{member.is_multi_outlet ? "Semua outlet" : member.outlets?.name ?? "-"}</TableCell>
                  <TableCell>
                    {member.locked_until && new Date(member.locked_until) > new Date() ? (
                      <Badge variant="destructive">
                        Locked s/d {formatDateTime(member.locked_until)}
                      </Badge>
                    ) : member.is_active ? (
                      <Badge variant="secondary">Aktif</Badge>
                    ) : (
                      <Badge variant="outline">Nonaktif</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          setEditForm({
                            id: member.id,
                            fullName: member.full_name,
                            role: member.role,
                            isActive: member.is_active,
                          })
                        }
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setPinForm({ id: member.id, name: member.full_name, pin: "" })}
                      >
                        <KeyRound className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(createForm)} onOpenChange={(open) => !open && setCreateForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Staff Baru</DialogTitle>
          </DialogHeader>
          {createForm ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Nama Lengkap</Label>
                <Input
                  value={createForm.fullName}
                  onChange={(event) =>
                    setCreateForm((prev) => (prev ? { ...prev, fullName: event.target.value } : prev))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Kode Staff</Label>
                  <Input
                    value={createForm.staffCode}
                    onChange={(event) =>
                      setCreateForm((prev) =>
                        prev ? { ...prev, staffCode: event.target.value.toUpperCase() } : prev,
                      )
                    }
                    placeholder="KSR3"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select
                    value={createForm.role}
                    onValueChange={(value) =>
                      setCreateForm((prev) => (prev ? { ...prev, role: (value ?? "cashier") as StaffRow["role"] } : prev))
                    }
                    items={{ cashier: "Kasir", kitchen: "Dapur", manager: "Manager" }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cashier">Kasir</SelectItem>
                      <SelectItem value="kitchen">Dapur</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {isMultiOutlet ? (
                <div className="space-y-1">
                  <Label>Outlet</Label>
                  <Select
                    value={createForm.outletId}
                    onValueChange={(value) =>
                      setCreateForm((prev) => (prev ? { ...prev, outletId: value ?? "" } : prev))
                    }
                    items={outlets.map((outlet) => ({ value: outlet.id, label: outlet.name }))}
                  >
                    <SelectTrigger>
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
                </div>
              ) : null}
              <div className="space-y-1">
                <Label>PIN (min. 4 digit)</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  value={createForm.pin}
                  onChange={(event) =>
                    setCreateForm((prev) => (prev ? { ...prev, pin: event.target.value } : prev))
                  }
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateForm(null)}>
              Batal
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editForm)} onOpenChange={(open) => !open && setEditForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Staff</DialogTitle>
          </DialogHeader>
          {editForm ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Nama Lengkap</Label>
                <Input
                  value={editForm.fullName}
                  onChange={(event) =>
                    setEditForm((prev) => (prev ? { ...prev, fullName: event.target.value } : prev))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Role</Label>
                <Select
                  value={editForm.role}
                  onValueChange={(value) =>
                    setEditForm((prev) => (prev ? { ...prev, role: (value ?? "cashier") as StaffRow["role"] } : prev))
                  }
                  items={{ cashier: "Kasir", kitchen: "Dapur", manager: "Manager" }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cashier">Kasir</SelectItem>
                    <SelectItem value="kitchen">Dapur</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editForm.isActive}
                  disabled={editForm.id === currentStaffId}
                  onCheckedChange={(checked) =>
                    setEditForm((prev) => (prev ? { ...prev, isActive: checked } : prev))
                  }
                />
                <Label>Aktif</Label>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditForm(null)}>
              Batal
            </Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pinForm)} onOpenChange={(open) => !open && setPinForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset PIN — {pinForm?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label>PIN Baru</Label>
            <Input
              type="password"
              inputMode="numeric"
              value={pinForm?.pin ?? ""}
              onChange={(event) => setPinForm((prev) => (prev ? { ...prev, pin: event.target.value } : prev))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinForm(null)}>
              Batal
            </Button>
            <Button onClick={handleResetPin} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Reset PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
