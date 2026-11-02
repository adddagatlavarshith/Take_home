import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ConsultationStatus } from '@prisma/client';
import { PrismaService } from '../infra/prisma.service';
import { CreatePrescriptionDto } from './dto/prescription.dto';

@Injectable()
export class PrescriptionsService {
  private readonly logger = new Logger(PrescriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createPrescription(consultationId: string, doctorId: string, dto: CreatePrescriptionDto) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!consultation) throw new NotFoundException('Consultation not found');
    if (consultation.doctorId !== doctorId) {
      throw new ForbiddenException('Not your consultation');
    }
    if (
      consultation.status !== ConsultationStatus.in_progress &&
      consultation.status !== ConsultationStatus.completed
    ) {
      throw new ConflictException(
        'Prescriptions can only be created during or after an in-progress consultation',
      );
    }

    // Version: count existing prescriptions for this consultation
    const existingCount = await this.prisma.prescription.count({
      where: { consultationId },
    });

    const prescription = await this.prisma.prescription.create({
      data: {
        consultationId,
        doctorId,
        patientId: consultation.patientId,
        version: existingCount + 1,
        signedAt: new Date(),
        prescriptionItems: {
          create: dto.items.map((item) => ({
            drugName: item.drugName,
            dosage: item.dosage,
            frequency: item.frequency,
            durationDays: item.durationDays,
            instructions: item.instructions,
          })),
        },
      },
      include: { prescriptionItems: true },
    });

    this.logger.log(
      { prescriptionId: prescription.id, consultationId, version: prescription.version },
      'Prescription created',
    );

    return prescription;
  }

  async listPrescriptions(consultationId: string, requesterId: string, requesterRole: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!consultation) throw new NotFoundException('Consultation not found');

    const isDoctor = requesterRole === 'doctor' && consultation.doctorId === requesterId;
    const isPatient = requesterRole === 'patient' && consultation.patientId === requesterId;
    const isAdmin = requesterRole === 'admin';

    if (!isDoctor && !isPatient && !isAdmin) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.prescription.findMany({
      where: { consultationId },
      include: { prescriptionItems: true },
      orderBy: { version: 'asc' },
    });
  }

  async getPrescription(id: string, requesterId: string, requesterRole: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: { prescriptionItems: true, consultation: true },
    });

    if (!prescription) throw new NotFoundException('Prescription not found');

    const isDoctor = requesterRole === 'doctor' && prescription.doctorId === requesterId;
    const isPatient = requesterRole === 'patient' && prescription.patientId === requesterId;
    const isAdmin = requesterRole === 'admin';

    if (!isDoctor && !isPatient && !isAdmin) {
      throw new ForbiddenException('Access denied');
    }

    return prescription;
  }
}
