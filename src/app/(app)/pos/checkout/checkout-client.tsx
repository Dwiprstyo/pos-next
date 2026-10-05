"use client";

import { ArrowLeft, Clock, ExternalLink, Loader2, Percent, QrCode, Receipt, Trash2, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rupiah } from "@/lib/format";
import type { PaymentMethod } from "@/lib/payments";

import { applyDiscountAction, checkPaymentStatusAction, payOrderAction, voidOrderAction } from "../actions";

type CheckoutOrder = {
  id: string;
  order_number: number;
  order_type: "dine_in" | "takeaway";
  table_label: string | null;
  subtotal: number;
  discount_amount: number;
  discount_type: string | null;
  discount_value: number | null;
  tax_amount: number;
  total: number;
  items: {
    id: string;
    name: string;
    qty: number;
    unit_price: number;
    notes: string | null;
    variants: string[];
  }[];
};

type OutletConfig = {
  id: string;
  name: string;
  tax_percent: number;
  service_charge_percent: number;
  discount_approval_threshold: number;
};

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Tunai" },
  { value: "qris", label: "QRIS" },
  { value: "card", label: "Kartu" },
  { value: "ewallet", label: "E-Wallet" },
];

export function CheckoutClient({
  order: initialOrder,
  outlet,
  role,
  gatewayEnabled,
}: {
  order: CheckoutOrder;
  outlet: OutletConfig;
  role: "cashier" | "manager";
  gatewayEnabled: boolean;
}) {
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);
  const [discountType, setDiscountType] = useState<"percent" | "nominal">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [managerPin, setManagerPin] = useState("");
  const [showApproval, setShowApproval] = useState(false);
  const [applying, setApplying] = useState(false);

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [tendered, setTendered] = useState("");
  const [paying, setPaying] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [pendingPayment, setPendingPayment] = useState<{
    referenceNo: string | null;
    instructions: Record<string, unknown>;
  } | null>(null);
  const [checking, setChecking] = useState(false);

  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidPin, setVoidPin] = useState("");
  const [voiding, setVoiding] = useState(false);

  const tenderedNumber = Number(tendered || 0);
  const change = tenderedNumber - order.total;

  useEffect(() => {
    if (!pendingPayment) return;

    const interval = setInterval(async () => {
      const result = await checkPaymentStatusAction(order.id);
      if (!result.ok) return;

      if (result.status === "paid") {
        toast.success(`Pesanan #${order.order_number} lunas`);
        setPendingPayment(null);
        router.push("/pos");
        router.refresh();
      } else if (result.status === "failed") {
        toast.error("Pembayaran gagal/kedaluwarsa. Coba metode lain.");
        setPendingPayment(null);
      } else if (result.status === "void") {
        toast.error("Pesanan sudah dibatalkan.");
        setPendingPayment(null);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [pendingPayment, order.id, order.order_number, router]);

  async function handleApplyDiscount(pin?: string) {
    const value = Number(discountValue);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Nilai diskon tidak valid");
      return;
    }

    setApplying(true);
    try {
      const result = await applyDiscountAction({
        orderId: order.id,
        type: discountType,
        value,
        managerPin: pin,
      });

      if (!result.ok) {
        if (result.needsApproval) {
          setShowApproval(true);
          if (pin) toast.error(result.error);
        } else {
          toast.error(result.error);
        }
        return;
      }

      setOrder((prev) => ({
        ...prev,
        discount_amount: result.data.discountAmount,
        total: result.data.total,
        discount_type: discountType,
        discount_value: value,
      }));
      setShowApproval(false);
      setManagerPin("");
      toast.success("Diskon diterapkan");
      router.refresh();
    } finally {
      setApplying(false);
    }
  }

  async function handlePay() {
    if (method === "cash" && tenderedNumber > 0 && change < 0) {
      toast.error("Uang tunai kurang dari total");
      return;
    }

    setPaying(true);
    try {
      const result = await payOrderAction({
        orderId: order.id,
        orderNumber: order.order_number,
        method,
        amount: order.total,
        tendered: method === "cash" ? tenderedNumber : undefined,
        idempotencyKey,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      if (result.status === "pending") {
        setPendingPayment({ referenceNo: result.referenceNo, instructions: result.instructions });
        return;
      }

      toast.success(`Pesanan #${order.order_number} lunas`);
      router.push("/pos");
      router.refresh();
    } finally {
      setPaying(false);
    }
  }

  async function handleCheckNow() {
    setChecking(true);
    try {
      const result = await checkPaymentStatusAction(order.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.status === "paid") {
        toast.success(`Pesanan #${order.order_number} lunas`);
        setPendingPayment(null);
        router.push("/pos");
        router.refresh();
      } else if (result.status === "failed") {
        toast.error("Pembayaran gagal/kedaluwarsa. Coba metode lain.");
        setPendingPayment(null);
      } else {
        toast.info("Pembayaran belum diterima.");
      }
    } finally {
      setChecking(false);
    }
  }

  async function handleVoid() {
    if (!voidReason.trim()) {
      toast.error("Isi alasan void");
      return;
    }

    setVoiding(true);
    try {
      const result = await voidOrderAction({
        orderId: order.id,
        reason: voidReason.trim(),
        managerPin: role === "manager" ? undefined : voidPin || undefined,
      });

      if (!result.ok) {
        if (result.needsApproval && !voidPin) {
          toast.error("Masukkan PIN manager untuk void");
        } else {
          toast.error(result.error);
        }
        return;
      }

      toast.success("Pesanan dibatalkan");
      router.push("/pos");
      router.refresh();
    } finally {
      setVoiding(false);
    }
  }

  const qrUrl =
    typeof pendingPayment?.instructions.qrUrl === "string" ? pendingPayment.instructions.qrUrl : null;
  const deeplink =
    typeof pendingPayment?.instructions.deeplink === "string" ? pendingPayment.instructions.deeplink : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pb-10">
      <div className="flex items-center justify-between">
        <Link href="/pos" className={buttonVariants({ variant: "ghost" })}>
          <ArrowLeft className="size-4" />
          Kembali
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {order.table_label
              ? `Meja ${order.table_label}`
              : order.order_type === "dine_in"
                ? "Tanpa meja"
                : "Takeaway"}
          </Badge>
          <Badge>#{order.order_number}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="size-4" /> Rincian Pesanan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">
                  {item.qty}× {item.name}
                </p>
                {item.variants.length > 0 ? (
                  <p className="text-xs text-muted-foreground">{item.variants.join(", ")}</p>
                ) : null}
                {item.notes ? <p className="text-xs italic text-muted-foreground">{item.notes}</p> : null}
              </div>
              <span>{rupiah(item.unit_price * item.qty)}</span>
            </div>
          ))}

          <div className="space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{rupiah(order.subtotal)}</span>
            </div>
            {order.discount_amount > 0 ? (
              <div className="flex justify-between text-destructive">
                <span>Diskon</span>
                <span>-{rupiah(order.discount_amount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Service ({Number(outlet.service_charge_percent)}%)
              </span>
              <span>{rupiah(((order.subtotal - order.discount_amount) * Number(outlet.service_charge_percent)) / 100)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pajak ({Number(outlet.tax_percent)}%)</span>
              <span>{rupiah(order.tax_amount)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span>{rupiah(order.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="size-4" /> Diskon
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Diskon di atas {rupiah(outlet.discount_approval_threshold)} butuh approval manager.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              value={discountType}
              onValueChange={(value) => setDiscountType((value ?? "percent") as "percent" | "nominal")}
              items={{ percent: "Persen (%)", nominal: "Nominal (Rp)" }}
            >
              <SelectTrigger className="sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Persen (%)</SelectItem>
                <SelectItem value="nominal">Nominal (Rp)</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              value={discountValue}
              onChange={(event) => setDiscountValue(event.target.value)}
              placeholder={discountType === "percent" ? "10" : "10000"}
            />
            <Button onClick={() => handleApplyDiscount()} disabled={applying}>
              {applying ? <Loader2 className="size-4 animate-spin" /> : "Terapkan"}
            </Button>
          </div>
          {order.discount_amount > 0 ? (
            <p className="text-sm text-muted-foreground">
              Diskon aktif: {order.discount_type === "percent" ? `${order.discount_value}%` : rupiah(order.discount_value ?? 0)} (
              {rupiah(order.discount_amount)})
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="size-4" /> Pembayaran
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {METHODS.map((option) => (
              <Button
                key={option.value}
                variant={method === option.value ? "default" : "outline"}
                disabled={option.value !== "cash" && !gatewayEnabled}
                onClick={() => setMethod(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {!gatewayEnabled ? (
            <p className="text-xs text-muted-foreground">
              Payment gateway (Midtrans) belum dikonfigurasi — hanya pembayaran tunai yang tersedia.
            </p>
          ) : null}

          {method === "cash" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="tendered">Uang diterima</Label>
                <Input
                  id="tendered"
                  type="number"
                  min={0}
                  value={tendered}
                  onChange={(event) => setTendered(event.target.value)}
                  placeholder={String(order.total)}
                />
              </div>
              <div className="space-y-1">
                <Label>Kembalian</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">
                  {tenderedNumber > 0 ? rupiah(Math.max(change, 0)) : "-"}
                </div>
              </div>
            </div>
          ) : null}

          <Button className="w-full" size="lg" data-testid="pay-submit" onClick={handlePay} disabled={paying}>
            {paying ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
            Bayar {rupiah(order.total)}
          </Button>

          <Button
            variant="ghost"
            className="w-full text-destructive hover:text-destructive"
            onClick={() => setShowVoid(true)}
          >
            <Trash2 className="size-4" />
            Void pesanan
          </Button>
        </CardContent>
      </Card>

      <Dialog open={Boolean(pendingPayment)} onOpenChange={(open) => !open && setPendingPayment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="size-5" />
              Menunggu Pembayaran
            </DialogTitle>
            <DialogDescription>
              Pesanan #{order.order_number} • {rupiah(order.total)}
              {pendingPayment?.referenceNo ? ` • Ref ${pendingPayment.referenceNo}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3">
            {qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrUrl} alt="QRIS" className="size-64 rounded-lg border bg-white p-2" />
            ) : (
              <p className="text-sm text-muted-foreground">
                Lanjutkan pembayaran pada aplikasi e-wallet Anda.
              </p>
            )}
            {deeplink ? (
              <Button variant="outline" onClick={() => window.open(deeplink, "_blank")}>
                <ExternalLink className="size-4" />
                Buka Aplikasi Pembayaran
              </Button>
            ) : null}
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" /> Status diperbarui otomatis setiap 3 detik.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingPayment(null)}>
              Tutup
            </Button>
            <Button onClick={handleCheckNow} disabled={checking}>
              {checking ? <Loader2 className="size-4 animate-spin" /> : "Cek Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showApproval} onOpenChange={setShowApproval}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approval Manager</DialogTitle>
            <DialogDescription>Masukkan PIN manager untuk menyetujui diskon ini.</DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            inputMode="numeric"
            value={managerPin}
            onChange={(event) => setManagerPin(event.target.value)}
            placeholder="PIN manager"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproval(false)}>
              Batal
            </Button>
            <Button onClick={() => handleApplyDiscount(managerPin)} disabled={applying || managerPin.length < 4}>
              {applying ? <Loader2 className="size-4 animate-spin" /> : "Setujui"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showVoid} onOpenChange={setShowVoid}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void Pesanan #{order.order_number}</DialogTitle>
            <DialogDescription>Pesanan akan dibatalkan dan stok dikembalikan jika sudah dibayar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="void-reason">Alasan</Label>
              <Input
                id="void-reason"
                value={voidReason}
                onChange={(event) => setVoidReason(event.target.value)}
                placeholder="cth. salah input"
              />
            </div>
            {role !== "manager" ? (
              <div className="space-y-1">
                <Label htmlFor="void-pin">PIN Manager</Label>
                <Input
                  id="void-pin"
                  type="password"
                  inputMode="numeric"
                  value={voidPin}
                  onChange={(event) => setVoidPin(event.target.value)}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVoid(false)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleVoid} disabled={voiding}>
              {voiding ? <Loader2 className="size-4 animate-spin" /> : "Void"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
