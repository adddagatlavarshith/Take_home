# Architecture — Amrutam Telemedicine Backend

## 1. Overview

Production-grade telemedicine backend built as a **NestJS modular monolith** on Node.js 20 / TypeScript (strict). The monolith is simpler to review, reason about, and demo than microservices; bounded modules (auth, booking, payments, etc.) map cleanly to the brief's language and can be extracted later if needed.

**Stack**

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 LTS, TypeScript 5.5 (strict) |
| Framework | NestJS 10 modular monolith |
| Database | PostgreSQL 16 (system of record) |
| Cache / Queue | Redis 7 (search cache + BullMQ background jobs) |
| ORM | Prisma 5 (standard tables) + raw SQL migrations (constraints) |
| Auth | JWT (15 min access, 7-day rotating refresh) + Argon2id + TOTP MFA |
| Payments | Mock gateway behind `PaymentGateway` interface; real HMAC webhook flow |
| Observability | pino structured JSON, prom-client `/metrics`, OTEL SDK (OTLP exporter, disabled by default) |
| Container | Multi-stage Dockerfile; docker-compose for local dev |
| CI | GitHub Actions: lint → typecheck → unit → integration/e2e → Docker build → Trivy |

## 2. Module Map

```
NestJS App
├── auth           register, login, MFA (TOTP), refresh, logout, password reset
├── users          /me profile, admin user management
├── doctors        profile CRUD, specialty/fee/q search (Redis cached)
├── availability   recurring rules, slot materialization (BullMQ nightly job)
├── booking        atomic claim, 4-state machine, idempotency, hold release worker
├── consultations  lifecycle state machine (6 states)
├── prescriptions  versioned JSON prescriptions
├── payments       mock gateway, HMAC webhook handler, refund
├── audit          append-only interceptor on all writes + admin read API
├── analytics      SQL aggregates (consultations/day, top specialties, revenue, utilization)
├── health         /health/live, /health/ready
├── metrics        Prometheus /metrics endpoint
└── infra          PrismaService, RedisService, BullMQ, pino, OTEL tracing init
```

## 3. Critical Design Decisions

### 3.1 Slot Overlap Prevention (belt + braces)

Two layers prevent double-booking:

1. **Application layer**: `UPDATE availability_slots SET status='held' WHERE id=$1 AND status='available' RETURNING *` — the `WHERE status='available'` predicate makes the UPDATE atomic at the database level; only one transaction wins.

2. **Database constraint**:
   ```sql
   CREATE EXTENSION IF NOT EXISTS btree_gist;
   ALTER TABLE availability_slots
     ADD CONSTRAINT no_overlapping_doctor_slots
     EXCLUDE USING gist (
       doctor_id WITH =,
       tstzrange(start_at, end_at, '[)') WITH &&
     ) WHERE (status <> 'blocked');
   ```
   This is a Postgres EXCLUDE constraint. Even if two transactions pass the application check simultaneously (shouldn't happen with row-level locking, but the constraint is the hard stop), Postgres will reject the second insert/update.

   The constraint is shipped in `prisma/migrations/0002_slot_overlap_exclusion/migration.sql` and asserted in CI:
   ```bash
   psql $DB -c "SELECT conname FROM pg_constraint WHERE conname = 'no_overlapping_doctor_slots';" \
     | grep no_overlapping_doctor_slots
   ```

### 3.2 Booking State Machine

```
AVAILABLE
   │ POST /bookings/hold            ← atomic UPDATE WHERE status='available'
   ▼
HELD                                ← held_until = now()+10min
   │                                ← consultation row created (pending_payment)
   ├── POST /bookings/:id/confirm   → PAYMENT_PENDING
   ├── POST /bookings/:id/cancel    → AVAILABLE (consultation→cancelled)
   └── TTL expired (worker)         → AVAILABLE (consultation→cancelled)

PAYMENT_PENDING
   ├── webhook: captured            → BOOKED
   │                                  (consultation→scheduled)
   ├── webhook: failed              → AVAILABLE (consultation→cancelled)
   └── TTL expired (worker)         → AVAILABLE (consultation→cancelled)

BOOKED
   └── (no further slot transitions)

Late capture after expiry           → payment refunded, slot stays AVAILABLE
```

Consultation is created at hold time (`pending_payment`) so every booking attempt is persistent and auditable, even if it never reaches payment.

### 3.3 Idempotency

All write endpoints accept an `Idempotency-Key` header. The `idempotency_keys` table stores `(user_id, key, route, request_hash, status, response_body)`. On replay:
- Same body → cached response returned, no new write.
- Different body → 422 (key reused with different intent).
- In-flight → 422 (still processing).

Webhook idempotency is separate: `payment_events.provider_event_id UNIQUE` — a duplicate event inserts nothing and returns `{processed: false, reason: 'duplicate'}`.

### 3.4 MFA Policy

| Role | MFA requirement |
|---|---|
| patient | Optional (can enable/disable) |
| doctor | Required (cannot disable; `mfa_enabled` must be `true` to access doctor routes) |
| admin | Required (cannot disable) |

Enforced by `MfaGuard` which checks `mfaVerified: true` in the JWT payload for `@RequireMfa()` decorated routes.

### 3.5 Encryption

- Passwords: **Argon2id** (`memoryCost=65536`, `timeCost=3`, `parallelism=4`).
- PII (phone, date_of_birth): pgcrypto `PGP_SYM_ENCRYPT` with key from `PII_ENCRYPTION_KEY` env var (never committed).
- JWT secrets: from env vars. Short TTL (15 min access) + rotating refresh (7 day, revoked on use).
- Prescription notes: `notes_encrypted` column using the same pgcrypto wrapper.
- TLS: terminated at reverse proxy in production (not in local Docker).

## 4. Data Flow: Full Happy Path

```
Patient registers → logs in → lists doctors (Redis cache) → views slots
  → POST /bookings/hold (Idempotency-Key required)
      └── UPDATE slots … WHERE status='available'
          └── creates consultation (pending_payment)
  → POST /bookings/:id/confirm
      └── PaymentGateway.createIntent() → payment row (initiated)
          slot status → payment_pending
  → (mock payment gateway captures)
  → POST /payments/webhook (HMAC verified, provider_event_id unique)
      └── slot → booked, consultation → scheduled
  → Doctor: POST /consultations/:id/start → in_progress
  → Doctor: POST /consultations/:id/complete → completed
  → Doctor: POST /consultations/:id/prescriptions → prescription created
  → Admin: GET /audit, GET /analytics/*
```

## 5. Scalability Design (documented, not deployed locally)

Target: 100k consultations/day ≈ 1,150/min ≈ 20/s sustained, with p95 read <200ms, write <500ms.

**Capacity math (rough)**:
- `GET /doctors?specialty=…` → Redis cache hit ≈ 5ms; cache miss with indexed Postgres query ≈ 20ms.
- `POST /bookings/hold` → single UPDATE with row lock + insert ≈ 10–30ms at low concurrency.
- Connection pool: `DATABASE_URL` connection pool via `pgBouncer` or `connection_limit=10` per pod; 4 pods ≈ 40 connections (well under PG default 100).

**Indexes already applied**:
- `availability_slots (doctor_id, start_at)` — slot listing.
- `(status, held_until)` — hold release sweep.
- `consultations (patient_id, scheduled_start DESC)`, `(doctor_id, scheduled_start DESC)`.
- `doctors` GIN on `specialties`, btree on `consultation_fee_cents`, `verified`.
- `audit_logs (entity_type, entity_id, created_at DESC)`.

**What would be added for 100k/day**:
- Primary/replica Postgres for read-heavy queries (doctor search, audit log reads).
- `pgBouncer` for connection pooling.
- `audit_logs` monthly partitioning (DDL documented in `decisions.md`).
- Rate limit tightened further on `/auth/*`.

## 6. High Availability (documented, not achievable on local Docker)

To reach 99.95% availability (≤4.38h downtime/year):
- **RDS Multi-AZ PostgreSQL**: automatic failover in ≈1 min.
- **ElastiCache Redis cluster mode**: auto-failover.
- **2+ API container instances** behind an Application Load Balancer with `/health/ready` health checks.
- **Graceful shutdown** (`app.enableShutdownHooks()`): in-flight requests complete before pod terminates.
- **Automated backups**: daily RDS snapshots, 7-day retention. RPO ≈ 5 min (point-in-time recovery). RTO ≈ 15 min (restore from snapshot).

*Local Docker explicitly cannot demonstrate this. The architecture is designed for it and the infra sketch in `infra/deployment-sketch.md` shows the ECS/Fargate setup.*

## 7. Security Architecture

See `docs/security-checklist.md` for the full OWASP table. Key points:

- No secrets in the repository (`.env.example` documents all variables; actual values from environment/KMS).
- Helmet + strict CORS (wildcard only in development).
- Rate limiting (throttler, tighter on `/auth/*`).
- All inputs validated by `class-validator` + `ValidationPipe(whitelist: true, forbidNonWhitelisted: true)`.
- JWT payload carries `role` and `mfaVerified`; RBAC enforced per-route by `RolesGuard`.
- Argon2id (not bcrypt) — memory-hard, side-channel resistant.
- TOTP-based MFA required for doctor and admin roles.
- Webhook signature verified with HMAC-SHA256 and `timingSafeEqual`.
- Append-only audit logs on every write (no UPDATE/DELETE on audit_logs in application code).
