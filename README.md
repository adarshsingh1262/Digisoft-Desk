# Digisoft360 Help Desk

A multi-tenant customer support platform: ticketing, SLA, automation, knowledge base,
omnichannel and AI assistance.

**Status: Phase 1 (Foundation) implemented.** Authentication, RBAC, organizations,
users, departments, teams, contacts and accounts work end to end against the real API.
Ticketing and everything after it are not built yet — the UI does not pretend
otherwise.

```bash
cp .env.example .env     # set the two JWT secrets
docker compose --profile local-db up --build
```

Then open http://localhost:3000. Full instructions in [SETUP.md](./SETUP.md).

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind, TanStack Query, Zustand, React Hook Form + Zod |
| Backend | Node.js + NestJS 11, REST `/api/v1`, Socket.IO |
| Database | PostgreSQL 16 via Prisma 6 |
| Background work | BullMQ on Redis, run by a separate worker process |
| Infrastructure | Docker Compose for development; S3-compatible object storage |

## Layout

```
apps/api       NestJS API and Socket.IO gateway
apps/worker    BullMQ consumers (email, notifications)
apps/web       Next.js frontend
packages/db    Prisma schema, migrations, seed, tenant-isolation extension
packages/shared  Zod schemas and types shared by the frontend and backend
```

## What Phase 1 delivers

- **Multi-tenancy** enforced in the data layer, not in callers: a Prisma client
  extension injects `organizationId` into every query and cross-tenant access returns
  404 rather than 403, so record ids stay unenumerable.
- **Authentication** with Argon2id, short-lived access tokens, and refresh-token
  rotation with reuse detection that revokes the whole session family.
- **RBAC** over a permission catalogue, with five seeded system roles and support for
  custom ones. Permissions are re-resolved per request (Redis-cached), so revoking a
  role takes effect immediately.
- **Organizations, users, departments, teams, contacts, accounts** — full CRUD with
  validation, authorization, audit history and soft deletes.
- **Agent console** with dashboard, customers, accounts and settings, wired to the real
  API with loading, empty and error states throughout.
- **Background jobs and realtime**: a worker that sends transactional email, and an
  authenticated Socket.IO gateway scoped to organization and user rooms.

## Tests

| Suite | Count | Command |
|---|---|---|
| API unit | 37 | `pnpm --filter @digisoft/api test` |
| API integration (auth, tenant isolation, RBAC, rate limiting) | 27 | `pnpm --filter @digisoft/api test:e2e` |
| Browser (register → sign in → create a customer) | 3 | `pnpm --filter @digisoft/web test:e2e` |

## Documentation

| File | Contents |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, multi-tenancy, auth/RBAC, project layout |
| [DATABASE.md](./DATABASE.md) | Entity map, schema, indexing plan |
| [API.md](./API.md) | Endpoint reference, Socket.IO events, error codes |
| [SETUP.md](./SETUP.md) | Running it locally, with or without Docker |
| [ENVIRONMENT.md](./ENVIRONMENT.md) | Every environment variable |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Production topology and go-live checklist |
| [docs/FRONTEND.md](./docs/FRONTEND.md) | Route plan and frontend conventions |
| [docs/PHASE-1-PLAN.md](./docs/PHASE-1-PLAN.md) | Phase 1 scope and status |

## Roadmap

1. ~~**Foundation** — workspace, Docker, Prisma, auth, RBAC, organizations, users, departments, contacts, accounts~~ ✅
2. **Core helpdesk** — tickets, statuses, priorities, assignment, conversations, internal comments, attachments, history, agent workspace
3. **Support operations** — activities, assignment rules, automation engine, SLA, escalation, blueprints
4. **Self-service** — knowledge base, help center, customer portal, web forms, community
5. **Omnichannel** — email, live chat, WhatsApp, Instagram, Messenger, Telegram, telephony
6. **AI** — summary, sentiment, intent, suggested reply, KB-grounded answers; pgvector/RAG later
7. **Analytics** — dashboards, reports, agent performance, SLA reporting, CSAT
