import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { AvailabilityService } from './availability.service';
import { CreateAvailabilityRuleDto, ListSlotsQueryDto } from './dto/availability.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('availability')
@ApiBearerAuth()
@Controller({ path: 'doctors', version: '1' })
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Post(':doctorId/availability-rules')
  @Roles(UserRole.admin, UserRole.doctor)
  @ApiOperation({ summary: 'Create availability rule for a doctor' })
  createRule(
    @Param('doctorId') doctorId: string,
    @Body() dto: CreateAvailabilityRuleDto,
    @CurrentUser() _user: JwtPayload,
  ) {
    return this.availabilityService.createRule(doctorId, dto);
  }

  @Get(':doctorId/availability-rules')
  @ApiOperation({ summary: 'List availability rules for a doctor' })
  listRules(@Param('doctorId') doctorId: string) {
    return this.availabilityService.listRules(doctorId);
  }

  @Get(':doctorId/slots')
  @ApiOperation({ summary: 'List available slots for a doctor in a date range' })
  listSlots(
    @Param('doctorId') doctorId: string,
    @Query() query: ListSlotsQueryDto,
  ) {
    return this.availabilityService.listSlots(doctorId, query);
  }
}
