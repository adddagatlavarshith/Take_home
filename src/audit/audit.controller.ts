import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsDate } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { AuditService } from './audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

class AuditQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actor?: string;

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

@ApiTags('audit')
@ApiBearerAuth()
@Controller({ path: 'audit', version: '1' })
@Roles(UserRole.admin)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Admin: query audit logs' })
  query(@Query() q: AuditQueryDto) {
    return this.auditService.query({
      entityType: q.entityType,
      entityId: q.entityId,
      actorUserId: q.actor,
      from: q.from,
      to: q.to,
      page: q.page,
      limit: q.limit,
      // PaginationDto requires skip, but it's computed from page+limit internally
      skip: q.skip,
    });
  }
}
