export type PaymentMethod = "cash" | "qris" | "card" | "ewallet";

export type PaymentRequest = {
  orderId: string;
  orderNumber: number | string;
  amount: number;
  method: PaymentMethod;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export type PaymentResult = {
  status: "paid" | "pending" | "failed";
  referenceNo?: string;
  gatewayResponse?: Record<string, unknown>;
  /** Payload the client needs to complete the payment (QR string, redirect URL, ...). */
  instructions?: Record<string, unknown>;
};

export interface PaymentProvider {
  readonly method: PaymentMethod;
  charge(request: PaymentRequest): Promise<PaymentResult>;
}
