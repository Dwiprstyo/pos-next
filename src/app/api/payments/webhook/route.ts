import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

type WebhookPayload = {
  order_id: string;
  method: "cash" | "qris" | "card" | "ewallet";
  amount: number;
  reference_no: string;
  gateway_response?: Record<string, unknown>;
};

function verifySignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.replace(/^sha256=/, "");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(request: Request) {
  const secret = process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get("x-signature"), secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: WebhookPayload;

  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  if (!payload.order_id || !payload.method || !payload.amount || !payload.reference_no) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("settle_gateway_payment", {
    p_order_id: payload.order_id,
    p_method: payload.method,
    p_amount: payload.amount,
    p_reference_no: payload.reference_no,
    p_gateway_response: (payload.gateway_response ?? null) as never,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, order_id: data.id, status: data.status });
}
