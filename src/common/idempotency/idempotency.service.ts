import {
  Injectable,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../infra/prisma.service';

export interface IdempotencyResult {
  hit: boolean;
  statusCode?: number;
  body?: unknown;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(private readonly prisma: PrismaService) {}

  private hashBody(body: unknown): string {
    return createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');
  }

  async check(
    userId: string,
    key: string,
    route: string,
    requestBody: unknown,
  ): Promise<IdempotencyResult> {
    const requestHash = this.hashBody(requestBody);
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { userId_key_route: { userId, key, route } },
    });

    if (!existing) return { hit: false };

    if (existing.requestHash !== requestHash) {
      throw new UnprocessableEntityException(
        'Idempotency key reused with a different request body',
      );
    }

    if (existing.status === 'processing') {
      // in-flight; tell caller to return 409 or retry
      throw new UnprocessableEntityException(
        'Request with this idempotency key is still processing',
      );
    }

    this.logger.debug({ userId, key, route }, 'Idempotency cache hit');
    return {
      hit: true,
      statusCode: existing.statusCode ?? 200,
      body: existing.responseBody,
    };
  }

  async start(userId: string, key: string, route: string, requestBody: unknown): Promise<void> {
    const requestHash = this.hashBody(requestBody);
    const expiresAt = new Date(Date.now() + this.TTL_MS);
    await this.prisma.idempotencyKey.upsert({
      where: { userId_key_route: { userId, key, route } },
      create: { userId, key, route, requestHash, status: 'processing', expiresAt },
      update: { status: 'processing' },
    });
  }

  async complete(
    userId: string,
    key: string,
    route: string,
    statusCode: number,
    responseBody: unknown,
  ): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: { userId_key_route: { userId, key, route } },
      data: {
        statusCode,
        responseBody: responseBody as object,
        status: 'completed',
      },
    });
  }
}
