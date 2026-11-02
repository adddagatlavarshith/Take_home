import { Module } from '@nestjs/common';
import { ConsultationsService } from './consultations.service';
import { ConsultationsController } from './consultations.controller';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [MetricsModule],
  providers: [ConsultationsService],
  controllers: [ConsultationsController],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
