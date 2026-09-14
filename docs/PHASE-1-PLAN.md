# Phase 1 — Foundation

> **Status: complete.** Every item below is implemented, and the definition of done at
> the bottom was verified against a real PostgreSQL and Redis. Two deliverables landed
> differently from the plan and are noted inline.

**Goal:** a running, secured, multi-tenant foundation — no ticketing yet. Ends with `docker compose up` producing a working login, an organization, users with roles/permissions, departments/teams, contacts and accounts, all real (no mock data, Rule 3).

## Work breakdown

| # | Deliverable | Notes |
|---|---|---|
| 1 | Workspace scaffold | pnpm workspaces, strict tsconfig bases, ESLint/Prettier, Husky + lint-staged, `packages/shared`. |
| 2 | Docker dev stack | postgres 16, redis 7, minio, mailhog, api, worker, web; healthchecks + wait-for. |
| 3 | Env & config | `.env.example`, Zod env schema, fail-fast validation, `ENVIRONMENT.md`. |
| 4 | Prisma foundation | `schema.prisma` for the Phase-1 tables (DATABASE.md §3), initial migration, seed script. **Changed from plan:** this lives in `packages/db`, not `apps/api`, so the API and worker share one generated client. |
| 5 | Tenant isolation layer | `TenantContext` (AsyncLocalStorage), Prisma client extension, `$unscoped()` escape hatch, isolation test suite. |
| 6 | Common layer | global exception filter + error envelope, response interceptor, pino logging with redaction, Zod validation pipe (shared schemas), Throttler, Helmet, CORS. **Changed from plan:** validation uses the Zod schemas from `packages/shared` rather than class-validator, so the frontend and backend enforce identical rules; throttler counters are in memory, not Redis (see ENVIRONMENT.md). |
| 7 | Auth module | register (org + super admin), login, refresh with rotation + reuse detection, logout, me, forgot/reset password, email verification, change password. Argon2id. |
| 8 | RBAC | Permission catalogue seed, Role/RolePermission/UserRole, global `PermissionsGuard`, `@RequirePermissions`, `@Public`, `@CurrentUser`. |
| 9 | Organizations module | read/update current org, business hours + holidays CRUD. |
| 10 | Users module | CRUD, invite by email, activate/deactivate, role & department assignment, soft delete. |
| 11 | Departments & teams | CRUD incl. sub-departments and team membership. |
| 12 | Contacts & accounts | CRUD, search, pagination, account↔contact linking, soft delete. |
| 13 | Queue + worker skeleton | BullMQ registration, `email` and `notifications` queues, worker process, one real job (transactional email send) so the pipeline is proven end to end. |
| 14 | Realtime skeleton | Socket.IO gateway with JWT handshake auth, Redis adapter, org/user rooms, `notification.created` event. |
| 15 | Email provider abstraction | `EmailProvider` interface + SES and SMTP(dev/Mailhog) implementations; used by verification/reset/invite mails. |
| 16 | Object storage abstraction | `StorageProvider` interface + S3/MinIO implementation, presigned upload/download (used by avatars/logos in P1, attachments in P2). |
| 17 | Next.js app shell | App Router groups, login/register/forgot/reset pages, authed shell with sidebar + topbar + command palette, API client with refresh interceptor, TanStack Query + Zustand providers, shadcn/ui setup. |
| 18 | Phase-1 frontend screens | Settings → organization, users, roles, departments, teams; Customers (contacts) list + detail; Accounts list + detail. All wired to the real API with loading/empty/error states. |
| 19 | Tests | Unit: password hashing, token rotation, permission resolution. Integration (Testcontainers): register→login→refresh→logout, user invite, contact CRUD, **tenant isolation across all P1 resources**, permission denial. Frontend: login form + protected-route component tests, Playwright e2e for login → create contact. |
| 20 | Docs | README, SETUP, ENVIRONMENT; ARCHITECTURE/DATABASE/API updated to match what actually shipped. |

## Commit sequence (§68)
```
chore(repo): initialise pnpm workspace and tooling
chore(docker): add development docker compose stack
feat(config): add validated environment configuration
feat(prisma): add foundation schema and initial migration
feat(tenancy): enforce organization isolation in prisma layer
feat(common): add error envelope, logging, validation and rate limiting
feat(auth): implement authentication with refresh token rotation
feat(rbac): add roles, permissions and permission guard
feat(organizations): add organization and business hours management
feat(users): add user management and invitations
feat(departments): add departments and teams
feat(contacts): add contacts and accounts management
feat(queue): add bullmq queues and worker process
feat(realtime): add authenticated socket.io gateway
feat(web): add app shell, auth pages and api client
feat(web): add settings, contacts and accounts screens
test: add auth, rbac and tenant isolation tests
docs: add setup and environment documentation
```

## Environment variables introduced in Phase 1
```
NODE_ENV, PORT, API_PREFIX, FRONTEND_URL, BACKEND_URL
DATABASE_URL, REDIS_URL
JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES_IN
COOKIE_DOMAIN, COOKIE_SECURE
S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_FORCE_PATH_STYLE
EMAIL_PROVIDER, EMAIL_FROM, EMAIL_API_KEY, SMTP_HOST, SMTP_PORT
THROTTLE_TTL, THROTTLE_LIMIT, LOG_LEVEL
NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SOCKET_URL
```

## Definition of done for Phase 1 — verified

Run against PostgreSQL 16 and Redis 7:

- migrations apply from an empty database; the seed creates a demo organization, the
  five system roles, the permission catalogue, two departments, an admin and an agent;
- the API boots, `/api/v1/health` reports database and Redis up;
- registration provisions an organization, its roles, a default department and business
  hours in one transaction, and returns a session;
- login, refresh rotation, replay detection, forgot/reset password, invite acceptance
  and password change all work end to end, with the reset email delivered through the
  BullMQ queue by the worker process;
- a user of organization A cannot read, update or delete organization B's records —
  every attempt returns 404;
- an agent is refused `contact.delete`, `role.read` and `organization.update`; a role
  change takes effect on the next request without re-issuing the token;
- the frontend signs in, lists and creates contacts and accounts, and manages settings
  against the real API.

**Test results:** 37 API unit tests, 27 API integration tests (auth, tenant isolation,
RBAC, rate limiting), 3 browser tests — all passing.

## Known limitations carried into Phase 2

- Rate-limit counters are per API instance (in-memory), so they must move to a shared
  Redis store before horizontal scaling.
- Custom roles and teams can be created through the API but have no builder UI yet;
  the Roles and Teams screens are read-only.
- Object storage is configured but unused until attachments arrive in Phase 2.
- No ESLint configuration ships yet; `pnpm typecheck` and the test suites are the gate.

## Explicitly **not** in Phase 1
Tickets, conversations, attachments on tickets, SLA, automation, knowledge base, community, channels beyond transactional email, AI, dashboards and reports. Nothing in the UI will link to an unimplemented feature with a dead control (Rule 2).
