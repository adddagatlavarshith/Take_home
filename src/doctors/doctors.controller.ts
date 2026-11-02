import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { DoctorsService } from './doctors.service';
import { CreateDoctorDto, UpdateDoctorDto, SearchDoctorsDto } from './dto/doctor.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('doctors')
@ApiBearerAuth()
@Controller({ path: 'doctors', version: '1' })
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Post()
  @Roles(UserRole.admin)
  @ApiOperation({ summary: '[Admin] Create a new doctor account' })
  create(@Body() dto: CreateDoctorDto) {
    return this.doctorsService.createDoctor(dto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search and filter doctors (Redis cached 60s)' })
  search(@Query() dto: SearchDoctorsDto) {
    return this.doctorsService.searchDoctors(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get doctor profile by ID' })
  getOne(@Param('id') id: string) {
    return this.doctorsService.getDoctorById(id);
  }

  @Patch(':id')
  @Roles(UserRole.admin, UserRole.doctor)
  @ApiOperation({ summary: 'Update doctor profile (self or admin)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDoctorDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.doctorsService.updateDoctor(id, dto, user.sub, user.role);
  }
}
