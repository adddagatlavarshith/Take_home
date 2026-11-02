import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BookingService } from './booking.service';

export const BOOKING_QUEUE = 'booking';
export const RELEASE_EXPIRED_HOLDS_JOB = 'release-expired-holds';

@Processor(BOOKING_QUEUE)
@Injectable()
export class BookingWorker extends WorkerHost {
  private readonly logger = new Logger(BookingWorker.name);

  constructor(private readonly bookingService: BookingService) {
    super();
  }

  async process(job: Job) {
    if (job.name === RELEASE_EXPIRED_HOLDS_JOB) {
      const released = await this.bookingService.releaseExpiredHolds();
      this.logger.log(`Released ${released} expired holds`);
      return { released };
    }

    this.logger.warn(`Unknown job: ${job.name}`);
    return null;
  }
}
