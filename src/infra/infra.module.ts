import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('app.logLevel', 'info'),
          transport:
            config.get<string>('app.nodeEnv') === 'development'
              ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
              : undefined,
          customProps: () => ({ context: 'HTTP' }),
          quietReqLogger: true,
          genReqId: (req) => req.headers['x-request-id'] as string,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('app.redis.url'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [PrismaService, RedisService],
  exports: [PrismaService, RedisService, BullModule],
})
export class InfraModule {}
