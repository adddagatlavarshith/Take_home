import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { MockPaymentGateway } from './mock-payment-gateway';
import { PAYMENT_GATEWAY } from './payment-gateway.interface';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [MetricsModule],
  providers: [
    PaymentsService,
    { provide: PAYMENT_GATEWAY, useClass: MockPaymentGateway },
  ],
  controllers: [PaymentsController],
  exports: [PaymentsService, PAYMENT_GATEWAY],
})
export class PaymentsModule {}
