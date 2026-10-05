import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { midtransStatusToPaymentStatus } from "@/lib/payments/midtrans";
import { createAdminClient } from "@/lib/supabase/admin";

type MidtransNotification = {
  order_id: string;
  transaction_id: string;
  transaction_status: string;
  fraud_status?: string;
  gross_amount: string;
  status_code: string;
  signature_key: string;
  payment_type?: string;
  [key: string]: unknown;
};

export async function POST(request: Request) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;

  if (!serverKey) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  let payload: MidtransNotification;

  try {
    payload = (await request.json()) as MidtransNotification;
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const expected = createHash("sha512")
    .update(`${payload.order_id}${payload.status_code}${payload.gross_amount}${serverKey}`)
    .digest("hex");
  const provided = payload.signature_key ?? "";

  if (
    expected.length !== provided.length ||
    !timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(provided, "utf8"))
  ) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const admin = createAdminClient();

  const byTransaction = await admin
    .from("payments")
    .select("order_id, method, amount")
    .eq("reference_no", payload.transaction_id)
    .maybeSingle();

  let payment = byTransaction.data;

  if (!payment) {
    const byOrder = await admin
      .from("payments")
      .select("order_id, method, amount")
      .filter("gateway_response->>order_id", "eq", payload.order_id)
      .maybeSingle();
    payment = byOrder.data;
  }

  if (!payment) {
    return NextResponse.json({ error: "payment_not_found" }, { status: 404 });
  }

  const mapped = midtransStatusToPaymentStatus(payload.transaction_status);

  if (mapped === "pending") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { error } = await admin.rpc("settle_gateway_payment", {
    p_order_id: payment.order_id,
    p_method: payment.method,
    p_amount: Number(payment.amount),
    p_reference_no: payload.transaction_id,
    p_gateway_response: payload as never,
    p_status: mapped,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: mapped });
}
