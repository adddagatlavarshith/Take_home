# Production Deployment Sketch

This document describes the target production architecture. No Terraform or CDK is shipped with this submission.

## AWS Architecture (ECS Fargate + RDS + ElastiCache + ALB)

```
Internet
  │
  ▼
Route 53 (DNS)
  │
  ▼
ACM Certificate (TLS)
  │
  ▼
Application Load Balancer (ALB)
  ├── Target Group: API (port 3000)
  │     ├── ECS Fargate Task 1 (amrutam-api)
  │     ├── ECS Fargate Task 2 (amrutam-api)
  │     └── ... (Auto Scaling Group, min 2)
  └── Health Check: /health/ready (200 = healthy)

  ECS Fargate Tasks
  ├── amrutam-api (API server; same image)
  └── amrutam-worker (BullMQ workers; WORKER_MODE=true)

  RDS PostgreSQL 16 (Multi-AZ)
  ├── Primary: us-east-1a
  └── Standby: us-east-1b (automatic failover ≈1 min)

  ElastiCache Redis 7 (Cluster Mode, Multi-AZ)
  ├── Primary: us-east-1a
  └── Replica: us-east-1b (automatic failover ≈30s)

  AWS Secrets Manager
  └── JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, PII_ENCRYPTION_KEY, PAYMENT_WEBHOOK_SECRET

  ECR (Elastic Container Registry)
  └── amrutam-backend:latest (pushed by CI)
```

## Capacity Sizing (100k consultations/day)

- 100k/day ≈ 70/min ≈ 1.2/s average, 20/s peak (10x burst)
- **API tasks**: 2–4 Fargate tasks (0.5 vCPU, 1 GB RAM each); Auto Scaling on CPU >60%
- **Worker tasks**: 1–2 Fargate tasks; scaled by BullMQ queue depth
- **RDS**: db.t3.medium (2 vCPU, 4 GB); Multi-AZ; max_connections=200; pgBouncer sidecar
- **ElastiCache**: cache.t3.micro cluster mode (2 shards, 1 replica each)
- **Connection pool**: `DATABASE_URL?connection_limit=10` per task; 4 tasks × 10 = 40 connections

## Key Environment Variables (from Secrets Manager)

```
DATABASE_URL             postgresql://user:pass@rds-endpoint:5432/amrutam
REDIS_URL                redis://elasticache-endpoint:6379
JWT_ACCESS_SECRET        <from Secrets Manager>
JWT_REFRESH_SECRET       <from Secrets Manager>
PII_ENCRYPTION_KEY       <from Secrets Manager>
PAYMENT_WEBHOOK_SECRET   <from Secrets Manager>
OTEL_SDK_DISABLED        false
OTEL_EXPORTER_OTLP_ENDPOINT  http://otel-collector:4318/v1/traces
NODE_ENV                 production
```

## High Availability (99.95% target)

- Multi-AZ RDS: automatic failover in ≈1 min → downtime budget consumed per year for one failover event ≈ 1 min / 525 min ≈ 0.19%.
- Multi-AZ ElastiCache: automatic failover in ≈30s.
- ALB health check: removes unhealthy tasks before they receive traffic.
- ECS rolling deployment: blue/green available; new task must pass health check before old task is drained.
- Graceful shutdown: NestJS `enableShutdownHooks()` drains in-flight requests before ECS SIGTERM kill.
- RPO ≈ 5 min (RDS automated backups with WAL archiving). RTO ≈ 15 min (restore from latest snapshot).

## Security Controls (production)

- TLS termination at ALB; HTTP → HTTPS redirect.
- ECS task role: read-only Secrets Manager access; no broad IAM permissions.
- RDS security group: only ALB/ECS subnet can connect.
- ElastiCache security group: only ECS subnet can connect.
- VPC: private subnets for RDS, ElastiCache, and ECS tasks; public subnet only for ALB.
- WAF: optional, recommended for `/auth/login` rate limiting at the edge.
- Trivy scan in CI; ECR image scanning on push.

## Deployment Pipeline (CI → ECR → ECS)

1. `git push` to `main` → GitHub Actions CI runs.
2. On success: `docker build`, `docker push` to ECR with `sha` and `latest` tags.
3. ECS service update: `aws ecs update-service --force-new-deployment` (or CodeDeploy blue/green).
4. `prisma migrate deploy` runs as an ECS one-off task before the rolling deployment.

## Cross-Region DR (documented, not deployed)

For multi-region resilience:
- RDS read replica in a second region promoted on primary region failure.
- ElastiCache global datastore (Redis 6+) for cache replication.
- Route 53 health checks with latency-based routing; failover to secondary region.
- S3 cross-region replication for any file storage.
- RPO ≈ 15 min (replication lag); RTO ≈ 30 min (manual promotion).
