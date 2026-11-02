# Security Checklist

## OWASP Top 10 Mitigations

| # | Risk | Mitigation | Status |
|---|---|---|---|
| A01 | Broken Access Control | RBAC guard per route (`@Roles()`); MFA guard (`@RequireMfa()`); ownership checks in service layer (doctor/patient can only access their own records); admin-only analytics and audit endpoints | ✅ |
| A02 | Cryptographic Failures | Argon2id (memoryCost=65536, timeCost=3) for passwords; PGP_SYM_ENCRYPT (pgcrypto) for PII columns; JWT secrets min 32 chars from env; TLS at proxy (local Docker excluded); no secrets committed | ✅ |
| A03 | Injection | Prisma parameterized queries for all CRUD; raw SQL uses `$queryRaw` with template literals (Prisma handles parameter binding); `class-validator` + `ValidationPipe(whitelist: true)` for all inputs | ✅ |
| A04 | Insecure Design | 4-state booking machine with explicit state guards; consultation state machine; idempotency keys prevent duplicate charges; webhook replay prevented by `provider_event_id UNIQUE` | ✅ |
| A05 | Security Misconfiguration | Helmet middleware; strict CORS (wildcard dev only); Swagger hidden in production; no debug endpoints in production; env vars validated on startup | ✅ |
| A06 | Vulnerable Components | Trivy image scan in CI (CRITICAL/HIGH exit-code 1); `npm audit` available; pinned package versions | ✅ |
| A07 | Auth Failures | JWT short TTL (15 min); rotating refresh tokens (revoked on use); TOTP MFA required for doctor/admin; account status checked on every request (active/suspended/banned); rate limiting on `/auth/*` | ✅ |
| A08 | Data Integrity Failures | Webhook HMAC-SHA256 verification with `timingSafeEqual`; idempotency key + body hash check; Prisma schema enforces FK constraints and unique indexes | ✅ |
| A09 | Logging Failures | pino structured JSON on every request (request_id, method, path, status, duration); append-only audit_logs on all writes (actor, action, entity, before/after, ip, user_agent); no sensitive data in logs | ✅ |
| A10 | SSRF | No outbound HTTP to user-controlled URLs; payment gateway uses fixed env-var endpoint; OTEL exporter uses fixed env-var endpoint | ✅ |

## MFA Policy

| Role | Enabled by default | Can disable | Required to access role routes |
|---|---|---|---|
| patient | No | Yes | No |
| doctor | No (admin sets up) | **No** | Yes — `MfaGuard` refuses access if `mfaVerified=false` in JWT |
| admin | No (manually enrolled) | **No** | Yes — same guard |

## Encryption and Key Handling

- **Passwords**: Argon2id (argon2 npm package v0.41.1). Options: `type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4`. Never stored in plaintext.
- **PII columns** (`profiles.phone`, `profiles.date_of_birth`): encrypted at rest with pgcrypto `PGP_SYM_ENCRYPT(value, $PII_ENCRYPTION_KEY)`. Key lives in environment/KMS, never in the repo.
- **Prescription notes**: `PGP_SYM_ENCRYPT` with the same PII key.
- **JWT secrets**: `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (min 32 chars). Access token TTL 15 min. Refresh token TTL 7 days, stored as bcrypt hash, revoked on use.
- **Webhook secret**: `PAYMENT_WEBHOOK_SECRET` — used for HMAC-SHA256 on incoming webhook payloads.
- **Key rotation**: documented procedure — update env var, rotate KMS key version, re-encrypt affected rows. Application-layer rotation not yet automated (known limitation).
- **Never committed**: `.gitignore` excludes `.env`; `.env.example` has only placeholder values.

## Threat Model Summary

See `docs/threat-model.md` for the full STRIDE analysis. High-priority threats and mitigations:

| Threat | Mitigation |
|---|---|
| Credential stuffing | Argon2id + rate limit on `/auth/login` (60 req/min, 10 req/min burst) |
| JWT theft | Short TTL (15 min); refresh token rotation; revocation on logout |
| Slot race condition (double booking) | Atomic UPDATE + Postgres EXCLUDE constraint (belt+braces) |
| Payment replay | `payment_events.provider_event_id UNIQUE` |
| Idempotency key abuse | Body hash comparison; 422 on mismatch |
| PII data breach | Column encryption; TLS at proxy; no PII in logs |
| Audit log tampering | No DELETE/UPDATE in application layer; DB user lacks these privileges in production |
| Privilege escalation | Role embedded in JWT; RBAC guard on every request; JWT secret not accessible to users |
