import "server-only";

import type { PaymentMethod, PaymentProvider, PaymentRequest, PaymentResult } from "./types";

export function isMidtransConfigured() {
  return Boolean(process.env.MIDTRANS_SERVER_KEY);
}

const MIDTRANS_PAYMENT_TYPE: Partial<Record<PaymentMethod, string>> = {
  qris: "qris",
  ewallet: "gopay",
  card: "credit_card",
};

function baseUrl() {
  return process.env.MIDTRANS_IS_PRODUCTION === "true"
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
}

function authHeader(serverKey: string) {
  return `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
}

export class MidtransProvider implements PaymentProvider {
  constructor(readonly method: PaymentMethod) {}

  async charge(request: PaymentRequest): Promise<PaymentResult> {
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) {
      return { status: "failed", gatewayResponse: { error: "gateway_not_configured" } };
    }

    const paymentType = MIDTRANS_PAYMENT_TYPE[request.method];
    if (!paymentType) {
      return { status: "failed", gatewayResponse: { error: "method_not_supported" } };
    }

    const midtransOrderId = `${request.orderNumber}-${(request.idempotencyKey ?? crypto.randomUUID())
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 10)}`.slice(0, 50);

    const payload: Record<string, unknown> = {
      payment_type: paymentType,
      transaction_details: {
        order_id: midtransOrderId,
        gross_amount: Math.round(request.amount),
      },
    };

    if (request.method === "qris") {
      payload.qris = { acquirer: "gopay" };
    } else if (request.method === "ewallet") {
      payload.gopay = {
        enable_callback: true,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/pos`,
      };
    } else if (request.method === "card") {
      // Core API card charges need a card token from the client (3DS).
      return { status: "failed", gatewayResponse: { error: "card_requires_token" } };
    }

    let json: Record<string, unknown>;

    try {
      const response = await fetch(`${baseUrl()}/v2/charge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: authHeader(serverKey),
        },
        body: JSON.stringify(payload),
      });
      json = (await response.json()) as Record<string, unknown>;
    } catch (error) {
      return {
        status: "failed",
        gatewayResponse: { error: "gateway_unreachable", message: (error as Error).message },
      };
    }

    const transactionStatus = String(json.transaction_status ?? "");
    const transactionId = json.transaction_id ? String(json.transaction_id) : undefined;
    const actions = Array.isArray(json.actions) ? (json.actions as { name: string; url: string }[]) : [];

    if (transactionStatus === "settlement" || transactionStatus === "capture") {
      return { status: "paid", referenceNo: transactionId, gatewayResponse: json };
    }

    if (transactionStatus === "pending") {
      return {
        status: "pending",
        referenceNo: transactionId,
        gatewayResponse: json,
        instructions: {
          midtransOrderId,
          qrUrl: actions.find((action) => action.name === "generate-qr-code")?.url ?? null,
          deeplink: actions.find((action) => action.name === "deeplink-redirect")?.url ?? null,
          expiresAt: json.expiry_time ?? null,
        },
      };
    }

    return { status: "failed", referenceNo: transactionId, gatewayResponse: json };
  }
}

export async function fetchMidtransStatus(midtransOrderId: string) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return null;

  try {
    const response = await fetch(`${baseUrl()}/v2/${encodeURIComponent(midtransOrderId)}/status`, {
      headers: {
        Accept: "application/json",
        Authorization: authHeader(serverKey),
      },
      cache: "no-store",
    });

    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function midtransStatusToPaymentStatus(transactionStatus: string) {
  if (transactionStatus === "settlement" || transactionStatus === "capture") return "paid" as const;
  if (["deny", "cancel", "expire", "failure"].includes(transactionStatus)) return "failed" as const;
  return "pending" as const;
}
