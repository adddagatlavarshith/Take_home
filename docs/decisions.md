# Architecture Decision Records

## ADR-001: Modular Monolith over Microservices

**Context**: The brief asks for a telemedicine backend covering auth, booking, consultations, prescriptions, payments, audit, and analytics.

**Decision**: Single NestJS process, modular by domain (one folder per bounded context).

**Rationale**: Microservices add distributed transactions, network latency, and operational complexity without benefit at this scale. Modules can be extracted later if needed. DI boundaries enforce separation.

## ADR-002: PostgreSQL Exclusion Constraint for Slot Overlap

**Context**: Two concurrent booking requests for the same time window could both pass an application-level availability check.

**Decision**: `EXCLUDE USING gist (doctor_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&) WHERE (status <> 'blocked')` shipped in a raw SQL migration alongside the application-layer `WHERE status='available'` UPDATE predicate.

**Rationale**: Belt-and-braces. The UPDATE predicate is the fast path (one round trip); the constraint is the hard stop and eliminates any TOCTOU gap. CI asserts the constraint exists after migration.

## ADR-003: Consultation Created at Hold Time

**Context**: Should the consultation row be created when a hold is placed or when payment is captured?

**Decision**: Created at hold time with `status = pending_payment`.

**Rationale**: A booking attempt that fails payment is still a meaningful event for audit, analytics, and potential support. Creating early makes reconciliation trivial: every hold has a paper trail regardless of outcome.

## ADR-004: Idempotency Table over Redis

**Context**: Hold and confirm endpoints need to be safe to retry.

**Decision**: `idempotency_keys` Postgres table keyed by `(user_id, key, route)` with a body hash.

**Rationale**: Redis is volatile; an idempotency record that disappears on Redis restart causes a duplicate charge. Postgres is durable and transactional. A 24-hour TTL sweep keeps the table small.

## ADR-005: Mock Payment Gateway behind Interface

**Context**: No real payment provider for a take-home project.

**Decision**: `PaymentGateway` interface injected via NestJS DI; `MockPaymentGateway` is the default implementation. HMAC-verified webhook flow is fully real.

**Rationale**: A real provider (Stripe, Razorpay) would plug in by implementing the interface and swapping the `PAYMENT_GATEWAY` token. The webhook path—idempotency, state machine, refund guard—is production logic regardless of the gateway.

## ADR-006: Argon2id over bcrypt

**Context**: Password hashing algorithm choice.

**Decision**: Argon2id with `memoryCost=65536, timeCost=3, parallelism=4`.

**Rationale**: Argon2id (PHC winner) is memory-hard and side-channel resistant. bcrypt has a 72-character input limit and is not memory-hard. The options chosen require ~64 MB RAM per hash, making bulk offline cracking expensive.

## ADR-007: Prisma for CRUD, Raw SQL for Constraints

**Context**: Prisma does not support `btree_gist` extensions or EXCLUDE constraints natively.

**Decision**: Prisma owns standard table DDL; raw SQL migrations own the extension and exclusion constraint. A CI assertion confirms the constraint survives `prisma migrate deploy`.

**Rationale**: Mixing the two approaches keeps the Prisma schema as the single source of truth for application-layer types while allowing Postgres-specific features that Prisma cannot express.

## ADR-008: OTEL SDK Wired but Disabled by Default

**Context**: Full observability stack (Grafana/Tempo/Loki) is expensive to deploy locally.

**Decision**: OTEL SDK initialized on startup but skipped when `OTEL_SDK_DISABLED=true` (default in `.env.example`). Optional Compose profile ships Grafana/Tempo/Loki/Prometheus.

**Rationale**: Instrumentation is in the app and ready; the choice of collector/dashboard is operational. A reviewer can enable it with one env-var change.

## ADR-009: 4-State Booking Machine Documented Explicitly

**Context**: The brief implies state transitions but doesn't mandate a specific model.

**Decision**: Four explicit slot states (`available`, `held`, `payment_pending`, `booked`) with all failure edges (expiry → available, payment failed → available, late capture → refund).

**Rationale**: Implicit transitions create correctness bugs. Making them explicit makes the code reviewable, testable, and auditable. Each transition is a unit-testable predicate.
