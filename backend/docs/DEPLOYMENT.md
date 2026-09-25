# Deployment

Phase 1 ships a deployable stack, but it has not been run in a production environment
yet. Treat this as the intended topology plus the checklist that must be completed
before exposing it publicly.

## Topology

```
            Users
              |
         Nginx / ALB  (TLS termination)
         /          \
   Next.js          NestJS API  ──────────┐
  (Vercel or         (EC2 / ECS,          │
   a container)       2+ instances)       │
                          |               │
              ┌───────────┼───────────┐   │
          PostgreSQL   Redis        S3    │
          (RDS/Aiven) (ElastiCache)       │
                          |               │
                    Worker process  ──────┘
                 (same image, different command)
```

The worker runs the same code as the API but starts `backend/worker`, so it scales
independently of request traffic.

## Build

```bash
docker build -f backend/api/Dockerfile   -t digisoft-api    .
docker build -f backend/worker/Dockerfile -t digisoft-worker .
docker build -f frontend/Dockerfile   -t digisoft-web    .
```

Each Dockerfile takes the repository root as its build context because the apps share
`packages/`.

## Release order

1. `pnpm db:deploy` (`prisma migrate deploy`) as a one-off job against the production
   database. Migrations are forward-only; review each one before release.
2. Roll out the API.
3. Roll out the worker.
4. Roll out the frontend.

The API also applies migrations on boot in the Compose file, which is convenient in
development but should be replaced by the explicit job above in production so two
starting instances cannot migrate concurrently.

## Before going live

- [ ] `COOKIE_SECURE=true` and serve everything over HTTPS.
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` generated per environment (`openssl rand -base64 48`), stored in a secret manager, never in the image.
- [ ] `FRONTEND_URL` set to the real origin — it is the CORS allowlist.
- [ ] `DATABASE_URL` uses TLS (`?sslmode=require`) and a least-privilege role.
- [ ] `EMAIL_PROVIDER` set to `ses` or `smtp`; `console` silently drops mail, so password resets and invitations would never arrive.
- [ ] Seed credentials changed or the seed never run.
- [ ] Rate limiting moved to a shared Redis store before running more than one API instance (today's counters are per process — see ENVIRONMENT.md).
- [ ] Database backups and point-in-time recovery enabled.
- [ ] Log shipping configured; the API emits structured JSON with credentials redacted.
- [ ] `/api/v1/health` wired to the load balancer health check.
- [ ] `STORAGE_LOCAL_PATH` is an absolute path on a volume the API and the worker both
      mount (or `STORAGE_PROVIDER=s3`) — the two are separate processes with separate
      working directories, so a relative path resolves to two different places and a
      report export the worker wrote becomes a 404 when the API tries to serve it.

## Scaling notes

- Socket.IO uses the Redis adapter, so API instances share rooms and a client can connect to any of them.
- BullMQ workers are horizontally scalable; queue concurrency is `WORKER_CONCURRENCY` per process.
- Every tenant-scoped query is indexed on `organizationId` first (see DATABASE.md).
- Reporting reads daily rollup tables (`TicketDailyMetric` / `AgentDailyMetric`) rather
  than scanning the ticket table; a report request recomputes the last two days inline
  if the worker's sweep has fallen behind (§ `PHASE-7-PLAN.md`).
