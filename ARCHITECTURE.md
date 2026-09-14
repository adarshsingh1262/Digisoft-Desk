# Digisoft360 Help Desk — Architecture

> Status: **Phases 1–4 implemented.** Sections describing later phases are marked as planned.

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

pnpm workspace. The frontend and backend stay independently deployable; only types and
Zod schemas are shared, through a package with no Nest or React dependency.

```
Digisoft-Desk/
├── apps/
│   ├── api/                      # NestJS API + Socket.IO gateway
│   │   ├── src/
│   │   │   ├── main.ts  app.module.ts
│   │   │   ├── common/           # filters, interceptors, guards, decorators, pipes, middleware
│   │   │   ├── config/           # Zod-validated environment
│   │   │   ├── prisma/           # PrismaService + the tenant-scoped client provider
│   │   │   ├── redis/  queue/  email/  realtime/  audit/  bootstrap/  storage/
│   │   │   ├── auth/             # login, refresh rotation, reset, invites, access control
│   │   │   ├── organizations/  users/  roles/  departments/
│   │   │   ├── contacts/  accounts/  notifications/  health/
│   │   │   ├── tickets/          # queue, lifecycle, conversation, visibility, events
│   │   │   ├── ticket-config/    # statuses, priorities, categories, tags
│   │   │   ├── attachments/      # upload, authorised download, deletion
│   │   │   ├── activities/       # tasks, calls, events
│   │   │   ├── operations/       # assignment rules, automation/escalations, SLA policies, blueprints
│   │   │   ├── engine/           # the API's handle on @digisoft/engine + trigger queue
│   │   │   ├── kb/               # knowledge base categories and articles (agent side)
│   │   │   ├── help-center/      # portal settings and web forms (agent side)
│   │   │   ├── community/        # community moderation (agent side)
│   │   │   ├── portal/           # the customer-facing help center: content, accounts, requests, community
│   │   │   └── (channels, ai, analytics … arrive in later phases)
│   │   ├── test/                 # integration suites against a real database
│   │   └── Dockerfile
│   │
│   ├── worker/                   # BullMQ consumers; no HTTP surface
│   │   ├── src/processors/       # send-email, deliver-notification, automation, sla
│   │   └── Dockerfile
│   │
│   └── web/                      # Next.js App Router
│       ├── app/(auth)            # login, register, forgot-password, reset-password
│       ├── app/(app)             # dashboard, tickets, activities, knowledge base, community, automation, settings
│       ├── app/(portal)/help/[slug]   # the customer-facing help center, one deployment for every tenant
│       ├── components/{ui,layout,auth,tickets,customers,accounts,settings,kb,community,help-center,portal}
│       ├── hooks/ lib/ services/ stores/ types/ e2e/
│       └── Dockerfile
│
├── packages/
│   ├── engine/                   # rule evaluation, actions, business-hours math, SLA, assignment, blueprints
│   ├── db/                       # Prisma schema, migrations, seed, tenant extension
│   ├── shared/                   # Zod schemas + types shared by frontend and backend
│   └── tsconfig/                 # strict TypeScript bases
│
├── docker-compose.yml  .env.example
└── README.md ARCHITECTURE.md DATABASE.md API.md SETUP.md ENVIRONMENT.md DEPLOYMENT.md
```

**Why `packages/db` owns Prisma:** the API and the worker both need the generated
client. Keeping the schema, migrations and generated client in one package means one
schema, one client and one migration history rather than two that can drift.

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
- Socket.IO handshake authenticates with the access token, then resolves the user's
  permissions and departments to decide room membership: `org:{orgId}`,
  `org:{orgId}:user:{userId}`, one room per department, and `org:{orgId}:tickets:all`
  only for users holding `ticket.read.all`. Ticket events are addressed to those rooms,
  so the socket layer cannot leak a ticket the API would refuse. No global broadcasts (§43).

**Authorization**
- `PermissionsGuard` (global) + `@RequirePermissions('ticket.update')`. Public routes opt out with `@Public()`.
- Permissions are string keys `resource.action` seeded per organization; roles are rows (`Role` → `RolePermission`), so custom roles and Light Agent (§8) drop in with no code change.
- System roles seeded per org: `SUPER_ADMIN`, `ADMIN`, `AGENT`, `LIGHT_AGENT`, `CUSTOMER`.
- Second layer beyond permissions: **record-level policies** in services (e.g. an agent with `ticket.read` still only sees tickets in their departments unless they hold `ticket.read.all`).
- Rate limiting: `@nestjs/throttler` with a default bucket and a stricter `auth`
  bucket on login, registration, password reset and invite resends. Counters live in
  process memory today, so limits apply per API instance; moving them to Redis is
  required before running more than one instance (tracked in DEPLOYMENT.md).

## 5. Docker development architecture

`docker compose --profile local-db up --build` starts `postgres:16`, `redis:7`,
`minio` (S3-compatible), `mailhog` (SMTP capture), `api`, `worker` and `web`.

- The `api` service runs `prisma migrate deploy` before starting. In production this belongs in a separate release job (see DEPLOYMENT.md) so two starting instances cannot migrate concurrently.
- `pnpm db:seed` creates a demo organization with the system roles, permission
  catalogue, two departments, an admin and an agent.
- `docker-compose.prod.yml` uses multi-stage builds (distroless runtime), no bind mounts, external managed Postgres/Redis/S3, and Nginx in front.
- The local `postgres` service sits behind the `local-db` compose profile: supply a
  managed `DATABASE_URL` and run `docker compose up` without the profile to skip it.

## 5b. The operations engine

`packages/engine` is pure logic with a small dependency contract (`prisma`, `redis`,
`emailQueue`, `log`). Both hosts satisfy it with an **unscoped** Prisma client, so every
engine query names `organizationId` explicitly — the worker has no request, hence no
tenant context to lean on.

| Piece | Runs in | Why there |
|---|---|---|
| Assignment rules (`decideAssignment`) | API, synchronously on create | The response should already show who got the ticket |
| SLA apply / pause / resume | API, synchronously | Due dates belong on the created ticket, and the clock must stop the moment a pausing status is chosen |
| Blueprint checks (`checkTransition`) | API, synchronously | A refused move needs an immediate, specific error |
| Automation and escalation rules (`runTrigger`) | Worker, `automation` queue | A slow rule or a flaky email must never delay a request |
| SLA sweep (`scanSla`) | Worker, repeatable `sla` job | Warnings and breaches fire whether or not anyone is using the app |

The sweep is idempotent: each target is stamped (`*WarnedAt`, `*BreachedAt`) the first
time it fires, so a retried job or a second worker cannot fire it twice. Triggers are
enqueued with a per-second job id, so a burst of edits to one ticket collapses into one
evaluation rather than storming the rules.

Business-hours arithmetic uses `Intl` alone: working windows live in the calendar's
timezone and are converted per day, so DST shifts and holidays are honoured without a
date library.

## 5c. The customer portal

One Next.js route group, `app/(portal)/help/[slug]`, serves every organization's help
center; the slug in the URL is what decides which one. On the API side that address is
resolved by `PortalContextMiddleware`, which looks the help center up (cached in Redis
for 30 seconds, dropped the moment settings change) and opens the tenant scope for
visitors who have no token to open one with. `PortalGuard` then does the rest in one
place: the site must exist and be published, a bearer token must belong to the same
organization as the site (a token from another tenant is refused, never ignored), and
the site's own switches decide whether an anonymous visitor may read anything at all.

Portal routes are `@Public()` to the platform guard and resolve the visitor themselves,
which keeps anonymous and signed-in access on one code path.

**A portal visitor is a `User` of type `CUSTOMER`** linked to their `Contact`, not a
second kind of account: sessions, refresh rotation, password rules and reset links are
the ones the agent app already uses. Record visibility is narrowed before permissions
are consulted — `ticketVisibilityFilter` gives a customer their own requests and nothing
else, whatever a role grants — and the portal serves its own ticket projection, so an
internal comment is excluded by the query rather than filtered out afterwards.

**Every channel creates tickets through one path.** `TicketsService.createTicket` owns
the ticket number, the audit entry, assignment routing, the SLA clock and the
`TICKET_CREATED` trigger; the agent UI, the portal and web forms all hand over to it, so
a customer's request is routed and measured exactly like an agent's. A customer reply
arrives as an inbound message authored by the contact, reopens a request that had been
resolved, and fires `CUSTOMER_REPLIED` for automation to act on.

## 5a. File storage

`StorageProvider` has two real implementations, chosen by `STORAGE_PROVIDER`:

- **local** — writes under `STORAGE_LOCAL_PATH` and streams downloads back through the
  API. Suits development and single-node self-hosting; the path is resolved once and
  every key is checked to stay inside the root.
- **s3** — any S3-compatible bucket, with downloads handed out as short-lived signed
  URLs.

Uploads are proxied through the API rather than presigned direct to the bucket. That
keeps one validation and authorization path (size, MIME allowlist, tenant, ticket
visibility) for both providers, and means the local provider is a real option rather
than a stub. Storage keys are generated server-side as
`{organizationId}/tickets/{ticketId}/{uuid}{ext}` and never derived from the uploaded
filename.

## 6. Non-functional commitments

- TypeScript `strict: true`, `noUncheckedIndexedAccess`, ESLint rule banning `any` (§ Rule 9).
- Controller → Service → Prisma. No Prisma calls in controllers, no business logic in React components (Rules 6, 7).
- Consistent error envelope `{ success: false, error: { code, message, details? } }` via a global exception filter; stack traces never leave the server in production (§52).
- Structured JSON logging (pino) with request id + org id + user id; a redaction list covers `password`, `token`, `authorization`, `secret` (§53).
- Every multi-step write uses `prisma.$transaction` (Rule 15).
