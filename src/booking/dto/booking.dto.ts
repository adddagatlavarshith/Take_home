import { IsUUID, IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationMode } from '@prisma/client';

export class HoldSlotDto {
  @ApiProperty({ description: 'Slot ID to hold' })
  @IsUUID()
  slotId!: string;

  @ApiPropertyOptional({ enum: ConsultationMode })
  @IsOptional()
  @IsEnum(ConsultationMode)
  mode?: ConsultationMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ConfirmBookingDto {
  @ApiProperty({ description: 'Mock payment method token' })
  @IsString()
  @IsNotEmpty()
  paymentMethodToken!: string;
}
