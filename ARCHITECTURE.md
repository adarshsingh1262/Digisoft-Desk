# Digisoft360 Help Desk — Architecture

> Status: **Planning deliverable (§70)**. No application code has been implemented yet.

## 1. Final architecture

Two separate deployable applications plus a worker process, sharing one PostgreSQL and one Redis.

```
                              CUSTOMER
   Email · Web Form · Live Chat · WhatsApp/IG/FB/Telegram · Phone
                                 |
                         CHANNEL ADAPTER LAYER
                    (webhook controllers + provider SPI)
                                 |
   Next.js Frontend  --REST(/api/v1)-->  NestJS Modular Monolith API
   (agent console,        <--Socket.IO-->        |
    help center,                                 |
    customer portal)                             |
                                                 |
             +------------------+----------------+-----------------+
             |                  |                |                 |
         PostgreSQL           Redis           BullMQ          S3-compatible
        (Prisma ORM)        (cache,          (queues)        object storage
                          socket adapter,        |
                           rate limits)     Worker process
                                            (email, sla, automation,
                                             notifications, ai,
                                             webhooks, reports)
```

**Key decisions**

| Decision | Choice | Rationale |
|---|---|---|
| Backend framework | NestJS (Node.js + TypeScript) | §3/§50 of the spec describe NestJS modules; NestJS *is* a Node.js framework, so "use Node.js" is satisfied. DI + module boundaries give us the modular monolith of §61. |
| Architecture style | Modular monolith, worker split out as a process | §17/§61. One codebase, hard module boundaries, no microservices. |
| ORM | Prisma | §48/§49 mandate Prisma migrations and parameterised queries. |
| API transport | REST `/api/v1` + Socket.IO | §43/§47. |
| Frontend | Next.js App Router (TypeScript) | §34 SEO for the Help Center; server components for public pages. |
| Repo layout | Single repo, pnpm workspaces | Shared TS types between FE/BE without publishing packages. Frontend and backend stay independently deployable. |
| Tenancy | Shared database, shared schema, `organizationId` column + enforced scoping layer | §7. Simplest correct model at this scale; row-level enforcement lives in a Prisma extension, not in controllers. |
| Auth | JWT access token (short-lived) + refresh token rotation in HTTP-only cookie | §9. |
| Config | `@nestjs/config` + Zod-validated env schema, fail-fast at boot | §56. |

**Explicitly deferred (architecture prepared, not implemented in Phase 1):** SLA timers, automation engine, AI, channels beyond email, community, pgvector/RAG, OpenSearch.

## 2. Repository structure

```
Digisoft-Desk/
├── apps/
│   ├── api/                      # NestJS backend (HTTP + Socket.IO)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/           # guards, interceptors, filters, decorators, pipes
│   │   │   ├── config/           # Zod env schema, typed config
│   │   │   ├── prisma/           # PrismaService + tenant-scoping extension
│   │   │   ├── auth/
│   │   │   ├── organizations/
│   │   │   ├── users/
│   │   │   ├── roles/
│   │   │   ├── permissions/
│   │   │   ├── departments/
│   │   │   ├── teams/
│   │   │   ├── contacts/
│   │   │   ├── accounts/
│   │   │   ├── tickets/          # phase 2
│   │   │   ├── conversations/    # phase 2
│   │   │   ├── attachments/      # phase 2
│   │   │   ├── activities/       # phase 3
│   │   │   ├── automation/       # phase 3
│   │   │   ├── assignment-rules/ # phase 3
│   │   │   ├── sla/              # phase 3
│   │   │   ├── escalation/       # phase 3
│   │   │   ├── blueprints/       # phase 3
│   │   │   ├── knowledge-base/   # phase 4
│   │   │   ├── help-center/      # phase 4
│   │   │   ├── community/        # phase 4
│   │   │   ├── web-forms/        # phase 4
│   │   │   ├── channels/         # phase 5
│   │   │   ├── email/            # phase 5
│   │   │   ├── chat/             # phase 5
│   │   │   ├── telephony/        # phase 5
│   │   │   ├── ai/               # phase 6
│   │   │   ├── reports/          # phase 7
│   │   │   ├── csat/             # phase 7
│   │   │   ├── notifications/
│   │   │   ├── webhooks/
│   │   │   ├── audit/
│   │   │   ├── realtime/         # Socket.IO gateway + Redis adapter
│   │   │   └── queue/            # BullMQ registration + producers
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── test/                 # e2e / integration (Testcontainers)
│   │   └── Dockerfile
│   │
│   ├── worker/                   # BullMQ consumers; imports api modules, no HTTP
│   │   ├── src/main.ts
│   │   ├── src/processors/
│   │   └── Dockerfile
│   │
│   └── web/                      # Next.js frontend
│       ├── app/
│       │   ├── (auth)/login, register, forgot-password, reset-password
│       │   ├── (app)/dashboard, tickets, activities, customers, accounts,
│       │   │        knowledge-base, community, reports, automation,
│       │   │        channels, ai, settings
│       │   ├── (portal)/portal/...          # customer portal
│       │   └── (public)/help/...            # SEO help center
│       ├── components/{ui,layout,tickets,customers,dashboard,knowledge-base}
│       ├── hooks/ lib/ services/ stores/ types/ utils/
│       ├── middleware.ts
│       └── Dockerfile
│
├── packages/
│   ├── shared/                   # Zod schemas + DTO types shared FE/BE
│   └── tsconfig/                 # shared strict tsconfig bases
│
├── docker/                       # nginx conf, init scripts
├── docs/                         # PHASE-1-PLAN.md, decisions
├── docker-compose.yml            # dev
├── docker-compose.prod.yml
├── .env.example
├── ARCHITECTURE.md  DATABASE.md  API.md  SETUP.md  DEPLOYMENT.md  ENVIRONMENT.md
└── pnpm-workspace.yaml
```

`packages/shared` contains **types and Zod schemas only** — no runtime dependency on Nest or React, so neither app pulls the other's dependency tree.

## 3. Multi-tenancy architecture

Model: **shared database, shared schema, tenant discriminator**.

1. Every tenant-owned table carries `organizationId` with a FK to `Organization` and an index (usually a composite index leading with `organizationId`).
2. `AsyncLocalStorage`-based `TenantContext` is populated by `TenantContextInterceptor` from the *verified JWT claim* — never from a header, query param or body (§66).
3. `PrismaService` installs a **client extension** that, for every model in the tenant-model registry:
   - injects `organizationId` into `where` on `findMany/findFirst/updateMany/deleteMany/count/aggregate`,
   - injects `organizationId` into `data` on `create/createMany`,
   - rejects `findUnique`/`update`/`delete` results whose `organizationId` mismatches (throws `TenantIsolationError` → 404, never 403, so IDs are not enumerable).
4. Escape hatch: `prisma.$unscoped()` — used only by platform-level code (auth login lookup by email, webhook ingestion before tenant resolution) and grep-auditable.
5. Cross-cutting resources (BullMQ jobs, S3 keys, Socket.IO rooms, cache keys) are all namespaced by `organizationId`: `org:{id}:...`.
6. Tests: a dedicated tenant-isolation suite seeds two orgs and asserts every list/detail/update/delete endpoint returns 404 across the boundary.

Customers (contacts) authenticate into the same org but with role `CUSTOMER`; they are additionally scoped to *their own* tickets by a `RequesterScope` applied in the tickets service.

## 4. Authentication & RBAC architecture

**Authentication**
- Passwords: Argon2id.
- Login → `{ accessToken (JWT, 15 min, in memory/response body), refreshToken (opaque, 30 d, HTTP-only + Secure + SameSite=Lax cookie) }`.
- Refresh tokens are stored hashed in `RefreshToken` with `familyId`; rotation on every use, and reuse of a consumed token revokes the whole family (replay detection).
- Access token claims: `sub` (userId), `org` (organizationId), `role`, `perms` (permission-key array), `typ`.
- Email verification and password reset use single-use hashed tokens in `VerificationToken` with TTL.
- Logout revokes the refresh family and clears the cookie.
- Socket.IO handshake authenticates with the access token; the socket joins `org:{orgId}`, `user:{userId}`, and role rooms. No global broadcasts (§43).

**Authorization**
- `PermissionsGuard` (global) + `@RequirePermissions('ticket.update')`. Public routes opt out with `@Public()`.
- Permissions are string keys `resource.action` seeded per organization; roles are rows (`Role` → `RolePermission`), so custom roles and Light Agent (§8) drop in with no code change.
- System roles seeded per org: `SUPER_ADMIN`, `ADMIN`, `AGENT`, `LIGHT_AGENT`, `CUSTOMER`.
- Second layer beyond permissions: **record-level policies** in services (e.g. an agent with `ticket.read` still only sees tickets in their departments unless they hold `ticket.read.all`).
- Rate limiting: `@nestjs/throttler` backed by Redis; stricter buckets on `/auth/*`.

## 5. Docker development architecture

`docker compose up` starts: `postgres:16`, `redis:7`, `minio` (S3-compatible), `mailhog` (SMTP capture), `api`, `worker`, `web`.

- API and web run in dev mode with bind mounts + hot reload; `node_modules` kept in anonymous volumes.
- `api` entrypoint waits for Postgres, runs `prisma migrate deploy`, then starts.
- A one-shot `seed` profile creates the demo organization, roles, permissions and an admin user.
- `docker-compose.prod.yml` uses multi-stage builds (distroless runtime), no bind mounts, external managed Postgres/Redis/S3, and Nginx in front.
- If you supply a managed PostgreSQL connection string, set `DATABASE_URL` in `.env` and the `postgres` service is skipped via the `local-db` compose profile.

## 6. Non-functional commitments

- TypeScript `strict: true`, `noUncheckedIndexedAccess`, ESLint rule banning `any` (§ Rule 9).
- Controller → Service → Prisma. No Prisma calls in controllers, no business logic in React components (Rules 6, 7).
- Consistent error envelope `{ success: false, error: { code, message, details? } }` via a global exception filter; stack traces never leave the server in production (§52).
- Structured JSON logging (pino) with request id + org id + user id; a redaction list covers `password`, `token`, `authorization`, `secret` (§53).
- Every multi-step write uses `prisma.$transaction` (Rule 15).
