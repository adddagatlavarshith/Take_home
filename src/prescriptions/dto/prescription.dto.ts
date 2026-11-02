import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PrescriptionItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  drugName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  dosage!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  frequency!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructions?: string;
}

export class CreatePrescriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [PrescriptionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items!: PrescriptionItemDto[];
}
