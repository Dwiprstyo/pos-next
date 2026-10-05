import "server-only";

import { CashPaymentProvider } from "./cash";
import { isMidtransConfigured, MidtransProvider } from "./midtrans";
import type { PaymentMethod, PaymentProvider } from "./types";

class DisabledGatewayProvider implements PaymentProvider {
  constructor(readonly method: PaymentMethod) {}

  async charge() {
    return {
      status: "failed" as const,
      gatewayResponse: { error: "gateway_not_configured" },
    };
  }
}

export function getPaymentProvider(method: PaymentMethod): PaymentProvider {
  if (method === "cash") return new CashPaymentProvider();

  if (isMidtransConfigured()) return new MidtransProvider(method);

  return new DisabledGatewayProvider(method);
}

export { isMidtransConfigured };
export type { PaymentMethod, PaymentProvider, PaymentRequest, PaymentResult } from "./types";
