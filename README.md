# Digisoft360 Help Desk

A multi-tenant customer support platform: ticketing, SLA, automation, knowledge base,
omnichannel and AI assistance.

**Status: Phases 1–3 implemented.** Authentication, RBAC, organizations, users,
departments, teams, contacts, accounts, the full ticketing core — conversations,
internal comments, attachments, history, the agent workspace — and the operations
layer: activities, assignment rules, an automation engine with escalations, SLA with
business hours and a background sweep, and blueprint workflows. Self-service, the
other channels, AI and analytics are not built yet, and the UI does not pretend
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
apps/worker    BullMQ consumers (email, notifications, automation, SLA sweep)
apps/web       Next.js frontend
packages/engine  Rule evaluation, actions, business-hours SLA math, assignment, blueprints
packages/db    Prisma schema, migrations, seed, tenant-isolation extension
packages/shared  Zod schemas and types shared by the frontend and backend
```

## What is built

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
- **Ticketing** with per-organization sequential numbering allocated inside the
  creation transaction, configurable statuses and priorities (behaviour comes from
  flags, never from a name), assignment, tags, merge, linking and following.
- **Conversations** stored one row per message, with customer replies and internal
  comments as distinct types. Internal comments are filtered out in the database query
  for non-agents and are unmistakable in the UI.
- **Attachments** with a MIME allowlist, size cap and filename sanitisation; metadata in
  PostgreSQL and bytes in storage, behind two real providers (local filesystem, or any
  S3-compatible bucket with signed URLs). Every download is re-authorised.
- **Record-level ticket access**: `ticket.read.all` sees the whole queue; without it an
  agent sees only their assignments, their departments and tickets they follow.
- **Agent workspace**: three-pane queue / conversation / properties layout with saved
  views, filters, search, quick actions and a history timeline.
- **Activities**: tasks, calls and events attached to tickets, contacts and accounts.
- **Assignment rules**: ordered, condition-driven routing to a specific agent, a
  department queue, round-robin, or the least-loaded agent.
- **Automation engine**: trigger + conditions + ordered actions, with every evaluation
  recorded. Escalations are the same rules on the SLA triggers.
- **SLA**: per-priority first-response and resolution targets on a business-hours
  calendar with holidays; the clock pauses in on-hold statuses and a worker sweep raises
  warnings and breaches exactly once.
- **Blueprints**: configurable state machines with required fields and role
  restrictions; a governed ticket can only move along its allowed transitions.
- **Background jobs and realtime**: a worker that sends email, runs automation and
  sweeps SLAs, and an authenticated Socket.IO gateway whose ticket events reach only
  the sockets entitled to that ticket.

## Tests

| Suite | Count | Command |
|---|---|---|
| Engine unit (business hours, conditions, blueprints) | 24 | `pnpm --filter @digisoft/engine test` |
| API unit | 59 | `pnpm --filter @digisoft/api test` |
| API integration (auth, tenant isolation, RBAC, rate limiting, tickets, ticket access, attachments, activities, operations) | 86 | `pnpm --filter @digisoft/api test:e2e` |
| Browser (register, customers, ticket workflow, automation and SLA) | 9 | `pnpm --filter @digisoft/web test:e2e` |

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
| [docs/PHASE-2-PLAN.md](./docs/PHASE-2-PLAN.md) | Phase 2 scope, decisions and status |
| [docs/PHASE-3-PLAN.md](./docs/PHASE-3-PLAN.md) | Phase 3 scope, decisions and status |

## Roadmap

1. ~~**Foundation** — workspace, Docker, Prisma, auth, RBAC, organizations, users, departments, contacts, accounts~~ ✅
2. ~~**Core helpdesk** — tickets, statuses, priorities, assignment, conversations, internal comments, attachments, history, agent workspace~~ ✅
3. ~~**Support operations** — activities, assignment rules, automation engine, SLA, escalation, blueprints~~ ✅
4. **Self-service** — knowledge base, help center, customer portal, web forms, community
5. **Omnichannel** — email, live chat, WhatsApp, Instagram, Messenger, Telegram, telephony
6. **AI** — summary, sentiment, intent, suggested reply, KB-grounded answers; pgvector/RAG later
7. **Analytics** — dashboards, reports, agent performance, SLA reporting, CSAT
