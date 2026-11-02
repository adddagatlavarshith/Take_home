import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { BookingWorker, BOOKING_QUEUE } from './booking.worker';
import { PAYMENT_GATEWAY } from '../payments/payment-gateway.interface';
import { MockPaymentGateway } from '../payments/mock-payment-gateway';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: BOOKING_QUEUE }),
    IdempotencyModule,
    MetricsModule,
  ],
  providers: [
    BookingService,
    BookingWorker,
    { provide: PAYMENT_GATEWAY, useClass: MockPaymentGateway },
  ],
  controllers: [BookingController],
  exports: [BookingService],
})
export class BookingModule {}
