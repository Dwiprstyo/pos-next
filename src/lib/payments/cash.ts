import type { PaymentProvider, PaymentRequest, PaymentResult } from "./types";

export class CashPaymentProvider implements PaymentProvider {
  readonly method = "cash" as const;

  async charge(request: PaymentRequest): Promise<PaymentResult> {
    return {
      status: "paid",
      referenceNo: `CASH-${request.orderNumber}-${Date.now()}`,
      gatewayResponse: { provider: "cash", tendered: request.metadata?.tendered ?? request.amount },
    };
  }
}
