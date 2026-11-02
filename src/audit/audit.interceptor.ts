import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { Request } from 'express';
import { AuditService } from './audit.service';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();

    if (!WRITE_METHODS.has(req.method)) {
      return next.handle();
    }

    const user = (req as { user?: { sub?: string; role?: string } }).user;
    const requestId = (req.headers['x-request-id'] as string) ?? '';
    const action = `${req.method} ${req.route?.path ?? req.path}`;

    return next.handle().pipe(
      tap((responseBody) => {
        const entityId = this.extractEntityId(responseBody as Record<string, unknown>);
        const entityType = this.extractEntityType(req.path);

        this.auditService.log({
          actorUserId: user?.sub,
          actorRole: user?.role,
          action,
          entityType,
          entityId,
          after: responseBody as object,
          requestId,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        }).catch((err: unknown) => this.logger.error({ err }, 'Failed to write audit log'));
      }),
      catchError((err: unknown) => throwError(() => err)),
    );
  }

  private extractEntityId(body: Record<string, unknown>): string {
    return (body?.id as string) ?? (body?.holdId as string) ?? (body?.paymentId as string) ?? 'unknown';
  }

  private extractEntityType(path: string): string {
    const parts = path.split('/').filter(Boolean);
    // Find the segment after /v1/
    const v1Idx = parts.indexOf('v1');
    const segment = v1Idx >= 0 ? parts[v1Idx + 1] : parts[1];
    return segment ?? 'unknown';
  }
}
