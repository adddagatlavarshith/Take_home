import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  workerMode: process.env.WORKER_MODE === 'true',

  db: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'changeme',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'changeme-refresh',
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '604800', 10),
    mfaIssuer: process.env.MFA_ISSUER ?? 'Amrutam',
    passwordResetTtl: parseInt(process.env.PASSWORD_RESET_TTL ?? '1800', 10),
  },

  encryption: {
    piiKey: process.env.PII_ENCRYPTION_KEY ?? '',
  },

  payment: {
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? 'mock-secret',
    mockAutoCapture: process.env.PAYMENT_MOCK_AUTO_CAPTURE === 'true',
  },

  rateLimit: {
    ttl: parseInt(process.env.RATE_LIMIT_TTL ?? '60', 10),
    limit: parseInt(process.env.RATE_LIMIT_LIMIT ?? '120', 10),
    authLimit: parseInt(process.env.AUTH_RATE_LIMIT_LIMIT ?? '10', 10),
  },

  booking: {
    holdTtlSeconds: parseInt(process.env.BOOKING_HOLD_TTL_SECONDS ?? '600', 10),
    paymentTtlSeconds: parseInt(process.env.BOOKING_PAYMENT_TTL_SECONDS ?? '900', 10),
  },

  otel: {
    disabled: process.env.OTEL_SDK_DISABLED === 'true',
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'amrutam-api',
  },

  admin: {
    bootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@amrutam.local',
    bootstrapPassword: process.env.ADMIN_BOOTSTRAP_PASSWORD ?? 'Admin1!ChangeMe',
  },
}));
