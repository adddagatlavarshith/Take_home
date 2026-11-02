import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/prescription.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('prescriptions')
@ApiBearerAuth()
@Controller({ version: '1' })
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Post('consultations/:consultationId/prescriptions')
  @Roles(UserRole.doctor)
  @ApiOperation({ summary: 'Doctor: create prescription for consultation' })
  create(
    @Param('consultationId') consultationId: string,
    @Body() dto: CreatePrescriptionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.prescriptionsService.createPrescription(consultationId, user.sub, dto);
  }

  @Get('consultations/:consultationId/prescriptions')
  @ApiOperation({ summary: 'List prescriptions for a consultation' })
  list(
    @Param('consultationId') consultationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.prescriptionsService.listPrescriptions(consultationId, user.sub, user.role);
  }

  @Get('prescriptions/:id')
  @ApiOperation({ summary: 'Get prescription by id' })
  getOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.prescriptionsService.getPrescription(id, user.sub, user.role);
  }
}
