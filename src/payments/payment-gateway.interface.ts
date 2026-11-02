export interface PaymentIntent {
  id: string;
  clientSecret: string;
  amountCents: number;
  currency: string;
  status: 'requires_capture' | 'captured' | 'failed' | 'refunded';
}

export interface RefundResult {
  refundId: string;
  status: 'pending' | 'succeeded' | 'failed';
}

export const PAYMENT_GATEWAY = 'PAYMENT_GATEWAY';

export interface PaymentGateway {
  createIntent(
    amountCents: number,
    currency: string,
    metadata: Record<string, string>,
  ): Promise<PaymentIntent>;

  captureIntent(intentId: string): Promise<PaymentIntent>;

  refund(intentId: string, amountCents: number): Promise<RefundResult>;

  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean;

  parseWebhookEvent(payload: string | Buffer): {
    eventId: string;
    eventType: string;
    intentId: string;
    status: 'authorized' | 'captured' | 'failed' | 'refunded';
    amountCents: number;
  };
}
