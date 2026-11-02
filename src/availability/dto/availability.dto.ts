import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ConsultationMode } from '@prisma/client';

export class CreateAvailabilityRuleDto {
  @ApiProperty({ description: '0=Sunday, 6=Saturday', minimum: 0, maximum: 6 })
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @ApiProperty({ example: '09:00', description: 'HH:MM in 24h format' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime must be HH:MM' })
  startTime!: string;

  @ApiProperty({ example: '17:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'endTime must be HH:MM' })
  endTime!: string;

  @ApiPropertyOptional({ default: 30, minimum: 15, maximum: 120 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(120)
  slotDurationMin?: number;

  @ApiPropertyOptional({ enum: ConsultationMode })
  @IsOptional()
  @IsEnum(ConsultationMode)
  mode?: ConsultationMode;
}

export class ListSlotsQueryDto {
  @ApiProperty({ description: 'ISO date string start', example: '2026-11-03' })
  @IsString()
  from!: string;

  @ApiProperty({ description: 'ISO date string end (inclusive)', example: '2026-11-10' })
  @IsString()
  to!: string;

  @ApiPropertyOptional({ enum: ConsultationMode })
  @IsOptional()
  @IsEnum(ConsultationMode)
  mode?: ConsultationMode;
}
