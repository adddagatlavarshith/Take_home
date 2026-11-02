import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { SlotStatus, ConsultationStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../infra/prisma.service';
import { PAYMENT_GATEWAY, PaymentGateway } from '../payments/payment-gateway.interface';
import { HoldSlotDto, ConfirmBookingDto } from './dto/booking.dto';
import { MetricsService } from '../metrics/metrics.service';

const HOLD_TTL_MINUTES = 10;

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly metrics: MetricsService,
  ) {}

  async holdSlot(patientId: string, dto: HoldSlotDto) {
    const heldUntil = new Date(Date.now() + HOLD_TTL_MINUTES * 60 * 1000);

    // Atomic claim: UPDATE ... WHERE status='available' RETURNING *
    const updated = await this.prisma.$queryRaw<Array<{
      id: string;
      doctor_id: string;
      start_at: Date;
      end_at: Date;
      mode: string;
      consultation_fee_cents: number;
    }>>`
      UPDATE availability_slots s
      SET status = 'held',
          held_until = ${heldUntil},
          updated_at = now()
      FROM doctors d
      WHERE s.id = ${dto.slotId}::uuid
        AND s.status = 'available'
        AND s.doctor_id = d.id
      RETURNING s.id, s.doctor_id, s.start_at, s.end_at, s.mode,
                d.consultation_fee_cents
    `;

    if (updated.length === 0) {
      this.metrics.recordDoubleBookingRejection();
      const slot = await this.prisma.availabilitySlot.findUnique({ where: { id: dto.slotId } });
      if (!slot) throw new NotFoundException('Slot not found');
      throw new ConflictException('Slot is no longer available');
    }

    const slot = updated[0];

    // Create consultation immediately at hold time (PENDING_PAYMENT for reconciliation)
    const consultation = await this.prisma.consultation.create({
      data: {
        patientId,
        doctorId: slot.doctor_id,
        slotId: slot.id,
        status: ConsultationStatus.pending_payment,
        mode: (dto.mode ?? slot.mode) as never,
        scheduledStart: slot.start_at,
        scheduledEnd: slot.end_at,
      },
      include: {
        slot: true,
        doctor: { include: { user: { include: { profile: true } } } },
      },
    });

    this.logger.log({ consultationId: consultation.id, patientId }, 'Slot held');
    this.metrics.recordBooking('held');

    return {
      holdId: consultation.id,
      slotId: slot.id,
      heldUntil,
      scheduledStart: slot.start_at,
      scheduledEnd: slot.end_at,
      doctor: consultation.doctor,
    };
  }

  async confirmBooking(holdId: string, patientId: string, dto: ConfirmBookingDto) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: holdId },
      include: { slot: true, doctor: true },
    });

    if (!consultation) throw new NotFoundException('Hold not found');
    if (consultation.patientId !== patientId) {
      throw new BadRequestException('Not your hold');
    }
    if (consultation.status !== ConsultationStatus.pending_payment) {
      throw new ConflictException(`Hold is in state '${consultation.status}', cannot confirm`);
    }

    const slot = consultation.slot;
    if (!slot || slot.status !== SlotStatus.held || !slot.heldUntil || slot.heldUntil < new Date()) {
      throw new ConflictException('Hold has expired');
    }

    // Transition slot to payment_pending
    await this.prisma.availabilitySlot.update({
      where: { id: slot.id },
      data: { status: SlotStatus.payment_pending },
    });

    // Create payment intent via mock gateway
    const intent = await this.gateway.createIntent(
      consultation.doctor.consultationFeeCents,
      'USD',
      {
        consultationId: consultation.id,
        patientId,
        doctorId: consultation.doctorId,
      },
    );

    // Persist payment record
    const payment = await this.prisma.payment.create({
      data: {
        consultationId: consultation.id,
        userId: patientId,
        amountCents: intent.amountCents,
        currency: intent.currency,
        providerRef: intent.id,
        status: PaymentStatus.initiated,
      },
    });

    this.metrics.recordBooking('payment_pending');

    return {
      paymentId: payment.id,
      providerRef: intent.id,
      clientSecret: intent.clientSecret,
      amountCents: intent.amountCents,
      currency: intent.currency,
    };
  }

  async cancelHold(holdId: string, patientId: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: holdId },
      include: { slot: true },
    });

    if (!consultation) throw new NotFoundException('Hold not found');
    if (consultation.patientId !== patientId) {
      throw new BadRequestException('Not your hold');
    }
    if (
      consultation.status !== ConsultationStatus.pending_payment &&
      consultation.status !== ConsultationStatus.scheduled
    ) {
      throw new ConflictException('Cannot cancel at this stage');
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (consultation.slot) {
      ops.push(
        this.prisma.availabilitySlot.update({
          where: { id: consultation.slot.id },
          data: { status: SlotStatus.available, heldUntil: null, consultationId: null },
        }),
      );
    }
    ops.push(
      this.prisma.consultation.update({
        where: { id: holdId },
        data: {
          status: ConsultationStatus.cancelled,
          cancellationReason: 'Patient cancelled hold',
        },
      }),
    );
    await this.prisma.$transaction(ops);

    return { cancelled: true };
  }

  async releaseExpiredHolds(): Promise<number> {
    const now = new Date();

    // Find expired held/payment_pending slots
    const expired = await this.prisma.availabilitySlot.findMany({
      where: {
        status: { in: [SlotStatus.held, SlotStatus.payment_pending] },
        heldUntil: { lt: now },
      },
      include: { consultation: true },
    });

    if (expired.length === 0) return 0;

    // Flatten all updates into one transaction batch
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const slot of expired) {
      ops.push(
        this.prisma.availabilitySlot.update({
          where: { id: slot.id },
          data: { status: SlotStatus.available, heldUntil: null, consultationId: null },
        }),
      );
      if (slot.consultation) {
        ops.push(
          this.prisma.consultation.update({
            where: { id: slot.consultation.id },
            data: {
              status: ConsultationStatus.cancelled,
              cancellationReason: 'Hold expired',
            },
          }),
        );
      }
    }
    await this.prisma.$transaction(ops);

    this.logger.log(`Released ${expired.length} expired holds`);
    return expired.length;
  }
}
