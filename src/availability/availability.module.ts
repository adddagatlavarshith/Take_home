import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { AvailabilityService } from './availability.service';
import { AvailabilityController } from './availability.controller';
import { AvailabilityWorker, AVAILABILITY_QUEUE } from './availability.worker';

@Module({
  imports: [
    BullModule.registerQueue({ name: AVAILABILITY_QUEUE }),
  ],
  providers: [AvailabilityService, AvailabilityWorker],
  controllers: [AvailabilityController],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
