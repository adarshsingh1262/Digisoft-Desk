# Digisoft360 Help Desk

A multi-tenant customer support platform (ticketing, SLA, automation, knowledge base, omnichannel, AI assistance, analytics).

**Current status: planning only.** No application code has been implemented yet. This repository currently contains the architecture and implementation plan produced in response to the product blueprint.

## Planned stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind, shadcn/ui, TanStack Query, Zustand, React Hook Form + Zod, Socket.IO client |
| Backend | Node.js + NestJS, TypeScript, REST `/api/v1`, Socket.IO |
| Database | PostgreSQL 16 via Prisma |
| Infrastructure | Redis, BullMQ workers, Docker Compose, S3-compatible object storage |

## Documents

| File | Contents |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, repository structure, multi-tenancy, auth/RBAC, Docker development setup |
| [DATABASE.md](./DATABASE.md) | Entity map, conventions, Phase-1 Prisma schema, later-phase tables, indexing plan |
| [API.md](./API.md) | REST endpoint plan by phase, Socket.IO events, error codes |
| [docs/FRONTEND.md](./docs/FRONTEND.md) | Next.js route plan and frontend conventions |
| [docs/PHASE-1-PLAN.md](./docs/PHASE-1-PLAN.md) | Phase 1 work breakdown, commit sequence, env vars, definition of done |

## Delivery phases

1. **Foundation** — workspace, Docker, Prisma, auth, RBAC, organizations, users, departments, contacts, accounts
2. **Core helpdesk** — tickets, statuses, priorities, assignment, conversations, internal comments, attachments, history, agent workspace
3. **Support operations** — activities, assignment rules, automation engine, SLA, escalation, blueprints
4. **Self-service** — knowledge base, help center, customer portal, web forms, community
5. **Omnichannel** — email, live chat, WhatsApp, Instagram, Messenger, Telegram, telephony (provider abstractions + mock provider where credentials are unavailable)
6. **AI** — summary, sentiment, intent, suggested reply, KB-grounded answers; pgvector/RAG later
7. **Analytics** — dashboards, reports, agent performance, SLA reporting, CSAT
