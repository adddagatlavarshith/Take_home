# Runbook

## Health Checks

```bash
curl http://localhost:3000/health/live   # liveness: always 200 if process running
curl http://localhost:3000/health/ready  # readiness: 200 only when DB is reachable
curl http://localhost:3000/metrics       # Prometheus metrics
```

## Local Development

```bash
cp .env.example .env                     # fill in JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, PII_ENCRYPTION_KEY
docker compose up -d                     # postgres + redis
npm run migrate                          # npx prisma migrate deploy
npm run seed                             # seed admin + doctors + patients + slots
npm run start:dev                        # NestJS with hot reload
# Swagger: http://localhost:3000/docs
```

## Migrations

```bash
# Apply pending migrations to the database
npm run migrate                          # alias: npx prisma migrate deploy

# Create a new migration during development
npx prisma migrate dev --name <description>

# After a new migration, verify the overlap constraint still exists
psql $DATABASE_URL -c "SELECT conname FROM pg_constraint WHERE conname = 'no_overlapping_doctor_slots';"
```

## Backups

```bash
# Manual snapshot (pg_dump)
pg_dump $DATABASE_URL -Fc -f backup-$(date +%Y%m%d-%H%M%S).dump

# Restore
pg_restore -d $DATABASE_URL backup-YYYYMMDD-HHMMSS.dump
```

In production (RDS): automated daily snapshots with 7-day retention. Point-in-time recovery available. RPO ≈ 5 min (WAL archiving). RTO ≈ 15 min (restore from latest snapshot).

## Rollback

1. Stop traffic to the affected version (ALB target group health check removes the pod automatically when `/health/ready` returns 503).
2. Deploy the previous container image version.
3. If migration was applied and must be rolled back: restore from the pre-migration snapshot or write a compensating migration (Prisma supports `down` in `migration.sql`).

## Worker Modes

The same Docker image can run as API server or worker:

```bash
WORKER_MODE=true node dist/main.js   # starts BullMQ workers, no HTTP server
                                     # (planned; currently workers run in the same process)
```

## Environment Variables

See `.env.example` for the complete list. Critical ones:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_ACCESS_SECRET` | Sign access tokens (min 32 chars) |
| `JWT_REFRESH_SECRET` | Sign refresh tokens (min 32 chars) |
| `PII_ENCRYPTION_KEY` | pgcrypto PGP_SYM_ENCRYPT key for PII columns |
| `PAYMENT_WEBHOOK_SECRET` | HMAC-SHA256 key for payment webhooks |
| `OTEL_SDK_DISABLED` | Set to `true` to disable tracing (default in dev) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector URL (default: `http://localhost:4318/v1/traces`) |

## Observability

```bash
# Start optional observability stack
docker compose -f docker-compose.yml -f docker-compose.observability.yml \
  --profile observability up -d

# Grafana: http://localhost:3001 (admin/admin)
# Prometheus: http://localhost:9090
# Tempo (traces): http://localhost:3200
```

## Common Issues

| Issue | Diagnosis | Fix |
|---|---|---|
| `health/ready` returns 503 | DB unreachable | Check `DATABASE_URL`; ensure Postgres container is running |
| JWT errors | Clock skew or wrong secret | Verify `JWT_ACCESS_SECRET` matches across instances |
| Slot not released after payment failure | Hold release worker may be behind | Check BullMQ dashboard or trigger `release-expired-holds` job manually |
| Overlap constraint missing after migrate | Custom migration not applied | Run `prisma migrate deploy` and check `prisma/migrations/0002_slot_overlap_exclusion/migration.sql` |
| `ERR_JSNAPI_INVALID_DEREF` on argon2 | Node ABI mismatch | Rebuild: `npm rebuild argon2` |
