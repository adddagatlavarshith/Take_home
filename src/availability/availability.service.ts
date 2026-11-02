import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConsultationMode, SlotStatus } from '@prisma/client';
import { PrismaService } from '../infra/prisma.service';
import { CreateAvailabilityRuleDto, ListSlotsQueryDto } from './dto/availability.dto';

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createRule(doctorId: string, dto: CreateAvailabilityRuleDto) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const [startH, startM] = dto.startTime.split(':').map(Number);
    const [endH, endM] = dto.endTime.split(':').map(Number);
    if (endH * 60 + endM <= startH * 60 + startM) {
      throw new BadRequestException('endTime must be after startTime');
    }

    return this.prisma.availabilityRule.create({
      data: {
        doctorId,
        weekday: dto.weekday,
        startTime: dto.startTime,
        endTime: dto.endTime,
        slotDurationMin: dto.slotDurationMin ?? 30,
        mode: dto.mode ?? ConsultationMode.online,
      },
    });
  }

  async listRules(doctorId: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    return this.prisma.availabilityRule.findMany({
      where: { doctorId, isActive: true },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
  }

  async listSlots(doctorId: string, query: ListSlotsQueryDto) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const from = new Date(query.from);
    const to = new Date(query.to);
    to.setHours(23, 59, 59, 999);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    return this.prisma.availabilitySlot.findMany({
      where: {
        doctorId,
        startAt: { gte: from, lte: to },
        status: SlotStatus.available,
        ...(query.mode && { mode: query.mode }),
      },
      orderBy: { startAt: 'asc' },
    });
  }

  /** Materializes slots for a doctor for the next N days based on their rules. */
  async materializeSlots(doctorId: string, daysAhead = 14) {
    const rules = await this.prisma.availabilityRule.findMany({
      where: { doctorId, isActive: true },
    });

    if (rules.length === 0) return { created: 0 };

    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + daysAhead);

    const slotsToCreate: Array<{
      doctorId: string;
      startAt: Date;
      endAt: Date;
      mode: ConsultationMode;
      status: SlotStatus;
    }> = [];

    for (const rule of rules) {
      const cursor = new Date(now);
      cursor.setHours(0, 0, 0, 0);

      while (cursor <= end) {
        if (cursor.getDay() === rule.weekday) {
          const [startH, startM] = rule.startTime.split(':').map(Number);
          const [endH, endM] = rule.endTime.split(':').map(Number);

          let slotStart = new Date(cursor);
          slotStart.setHours(startH, startM, 0, 0);
          const dayEnd = new Date(cursor);
          dayEnd.setHours(endH, endM, 0, 0);

          while (slotStart < dayEnd) {
            const slotEnd = new Date(slotStart.getTime() + rule.slotDurationMin * 60 * 1000);
            if (slotEnd > dayEnd) break;
            if (slotStart > now) {
              slotsToCreate.push({
                doctorId,
                startAt: new Date(slotStart),
                endAt: new Date(slotEnd),
                mode: rule.mode,
                status: SlotStatus.available,
              });
            }
            slotStart = slotEnd;
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    // Upsert to avoid duplicate creation; the DB exclusion constraint is the final guard
    let created = 0;
    for (const slot of slotsToCreate) {
      try {
        await this.prisma.availabilitySlot.upsert({
          where: { doctorId_startAt: { doctorId: slot.doctorId, startAt: slot.startAt } },
          create: slot,
          update: {}, // don't overwrite existing slot status
        });
        created++;
      } catch (err: unknown) {
        // Overlap exclusion constraint or unique violation — skip the conflicting slot
        if (
          err instanceof Error &&
          (err.message.includes('no_overlapping_doctor_slots') ||
            err.message.includes('Unique constraint'))
        ) {
          this.logger.warn({ doctorId, startAt: slot.startAt }, 'Slot conflict during materialization');
        } else {
          throw err;
        }
      }
    }

    this.logger.log({ doctorId, created, total: slotsToCreate.length }, 'Slots materialized');
    return { created };
  }
}
