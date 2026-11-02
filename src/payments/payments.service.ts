import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PaymentStatus, SlotStatus, ConsultationStatus } from '@prisma/client';
import { PrismaService } from '../infra/prisma.service';
import { PAYMENT_GATEWAY, PaymentGateway } from './payment-gateway.interface';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly metrics: MetricsService,
  ) {}

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    return this.gateway.verifyWebhookSignature(rawBody, signature);
  }

  async handleWebhookEvent(rawBody: Buffer): Promise<{ processed: boolean; reason?: string }> {
    const event = this.gateway.parseWebhookEvent(rawBody);

    // Idempotency: check if this provider event was already processed
    const existingEvent = await this.prisma.paymentEvent.findUnique({
      where: { providerEventId: event.eventId },
    });

    if (existingEvent) {
      this.logger.warn({ eventId: event.eventId }, 'Duplicate webhook event ignored');
      return { processed: false, reason: 'duplicate' };
    }

    // Find the payment by provider reference
    const payment = await this.prisma.payment.findFirst({
      where: { providerRef: event.intentId },
      include: {
        consultation: { include: { slot: true } },
      },
    });

    const rawJson = JSON.parse(rawBody.toString()) as object;

    if (!payment) {
      this.logger.warn({ intentId: event.intentId }, 'No payment found for webhook event');
      await this.prisma.paymentEvent.create({
        data: {
          providerEventId: event.eventId,
          eventType: event.eventType,
          raw: rawJson,
          processedAt: new Date(),
        },
      });
      return { processed: false, reason: 'payment_not_found' };
    }

    await this.prisma.paymentEvent.create({
      data: {
        providerEventId: event.eventId,
        paymentId: payment.id,
        eventType: event.eventType,
        raw: rawJson,
        processedAt: new Date(),
      },
    });

    if (event.status === 'captured') {
      await this.handleCapture(payment.id, payment.consultation, event.amountCents, payment.providerRef ?? '');
    } else if (event.status === 'failed') {
      await this.handleFailure(payment.id, payment.consultation);
    } else if (event.status === 'refunded') {
      await this.handleRefund(payment.id);
    }

    return { processed: true };
  }

  private async handleCapture(
    paymentId: string,
    consultation: { id: string; slot: { id: string; status: SlotStatus; heldUntil: Date | null } | null } | null,
    amountCents: number,
    providerRef: string,
  ) {
    if (!consultation) {
      this.logger.error({ paymentId }, 'Payment has no consultation');
      return;
    }

    const slot = consultation.slot;
    if (!slot) {
      this.logger.error({ consultationId: consultation.id }, 'Consultation has no slot');
      return;
    }

    // Guard: slot must still be payment_pending; if expired, trigger refund
    if (slot.status !== SlotStatus.payment_pending) {
      this.logger.warn(
        { slotId: slot.id, status: slot.status },
        'Late capture on non-payment_pending slot — triggering refund',
      );
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.captured, amountCents },
      });
      await this.gateway.refund(providerRef, amountCents);
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.refunded },
      });
      return;
    }

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.captured, amountCents },
      }),
      this.prisma.availabilitySlot.update({
        where: { id: slot.id },
        data: { status: SlotStatus.booked, heldUntil: null },
      }),
      this.prisma.consultation.update({
        where: { id: consultation.id },
        data: { status: ConsultationStatus.scheduled },
      }),
    ]);

    this.metrics.recordBooking('booked');
    this.metrics.recordPayment('captured');
    this.logger.log({ consultationId: consultation.id }, 'Booking confirmed — consultation scheduled');
  }

  private async handleFailure(
    paymentId: string,
    consultation: { id: string; slot: { id: string } | null } | null,
  ) {
    if (!consultation) return;

    const ops: ReturnType<typeof this.prisma.payment.update>[] = [
      this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.failed },
      }),
      this.prisma.consultation.update({
        where: { id: consultation.id },
        data: { status: ConsultationStatus.cancelled, cancellationReason: 'Payment failed' },
      }) as never,
    ];

    if (consultation.slot) {
      ops.push(
        this.prisma.availabilitySlot.update({
          where: { id: consultation.slot.id },
          data: { status: SlotStatus.available, heldUntil: null, consultationId: null },
        }) as never,
      );
    }

    await this.prisma.$transaction(ops);
    this.metrics.recordPayment('failed');
  }

  private async handleRefund(paymentId: string) {
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.refunded },
    });
    this.metrics.recordPayment('refunded');
  }

  async getPayment(paymentId: string, requesterId: string, requesterRole: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { consultation: true },
    });

    if (!payment) throw new NotFoundException('Payment not found');
    if (requesterRole !== 'admin' && payment.userId !== requesterId) {
      throw new ForbiddenException('Not your payment');
    }

    return payment;
  }

  async adminRefund(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== PaymentStatus.captured) {
      throw new ConflictException(`Cannot refund a payment with status '${payment.status}'`);
    }

    const result = await this.gateway.refund(payment.providerRef ?? '', payment.amountCents);
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.refunded },
    });

    return result;
  }
}
