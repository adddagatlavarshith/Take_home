import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationStatus } from '@prisma/client';

export class CancelConsultationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListConsultationsQueryDto {
  @ApiPropertyOptional({ enum: ['patient', 'doctor'] })
  @IsOptional()
  @IsEnum(['patient', 'doctor'])
  role?: 'patient' | 'doctor';

  @ApiPropertyOptional({ enum: ConsultationStatus })
  @IsOptional()
  @IsEnum(ConsultationStatus)
  status?: ConsultationStatus;
}
