import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ConsultationStatus, SlotStatus } from '@prisma/client';
import { PrismaService } from '../infra/prisma.service';
import { CancelConsultationDto, ListConsultationsQueryDto } from './dto/consultation.dto';
import { MetricsService } from '../metrics/metrics.service';

const ALLOWED_TRANSITIONS: Record<ConsultationStatus, ConsultationStatus[]> = {
  [ConsultationStatus.pending_payment]: [ConsultationStatus.scheduled, ConsultationStatus.cancelled],
  [ConsultationStatus.scheduled]: [ConsultationStatus.in_progress, ConsultationStatus.cancelled, ConsultationStatus.no_show],
  [ConsultationStatus.in_progress]: [ConsultationStatus.completed, ConsultationStatus.cancelled],
  [ConsultationStatus.completed]: [],
  [ConsultationStatus.cancelled]: [],
  [ConsultationStatus.no_show]: [],
};

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  private assertTransition(from: ConsultationStatus, to: ConsultationStatus) {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new ConflictException(
        `Cannot transition consultation from '${from}' to '${to}'`,
      );
    }
  }

  async getConsultation(id: string, requesterId: string, requesterRole: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: {
        slot: true,
        doctor: { include: { user: { include: { profile: true } } } },
        prescriptions: { include: { prescriptionItems: true } },
        payments: true,
      },
    });

    if (!consultation) throw new NotFoundException('Consultation not found');

    const isDoctor = requesterRole === 'doctor' && consultation.doctorId === requesterId;
    const isPatient = requesterRole === 'patient' && consultation.patientId === requesterId;
    const isAdmin = requesterRole === 'admin';

    if (!isDoctor && !isPatient && !isAdmin) {
      throw new ForbiddenException('Access denied');
    }

    return consultation;
  }

  async listMyConsultations(userId: string, role: string, query: ListConsultationsQueryDto) {
    const filterRole = query.role ?? (role === 'doctor' ? 'doctor' : 'patient');
    const where = {
      ...(filterRole === 'doctor' ? { doctorId: userId } : { patientId: userId }),
      ...(query.status && { status: query.status }),
    };

    return this.prisma.consultation.findMany({
      where,
      orderBy: { scheduledStart: 'desc' },
      include: {
        slot: true,
        doctor: { include: { user: { include: { profile: true } } } },
      },
    });
  }

  async startConsultation(id: string, doctorId: string) {
    const consultation = await this.prisma.consultation.findUnique({ where: { id } });
    if (!consultation) throw new NotFoundException('Consultation not found');
    if (consultation.doctorId !== doctorId) {
      throw new ForbiddenException('Not your consultation');
    }

    this.assertTransition(consultation.status, ConsultationStatus.in_progress);

    const updated = await this.prisma.consultation.update({
      where: { id },
      data: { status: ConsultationStatus.in_progress, startedAt: new Date() },
    });

    this.metrics.recordConsultation('in_progress');
    return updated;
  }

  async completeConsultation(id: string, doctorId: string) {
    const consultation = await this.prisma.consultation.findUnique({ where: { id } });
    if (!consultation) throw new NotFoundException('Consultation not found');
    if (consultation.doctorId !== doctorId) {
      throw new ForbiddenException('Not your consultation');
    }

    this.assertTransition(consultation.status, ConsultationStatus.completed);

    const updated = await this.prisma.consultation.update({
      where: { id },
      data: { status: ConsultationStatus.completed, endedAt: new Date() },
    });

    this.metrics.recordConsultation('completed');
    this.logger.log({ consultationId: id, doctorId }, 'Consultation completed');
    return updated;
  }

  async cancelConsultation(id: string, requesterId: string, requesterRole: string, dto: CancelConsultationDto) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: { slot: true },
    });

    if (!consultation) throw new NotFoundException('Consultation not found');

    const isDoctorOwner = requesterRole === 'doctor' && consultation.doctorId === requesterId;
    const isPatientOwner = requesterRole === 'patient' && consultation.patientId === requesterId;
    const isAdmin = requesterRole === 'admin';

    if (!isDoctorOwner && !isPatientOwner && !isAdmin) {
      throw new ForbiddenException('Not your consultation');
    }

    this.assertTransition(consultation.status, ConsultationStatus.cancelled);

    const ops: ReturnType<typeof this.prisma.consultation.update>[] = [
      this.prisma.consultation.update({
        where: { id },
        data: {
          status: ConsultationStatus.cancelled,
          cancellationReason: dto.reason ?? `Cancelled by ${requesterRole}`,
        },
      }),
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

    this.metrics.recordConsultation('cancelled');
    return { cancelled: true };
  }

  async markNoShow(id: string, doctorId: string) {
    const consultation = await this.prisma.consultation.findUnique({ where: { id } });
    if (!consultation) throw new NotFoundException('Consultation not found');
    if (consultation.doctorId !== doctorId) {
      throw new ForbiddenException('Not your consultation');
    }

    this.assertTransition(consultation.status, ConsultationStatus.no_show);

    const updated = await this.prisma.consultation.update({
      where: { id },
      data: { status: ConsultationStatus.no_show },
    });

    this.metrics.recordConsultation('no_show');
    return updated;
  }
}
