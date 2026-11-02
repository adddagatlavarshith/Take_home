import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ConsultationMode } from '@prisma/client';

export class CreateDoctorDto {
  @ApiProperty({ description: 'Email for the doctor user account' })
  @IsString()
  email!: string;

  @ApiProperty({ description: 'Initial password' })
  @IsString()
  password!: string;

  @ApiProperty({ example: 'Arjun' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Sharma' })
  @IsString()
  lastName!: string;

  @ApiPropertyOptional({ example: ['cardiology', 'internal medicine'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  yearsExperience?: number;

  @ApiPropertyOptional({ description: 'Fee in INR paise (100 = ₹1)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  consultationFeeCents?: number;

  @ApiPropertyOptional({ enum: ConsultationMode })
  @IsOptional()
  @IsEnum(ConsultationMode)
  mode?: ConsultationMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;
}

export class UpdateDoctorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  yearsExperience?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  consultationFeeCents?: number;

  @ApiPropertyOptional({ enum: ConsultationMode })
  @IsOptional()
  @IsEnum(ConsultationMode)
  mode?: ConsultationMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  verified?: boolean;
}

export class SearchDoctorsDto {
  @ApiPropertyOptional({ example: 'cardiology' })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ enum: ConsultationMode })
  @IsOptional()
  @IsEnum(ConsultationMode)
  mode?: ConsultationMode;

  @ApiPropertyOptional({ description: 'Min fee in paise' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  feeMin?: number;

  @ApiPropertyOptional({ description: 'Max fee in paise' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  feeMax?: number;

  @ApiPropertyOptional({ description: 'Text search in bio and name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  get skip() {
    return (this.page - 1) * this.limit;
  }
}
