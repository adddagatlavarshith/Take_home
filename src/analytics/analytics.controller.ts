import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsOptional, IsEnum, IsDate } from 'class-validator';
import { Type } from 'class-transformer';

import { AnalyticsService } from './analytics.service';
import { Roles } from '../common/decorators/roles.decorator';

class AnalyticsDateRangeDto {
  @ApiPropertyOptional({ enum: ['day', 'week'], default: 'day' })
  @IsOptional()
  @IsEnum(['day', 'week'])
  granularity?: 'day' | 'week' = 'day';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

@ApiTags('analytics')
@ApiBearerAuth()
@Controller({ path: 'analytics', version: '1' })
@Roles(UserRole.admin)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('consultations')
  @ApiOperation({ summary: 'Admin: consultation counts by period and status' })
  consultations(@Query() q: AnalyticsDateRangeDto) {
    const from = q.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = q.to ?? new Date();
    return this.analyticsService.getConsultationStats(q.granularity ?? 'day', from, to);
  }

  @Get('top-specialties')
  @ApiOperation({ summary: 'Admin: top specialties by consultation count' })
  topSpecialties(@Query() q: AnalyticsDateRangeDto) {
    const from = q.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = q.to ?? new Date();
    return this.analyticsService.getTopSpecialties(from, to);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Admin: revenue by day' })
  revenue(@Query() q: AnalyticsDateRangeDto) {
    const from = q.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = q.to ?? new Date();
    return this.analyticsService.getRevenue(from, to);
  }

  @Get('doctor-utilization')
  @ApiOperation({ summary: 'Admin: doctor slot utilization over last 30 days' })
  doctorUtilization() {
    return this.analyticsService.getDoctorUtilization();
  }
}
