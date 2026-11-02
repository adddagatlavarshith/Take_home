import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ConsultationsService } from './consultations.service';
import { CancelConsultationDto, ListConsultationsQueryDto } from './dto/consultation.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('consultations')
@ApiBearerAuth()
@Controller({ version: '1' })
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Get('me/consultations')
  @ApiOperation({ summary: 'List my consultations' })
  listMy(@CurrentUser() user: JwtPayload, @Query() query: ListConsultationsQueryDto) {
    return this.consultationsService.listMyConsultations(user.sub, user.role, query);
  }

  @Get('consultations/:id')
  @ApiOperation({ summary: 'Get consultation by id' })
  getOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.consultationsService.getConsultation(id, user.sub, user.role);
  }

  @Post('consultations/:id/start')
  @Roles(UserRole.doctor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Doctor: start consultation' })
  start(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.consultationsService.startConsultation(id, user.sub);
  }

  @Post('consultations/:id/complete')
  @Roles(UserRole.doctor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Doctor: complete consultation' })
  complete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.consultationsService.completeConsultation(id, user.sub);
  }

  @Post('consultations/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel consultation (patient/doctor/admin)' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelConsultationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.consultationsService.cancelConsultation(id, user.sub, user.role, dto);
  }

  @Post('consultations/:id/no-show')
  @Roles(UserRole.doctor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Doctor: mark no-show' })
  noShow(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.consultationsService.markNoShow(id, user.sub);
  }
}
