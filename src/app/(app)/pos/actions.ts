"use server";

import { verify as verifyArgon } from "@node-rs/argon2";
import { revalidatePath } from "next/cache";

import { getSessionContext } from "@/lib/auth";
import { getPaymentProvider, type PaymentMethod } from "@/lib/payments";
import { fetchMidtransStatus, midtransStatusToPaymentStatus } from "@/lib/payments/midtrans";
import type { OrderItemPayload } from "@/lib/pos-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const pinAttempts = new Map<string, { count: number; windowStart: number }>();
const PIN_WINDOW_MS = 60_000;
const PIN_MAX = 8;

function pinRateLimited(key: string) {
  const now = Date.now();
  const entry = pinAttempts.get(key);
  if (!entry || now - entry.windowStart > PIN_WINDOW_MS) {
    pinAttempts.set(key, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > PIN_MAX;
}

function friendlyError(message: string) {
  const map: Record<string, string> = {
    not_authorized: "Anda tidak punya akses untuk aksi ini.",
    outlet_unavailable: "Outlet tidak aktif.",
    no_open_shift: "Buka shift terlebih dahulu.",
    empty_order: "Tidak ada item pada pesanan.",
    table_required: "Pilih meja untuk pesanan dine-in.",
    table_not_found: "Meja tidak ditemukan.",
    table_occupied: "Meja sedang terpakai.",
    menu_item_unavailable: "Ada menu yang sudah tidak tersedia.",
    required_variant_missing: "Varian wajib belum dipilih.",
    variant_mismatch: "Varian tidak sesuai dengan menu.",
    invalid_qty: "Jumlah item tidak valid.",
    order_not_found: "Pesanan tidak ditemukan.",
    order_not_open: "Pesanan sudah dibayar atau dibatalkan.",
    no_payments: "Tidak ada pembayaran.",
    invalid_payment_amount: "Nominal pembayaran tidak valid.",
    invalid_discount: "Nilai diskon tidak valid.",
    invalid_discount_type: "Tipe diskon tidak valid.",
    invalid_approver: "Approval manager tidak valid.",
    approval_required: "Diskon melebihi batas, butuh PIN manager.",
    invalid_transition: "Perubahan status tidak diizinkan.",
    item_not_found: "Item tidak ditemukan.",
    order_void: "Pesanan sudah dibatalkan.",
    invalid_opening_cash: "Kas awal tidak valid.",
    shift_not_found: "Shift tidak ditemukan.",
    insufficient_payment: "Nominal pembayaran kurang dari total.",
    ingredient_not_found: "Bahan tidak ditemukan.",
    staff_inactive: "Staff tidak aktif.",
  };

  for (const [key, value] of Object.entries(map)) {
    if (message.includes(key)) return value;
  }

  return message;
}

async function verifyManagerPin(outletId: string | null, pin: string) {
  const admin = createAdminClient();
  const { data: managers } = await admin
    .from("staff")
    .select("id, outlet_id, is_multi_outlet, pin_hash")
    .eq("role", "manager")
    .eq("is_active", true);

  for (const manager of managers ?? []) {
    if (!manager.is_multi_outlet && manager.outlet_id !== outletId) continue;
    const valid = await verifyArgon(manager.pin_hash, pin).catch(() => false);
    if (valid) return { id: manager.id };
  }

  return null;
}

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; needsApproval?: boolean };

export async function createOrderAction(input: {
  clientId: string;
  tableId: string | null;
  orderType: "dine_in" | "takeaway";
  items: OrderItemPayload[];
  appendOrderId?: string | null;
}): Promise<ActionResult<{ orderId: string; orderNumber: number }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesi berakhir, silakan login ulang." };

  const supabase = await createClient();

  if (input.appendOrderId) {
    const { data, error } = await supabase.rpc("add_order_items", {
      p_order_id: input.appendOrderId,
      p_items: input.items as unknown as never,
    });

    if (error) return { ok: false, error: friendlyError(error.message) };

    revalidatePath("/pos");
    revalidatePath("/pos/tables");
    revalidatePath("/kds");
    return { ok: true, data: { orderId: data.id, orderNumber: data.order_number } };
  }

  const { data, error } = await supabase.rpc("create_order", {
    p_client_id: input.clientId,
    p_table_id: input.tableId ?? (null as unknown as string),
    p_order_type: input.orderType,
    p_items: input.items as unknown as never,
  });

  if (error) return { ok: false, error: friendlyError(error.message) };

  revalidatePath("/pos");
  revalidatePath("/pos/tables");
  revalidatePath("/kds");
  return { ok: true, data: { orderId: data.id, orderNumber: data.order_number } };
}

export async function applyDiscountAction(input: {
  orderId: string;
  type: "percent" | "nominal";
  value: number;
  managerPin?: string;
}): Promise<ActionResult<{ discountAmount: number; total: number }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesi berakhir, silakan login ulang." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_order_discount", {
    p_order_id: input.orderId,
    p_type: input.type,
    p_value: input.value,
  });

  if (!error) {
    revalidatePath(`/pos/checkout`);
    return { ok: true, data: { discountAmount: data.discount_amount, total: data.total } };
  }

  if (!error.message.includes("approval_required")) {
    return { ok: false, error: friendlyError(error.message) };
  }

  if (!input.managerPin) {
    return { ok: false, error: "Butuh approval manager.", needsApproval: true };
  }

  if (pinRateLimited(`${session.staffId}:approval`)) {
    return { ok: false, error: "Terlalu banyak percobaan PIN. Tunggu sebentar." };
  }

  const approver = await verifyManagerPin(session.outletId, input.managerPin);
  if (!approver) return { ok: false, error: "PIN manager salah.", needsApproval: true };

  const admin = createAdminClient();
  const { data: approved, error: approveError } = await admin.rpc("apply_order_discount", {
    p_order_id: input.orderId,
    p_type: input.type,
    p_value: input.value,
    p_approved_by: approver.id,
  });

  if (approveError) return { ok: false, error: friendlyError(approveError.message) };

  revalidatePath(`/pos/checkout`);
  return { ok: true, data: { discountAmount: approved.discount_amount, total: approved.total } };
}

export type PaymentActionResult =
  | { ok: true; status: "paid"; orderId: string }
  | {
      ok: true;
      status: "pending";
      orderId: string;
      referenceNo: string | null;
      instructions: Record<string, unknown>;
    }
  | { ok: false; error: string };

export async function payOrderAction(input: {
  orderId: string;
  orderNumber: number | string;
  method: PaymentMethod;
  amount: number;
  tendered?: number;
  idempotencyKey: string;
}): Promise<PaymentActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesi berakhir, silakan login ulang." };

  const provider = getPaymentProvider(input.method);
  const charge = await provider.charge({
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    amount: input.amount,
    method: input.method,
    idempotencyKey: input.idempotencyKey,
    metadata: { tendered: input.tendered },
  });

  if (charge.status === "failed") {
    const reason = String(charge.gatewayResponse?.error ?? "");
    if (reason === "gateway_not_configured") {
      return { ok: false, error: "Payment gateway belum dikonfigurasi. Gunakan tunai." };
    }
    if (reason === "card_requires_token") {
      return { ok: false, error: "Pembayaran kartu belum didukung. Gunakan QRIS/e-wallet atau tunai." };
    }
    return { ok: false, error: "Pembayaran gagal diproses." };
  }

  const supabase = await createClient();

  if (charge.status === "pending") {
    const { error } = await supabase.rpc("create_gateway_payment", {
      p_order_id: input.orderId,
      p_method: input.method,
      p_amount: input.amount,
      p_reference_no: (charge.referenceNo ?? null) as unknown as string,
      p_gateway_response: (charge.gatewayResponse ?? null) as never,
      p_idempotency_key: input.idempotencyKey,
    });

    if (error) return { ok: false, error: friendlyError(error.message) };

    revalidatePath("/pos");
    return {
      ok: true,
      status: "pending",
      orderId: input.orderId,
      referenceNo: charge.referenceNo ?? null,
      instructions: charge.instructions ?? {},
    };
  }

  const { error } = await supabase.rpc("pay_order", {
    p_order_id: input.orderId,
    p_payments: [
      {
        method: input.method,
        amount: input.amount,
        reference_no: charge.referenceNo ?? null,
        gateway_response: charge.gatewayResponse ?? null,
      },
    ] as unknown as never,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) return { ok: false, error: friendlyError(error.message) };

  revalidatePath("/pos");
  revalidatePath("/pos/tables");
  revalidatePath("/admin/reports");
  return { ok: true, status: "paid", orderId: input.orderId };
}

export async function checkPaymentStatusAction(
  orderId: string,
): Promise<{ ok: true; status: "paid" | "pending" | "failed" | "void" } | { ok: false; error: string }> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesi berakhir." };

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, total")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { ok: false, error: "Pesanan tidak ditemukan." };
  if (order.status === "paid") return { ok: true, status: "paid" };
  if (order.status === "void") return { ok: true, status: "void" };

  const { data: pending } = await supabase
    .from("payments")
    .select("method, amount, reference_no, gateway_response")
    .eq("order_id", orderId)
    .eq("status", "pending")
    .order("paid_at", { ascending: false })
    .limit(1);

  const payment = pending?.[0];
  if (!payment) return { ok: true, status: "pending" };

  const gatewayResponse = (payment.gateway_response ?? {}) as Record<string, unknown>;
  const midtransOrderId = String(gatewayResponse.order_id ?? "");
  if (!midtransOrderId) return { ok: true, status: "pending" };

  const statusResponse = await fetchMidtransStatus(midtransOrderId);
  const mapped = midtransStatusToPaymentStatus(String(statusResponse?.transaction_status ?? ""));
  if (mapped === "pending") return { ok: true, status: "pending" };

  const admin = createAdminClient();
  const { error } = await admin.rpc("settle_gateway_payment", {
    p_order_id: orderId,
    p_method: payment.method,
    p_amount: Number(payment.amount),
    p_reference_no: payment.reference_no as unknown as string,
    p_gateway_response: (statusResponse ?? null) as never,
    p_status: mapped,
  });

  if (error) return { ok: false, error: friendlyError(error.message) };

  revalidatePath("/pos");
  revalidatePath("/pos/tables");
  revalidatePath("/admin/reports");

  return { ok: true, status: mapped };
}

export async function voidOrderAction(input: {
  orderId: string;
  reason: string;
  managerPin?: string;
}): Promise<ActionResult<{ orderId: string }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesi berakhir, silakan login ulang." };

  if (session.role === "manager") {
    const supabase = await createClient();
    const { error } = await supabase.rpc("void_order", {
      p_order_id: input.orderId,
      p_reason: input.reason,
    });
    if (error) return { ok: false, error: friendlyError(error.message) };
    revalidatePath("/pos");
    revalidatePath("/pos/tables");
    revalidatePath("/kds");
    return { ok: true, data: { orderId: input.orderId } };
  }

  if (!input.managerPin) {
    return { ok: false, error: "Butuh approval manager.", needsApproval: true };
  }

  if (pinRateLimited(`${session.staffId}:void`)) {
    return { ok: false, error: "Terlalu banyak percobaan PIN. Tunggu sebentar." };
  }

  const approver = await verifyManagerPin(session.outletId, input.managerPin);
  if (!approver) return { ok: false, error: "PIN manager salah.", needsApproval: true };

  const admin = createAdminClient();
  const { error } = await admin.rpc("void_order", {
    p_order_id: input.orderId,
    p_reason: input.reason,
    p_approved_by: approver.id,
  });

  if (error) return { ok: false, error: friendlyError(error.message) };

  revalidatePath("/pos");
  revalidatePath("/pos/tables");
  revalidatePath("/kds");
  return { ok: true, data: { orderId: input.orderId } };
}
