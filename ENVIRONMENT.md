# Environment variables

`.env` at the repository root is read by every app. `.env.example` lists the full set
with safe defaults. The API validates its environment at boot with a Zod schema
(`apps/api/src/config/env.schema.ts`) and **refuses to start** on anything missing or
malformed, so a misconfiguration fails immediately instead of at the first request.

Never commit a real `.env`. It is in `.gitignore`.

## Core

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `PORT` | no | `4000` | API listen port |
| `API_PREFIX` | no | `api/v1` | Also fixes the refresh cookie path |
| `LOG_LEVEL` | no | `info` | `silent` … `trace` |
| `FRONTEND_URL` | no | `http://localhost:3000` | CORS origin and the base of emailed links |
| `BACKEND_URL` | no | `http://localhost:4000` | Used in outbound integrations |

## Datastores

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | **yes** | PostgreSQL connection string. Add `?sslmode=require` for most managed providers |
| `REDIS_URL` | no (`redis://localhost:6379`) | Cache, queues and the Socket.IO adapter |

## Authentication

| Variable | Required | Default | Notes |
|---|---|---|---|
| `JWT_SECRET` | **yes** | — | ≥ 32 characters. `openssl rand -base64 48` |
| `JWT_EXPIRES_IN` | no | `15m` | Access token lifetime (`30s`, `15m`, `2h`, `7d`) |
| `JWT_REFRESH_SECRET` | **yes** | — | ≥ 32 characters, different from `JWT_SECRET`. Also keys the HMAC for refresh, reset and invite tokens — rotating it invalidates all of them |
| `JWT_REFRESH_EXPIRES_IN_DAYS` | no | `30` | Refresh token lifetime |
| `COOKIE_SECURE` | no | `false` | **Set to `true` in production** |
| `COOKIE_DOMAIN` | no | — | e.g. `.digisoft360.com` when the API and frontend share a parent domain |

## Rate limiting

| Variable | Default | Notes |
|---|---|---|
| `THROTTLE_TTL_SECONDS` | `60` | Window for the default bucket |
| `THROTTLE_LIMIT` | `300` | Requests per window per client. A single workspace navigation fans out to several endpoints, so this is a per-user-minute budget rather than a page-view count |
| `AUTH_THROTTLE_LIMIT` | `10` | Ceiling for the `auth` bucket |
| `THROTTLE_ENABLED` | `true` | Only the test harness sets this to `false` |

Counters are held in process memory, so limits apply **per API instance**. Moving them
to Redis is required before running more than one instance behind a load balancer.

## Email

| Variable | Notes |
|---|---|
| `EMAIL_PROVIDER` | `console` (logs the message), `smtp`, or `ses` |
| `EMAIL_FROM` | From address on every transactional email |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` | Required when `EMAIL_PROVIDER=smtp` |
| `AWS_REGION` | Required when `EMAIL_PROVIDER=ses`; credentials come from the standard AWS provider chain |

## Attachment storage

| Variable | Default | Notes |
|---|---|---|
| `STORAGE_PROVIDER` | `local` | `local` writes to disk and streams downloads back through the API; `s3` uses any S3-compatible bucket and hands out short-lived signed URLs |
| `STORAGE_LOCAL_PATH` | `./storage` | Only used by the `local` provider. Put it on a persistent volume, or use `s3` for anything multi-instance |
| `ATTACHMENT_MAX_BYTES` | `26214400` (25 MB) | Enforced by the service and again by the multipart parser |
| `S3_BUCKET`, `S3_REGION` | — | Required when `STORAGE_PROVIDER=s3` |
| `S3_ENDPOINT` | — | Set for MinIO or R2; omit for AWS |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | — | Omit to use the standard AWS provider chain |
| `S3_FORCE_PATH_STYLE` | `true` | Needed by MinIO; AWS works either way |
| `S3_SIGNED_URL_TTL_SECONDS` | `300` | How long a download link stays valid |

The `local` provider keeps files on one node's disk, so it suits development and
single-node self-hosting. Anything running more than one API instance needs `s3`.

## Worker

| Variable | Default | Notes |
|---|---|---|
| `WORKER_CONCURRENCY` | `5` | Jobs processed in parallel per queue (the SLA sweep always runs one at a time) |
| `SLA_SCAN_INTERVAL_SECONDS` | `60` | How often the worker sweeps for SLA warnings and breaches; this is the detection resolution |

## Frontend

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_API_URL` | e.g. `https://api.example.com/api/v1`. Public — never put a secret in a `NEXT_PUBLIC_` variable |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.IO origin |

## Seed

`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` — used only by `pnpm db:seed`.
