# Amrutam Telemedicine Backend

A production-grade telemedicine REST API built as a NestJS modular monolith with PostgreSQL, Redis, and Docker. Implements concurrency-safe booking, idempotent payment processing, TOTP MFA, append-only audit logs, and admin analytics.

## Scope

### Implemented

| Feature | Notes |
|---|---|
| Auth (register/login/refresh/logout) | Argon2id passwords, JWT 15 min access + 7 day rotating refresh |
| TOTP MFA | Patients optional; doctors + admins required and cannot disable |
| RBAC | Per-route `@Roles()` guard; ownership checks in service layer |
| Doctor profiles + search | Specialty/mode/fee/q filters, pagination, Redis cache (60s) |
| Availability rules + slot materialization | Recurring weekly rules; BullMQ nightly job materializes slots |
| **Slot overlap prevention** | `btree_gist` EXCLUDE constraint + atomic UPDATE (belt+braces) |
| **Booking 4-state machine** | AVAILABLE → HELD → PAYMENT_PENDING → BOOKED with all failure edges |
| Consultation lifecycle | 6 states: pending_payment → scheduled → in_progress → completed/cancelled/no_show |
| Prescriptions | Doctor creates versioned JSON prescriptions during/after consultation |
| Payments | Mock gateway behind `PaymentGateway` interface; HMAC-verified webhook |
| **Idempotency** | Per-(user, key, route) with body hash check; webhook replay via `provider_event_id UNIQUE` |
| Audit logs | Append-only interceptor on all writes; admin read API |
| Admin analytics | Consultation counts/period, top specialties, revenue, doctor utilization |
| Rate limiting | ThrottlerGuard; stricter on `/auth/*` |
| Observability | pino structured JSON, Prometheus `/metrics`, OTEL SDK (disabled by default) |
| OpenAPI | Swagger at `/docs` (dev only) |
| Docker | Multi-stage Dockerfile; docker-compose (default + observability profile) |
| CI | GitHub Actions: lint → typecheck → unit → integration/e2e → Docker build → Trivy |

### Simplified (delivered as minimal correct version)

- MFA: TOTP only, no SMS/email backup codes, no recovery flow
- Password reset: token-based, no email delivery (token returned in dev response)
- Payment: mock provider; HMAC webhook flow is real
- PII encryption: pgcrypto column encryption (key from env); TLS at proxy in production
- Observability: app instrumentation shipped; Grafana/Tempo/Loki as optional Compose profile
- Admin analytics: simple SQL aggregates

### Documented Only (no implementation)

- Primary/replica PostgreSQL topology and failover
- Cross-region DR
- Hash-chained audit logs
- Full Prometheus/Grafana/Loki/Tempo production deployment
- Prescription PDF generation
- Full MFA recovery flow
- 99.95% availability (requires multi-AZ RDS + >1 API instance + ALB + health checks; local Docker cannot demonstrate this)

## Architecture at a Glance

```
NestJS App (port 3000)
├── auth / users / doctors / availability
├── booking (4-state machine, BullMQ release worker)
├── consultations / prescriptions
├── payments (mock gateway, HMAC webhook)
├── audit (interceptor + admin API)
├── analytics (admin SQL aggregates)
└── infra (Prisma, Redis, BullMQ, pino, OTEL)
```

See `docs/architecture.md` for the full design, `docs/er-diagram.mmd` for the entity-relationship diagram, and `docs/booking-sequence.mmd` for the booking flow sequence diagram.

## Stack

- **Node.js 20 LTS** + **TypeScript 5.5** (strict)
- **NestJS 10** modular monolith
- **PostgreSQL 16** (system of record)
- **Redis 7** (cache + BullMQ)
- **Prisma 5.22** + raw SQL migrations for Postgres-specific constraints
- **Argon2id** (`argon2` package v0.41.1)
- **pino** structured logs, **prom-client** Prometheus metrics, **OTEL SDK**
- **Jest** + **Supertest** unit tests
- **Docker Compose** + **GitHub Actions** CI

## Prerequisites

- Docker + Docker Compose v2
- Node.js 20+
- `psql` CLI (for constraint verification script)

## Quickstart

```bash
git clone https://github.com/adddagatlavarshith/Take_home.git
cd Take_home
cp .env.example .env
# Edit .env — fill in JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, PII_ENCRYPTION_KEY
# (32+ random characters each)

docker compose up -d
npm install
npm run migrate      # prisma migrate deploy
npm run seed         # 1 admin, 3 doctors, 10 patients, 7 days of slots
npm run start:dev    # hot reload dev server
```

Swagger UI: http://localhost:3000/docs
Health: http://localhost:3000/health/ready

## Env Vars

See `.env.example` for the complete list. **Never commit `.env`**.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Yes | `redis://host:6379` |
| `JWT_ACCESS_SECRET` | Yes | 32+ random chars |
| `JWT_REFRESH_SECRET` | Yes | 32+ random chars |
| `PII_ENCRYPTION_KEY` | Yes | 32+ random chars; pgcrypto PGP key |
| `PAYMENT_WEBHOOK_SECRET` | Yes | HMAC-SHA256 key for webhook verification |
| `OTEL_SDK_DISABLED` | No | `true` (default) disables tracing |

## API Docs

Swagger: `http://localhost:3000/docs` (dev only).

Key endpoints:

```
POST /v1/auth/register          Register patient
POST /v1/auth/login             Login; returns access+refresh or MFA challenge
POST /v1/auth/login/mfa         Complete MFA challenge
GET  /v1/doctors                Search doctors (specialty/mode/fee/q)
GET  /v1/doctors/:id/slots      Available slots for a doctor
POST /v1/bookings/hold          Hold slot (Idempotency-Key required)
POST /v1/bookings/:id/confirm   Confirm hold → payment intent
POST /v1/payments/webhook       Payment webhook (HMAC verified)
POST /v1/consultations/:id/start
POST /v1/consultations/:id/complete
POST /v1/consultations/:id/prescriptions
GET  /v1/analytics/consultations  (admin)
GET  /v1/audit                    (admin)
GET  /metrics                     Prometheus
```

## Tests

```bash
npm test                 # unit tests (state machines, slot math, idempotency)
npm run test:e2e         # integration + e2e (requires postgres + redis)
npm run test:coverage    # coverage report
```

All 27 unit tests cover:
- Slot generation math (16 slots / 8h window, overflow drop)
- Booking 4-state machine (every allowed + forbidden transition)
- Consultation state machine (every allowed + forbidden transition)
- Hold expiry logic
- Idempotency key body hashing

## Observability

```bash
# Start optional observability stack (Grafana, Tempo, Loki, Prometheus)
docker compose -f docker-compose.yml -f docker-compose.observability.yml \
  --profile observability up -d

# Grafana: http://localhost:3001 (admin/admin)
```

The app ships OTEL SDK wired to an OTLP exporter. Set `OTEL_SDK_DISABLED=false` and `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318/v1/traces` to enable tracing.

## Security

See `docs/security-checklist.md` (OWASP Top 10 mitigations) and `docs/threat-model.md` (STRIDE analysis).

## Scalability

Target: 100k consultations/day (≈20/s). Key design decisions for scale:
- Redis search cache (60s TTL) serves the read-heavy doctor search path
- Indexed Postgres queries: GIN on specialties, btree on fee and status
- Hold release BullMQ worker runs every 30s (not polling in API handlers)
- Audit log designed for monthly partitioning (DDL in `docs/decisions.md`)
- OTEL SDK ready for distributed tracing when scaling horizontally

See `docs/architecture.md` § Scalability for load math and what would be added at 100k/day.

## Known Limitations

1. MFA recovery codes not implemented
2. Password reset does not send email (token returned in dev)
3. Doctor ratings are seeded values, not computed from reviews
4. 99.95% availability requires multi-AZ RDS + ALB (local Docker cannot demonstrate)
5. No Terraform or infrastructure-as-code (deployment sketch in `infra/deployment-sketch.md`)

## Demo

```bash
./scripts/demo.sh http://localhost:3000/v1
```

Runs: register → login → search doctors → view slots → hold → confirm → simulate webhook → print next steps for doctor.
