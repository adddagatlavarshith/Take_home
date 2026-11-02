# Threat Model — Amrutam Telemedicine Backend

## Scope

API server, PostgreSQL database, Redis cache, and the mock payment flow. TLS termination at the proxy layer is assumed in production.

## Data Classification

| Data class | Examples | Sensitivity |
|---|---|---|
| PII — identifiable | Name, email, phone, date of birth | HIGH |
| PII — medical | Prescriptions, consultation notes, diagnoses | CRITICAL |
| Credentials | Password hashes, MFA secrets, JWT refresh tokens | CRITICAL |
| Payment | Payment intent IDs, provider references (not card data) | HIGH |
| Operational | Audit logs, request metadata, slot data | MEDIUM |

## STRIDE Analysis

### S — Spoofing

| Attack | Control |
|---|---|
| Impersonate authenticated user | Short-lived JWTs (15 min); rotating refresh tokens revoked on use; account status checked on every request |
| Impersonate doctor/admin | Role embedded in JWT; role cannot be self-elevated; only admin can create doctor accounts |
| Webhook spoofing | HMAC-SHA256 signature verified with `timingSafeEqual` before processing; unsigned requests → 401 |

### T — Tampering

| Attack | Control |
|---|---|
| Modify request body after idempotency key set | Body hash (SHA-256) stored with the key; mismatch → 422 |
| Modify Prisma migration to drop overlap constraint | CI asserts `no_overlapping_doctor_slots` exists via `pg_constraint` after `prisma migrate deploy` |
| Tamper audit logs | Application never issues DELETE/UPDATE on `audit_logs`; DB role in production has INSERT-only on that table |
| Replay webhook to rebook a cancelled slot | `payment_events.provider_event_id UNIQUE` — second insert is a conflict, no-op |

### R — Repudiation

| Attack | Control |
|---|---|
| Patient denies booking | Audit log captures: actor, action, slot ID, patient ID, timestamp, IP, request-id |
| Doctor denies prescribing | Prescription row carries `doctor_id`, `signed_at`, version number; append-only (prior versions unchanged) |
| Admin denies action | Same audit interceptor covers admin mutations |

### I — Information Disclosure

| Attack | Control |
|---|---|
| Database breach exposes PII | Phone/DOB encrypted with pgcrypto PGP_SYM; passwords Argon2id hashed; key not in DB |
| JWT leak | Short TTL limits exposure window; refresh token rotation limits reuse |
| Log scraping for PII | Sensitive fields stripped before logging; pino uses structured JSON with explicit field selection |
| Swagger in production | Swagger disabled when `NODE_ENV=production` |

### D — Denial of Service

| Attack | Control |
|---|---|
| Brute-force `/auth/login` | ThrottlerGuard: 60 req/min global, tighter on auth routes |
| Slot reservation flooding | Idempotency keys prevent duplicate holds; hold TTL auto-releases after 10 min |
| Large payload | NestJS default body size limit (1MB); `ValidationPipe` rejects unexpected fields (`forbidNonWhitelisted`) |
| Slow webhook processing | Webhook handler is synchronous within the request but guarded by signature check; malformed bodies rejected early |

### E — Elevation of Privilege

| Attack | Control |
|---|---|
| Patient accessing doctor routes | RBAC guard checks `user.role` in JWT; role is set server-side on registration/admin-update only |
| Doctor accessing admin analytics | `@Roles(UserRole.admin)` on analytics/audit controllers |
| Doctor disabling MFA | `disableMfa` route throws `ForbiddenException` for doctor/admin role |
| JWT role inflation | Role never derived from request; only from DB-signed JWT; JWT secret not exposed |

## Attack Surface

```
Internet → TLS Proxy → NestJS API (port 3000)
                           ├── /v1/auth/* (public + rate-limited)
                           ├── /v1/payments/webhook (public, HMAC-verified)
                           ├── /health/* (public)
                           ├── /metrics (public, internal network only in prod)
                           └── /v1/* (JWT required)
                               ├── → PostgreSQL (private subnet)
                               └── → Redis (private subnet)
```

## Known Limitations

1. MFA recovery codes not implemented (known limitation, documented).
2. Password reset does not send an email (token returned in dev response; production path documented).
3. Encryption key rotation requires manual re-encryption of existing rows.
4. Rate limits are global throttle, not per-user; a sophisticated attacker could use multiple IPs.
5. `npm audit` found issues in transitive deps of OTEL packages; not exploitable in this threat surface but should be monitored.
