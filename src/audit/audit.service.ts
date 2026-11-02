import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../infra/prisma.service';
import { paginate, PaginationDto } from '../common/dto/pagination.dto';

export interface AuditEntry {
  actorUserId?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: object;
  after?: object;
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId,
        actorRole: entry.actorRole,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before ?? undefined,
        after: entry.after ?? undefined,
        requestId: entry.requestId,
        ip: entry.ip,
        userAgent: entry.userAgent,
      },
    });
  }

  async query(params: {
    entityType?: string;
    entityId?: string;
    actorUserId?: string;
    from?: Date;
    to?: Date;
  } & PaginationDto) {
    const where = {
      ...(params.entityType && { entityType: params.entityType }),
      ...(params.entityId && { entityId: params.entityId }),
      ...(params.actorUserId && { actorUserId: params.actorUserId }),
      ...((params.from || params.to) && {
        createdAt: {
          ...(params.from && { gte: params.from }),
          ...(params.to && { lte: params.to }),
        },
      }),
    };

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginate(logs, total, params);
  }
}
