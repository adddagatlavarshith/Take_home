import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AvailabilityService } from './availability.service';
import { PrismaService } from '../infra/prisma.service';

export const AVAILABILITY_QUEUE = 'availability';
export const MATERIALIZE_SLOTS_JOB = 'materialize-slots';
export const MATERIALIZE_ALL_JOB = 'materialize-all';

@Processor(AVAILABILITY_QUEUE)
@Injectable()
export class AvailabilityWorker extends WorkerHost {
  private readonly logger = new Logger(AvailabilityWorker.name);

  constructor(
    private readonly availabilityService: AvailabilityService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name === MATERIALIZE_SLOTS_JOB) {
      const { doctorId } = job.data as { doctorId: string };
      return this.availabilityService.materializeSlots(doctorId, 14);
    }

    if (job.name === MATERIALIZE_ALL_JOB) {
      // Daily nightly job: materialize slots for all active doctors
      const doctors = await this.prisma.doctor.findMany({
        where: { verified: true, user: { status: 'active' } },
        select: { id: true },
      });
      this.logger.log(`Materializing slots for ${doctors.length} doctors`);
      const results = await Promise.allSettled(
        doctors.map((d) => this.availabilityService.materializeSlots(d.id, 14)),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      this.logger.log(`Slot materialization done: ${doctors.length - failed} ok, ${failed} failed`);
      return { total: doctors.length, failed };
    }

    this.logger.warn(`Unknown job: ${job.name}`);
    return null;
  }
}
