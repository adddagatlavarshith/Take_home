import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PaymentGateway, PaymentIntent, RefundResult } from './payment-gateway.interface';

@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  private readonly logger = new Logger(MockPaymentGateway.name);
  private readonly webhookSecret: string;

  constructor() {
    this.webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev-webhook-secret';
  }

  async createIntent(
    amountCents: number,
    currency: string,
    metadata: Record<string, string>,
  ): Promise<PaymentIntent> {
    const id = `pi_mock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this.logger.debug({ id, amountCents, currency, metadata }, 'Mock payment intent created');
    return {
      id,
      clientSecret: `${id}_secret_mock`,
      amountCents,
      currency,
      status: 'requires_capture',
    };
  }

  async captureIntent(intentId: string): Promise<PaymentIntent> {
    this.logger.debug({ intentId }, 'Mock payment intent captured');
    return {
      id: intentId,
      clientSecret: `${intentId}_secret_mock`,
      amountCents: 0,
      currency: 'USD',
      status: 'captured',
    };
  }

  async refund(intentId: string, amountCents: number): Promise<RefundResult> {
    this.logger.debug({ intentId, amountCents }, 'Mock refund initiated');
    return { refundId: `re_mock_${Date.now()}`, status: 'succeeded' };
  }

  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    const expected = createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  parseWebhookEvent(payload: string | Buffer) {
    const body = typeof payload === 'string' ? JSON.parse(payload) : JSON.parse(payload.toString());
    return {
      eventId: body.id as string,
      eventType: body.type as string,
      intentId: body.data?.object?.id as string,
      status: body.data?.object?.status as 'authorized' | 'captured' | 'failed' | 'refunded',
      amountCents: (body.data?.object?.amount_cents as number) ?? 0,
    };
  }
}
