# Digisoft360 Help Desk — Data Model

> Status: **Phases 1–3 are implemented and migrated.** Later-phase tables are planned
> shapes, not yet created.

Schema, migrations and seed live in `packages/db`. The initial migration is
`packages/db/prisma/migrations/*_init`.

PostgreSQL 16 + Prisma. JSONB is used only where fields are genuinely user-configurable (custom fields, automation rule bodies, form schemas, audit diffs).

## 1. Entity map

```
Organization (tenant root)
├── User ──< UserRole >── Role ──< RolePermission >── Permission
│     └──< UserDepartment >── Department ──< TeamMember >── Team
├── Contact ──> Account
├── Account
├── Ticket ──> Contact, Account, Department, User(assignee),
│   │          TicketStatus, TicketPriority, Category, SlaPolicy
│   ├──< TicketMessage ──< Attachment
│   ├──< TicketTag >── Tag
│   ├──< TicketHistory (audit)
│   ├──< TicketFollower
│   ├──< TicketLink (related/merged)
│   ├──< SlaTimer
│   ├──< Activity (task/call/event)
│   ├──  CsatResponse
│   └──< AiInsight
├── SlaPolicy ──< SlaTarget
├── BusinessHours ──< Holiday
├── AutomationRule (trigger + conditions JSONB + actions JSONB)
├── AssignmentRule
├── Blueprint ──< BlueprintTransition
├── KbCategory ──< KbArticle ──< KbArticleFeedback
├── CommunityTopic ──< CommunityPost ──< CommunityVote
├── Channel (email/chat/whatsapp/... config, secrets encrypted)
├── WebForm
├── Notification
├── WebhookEndpoint ──< WebhookDelivery
└── AuditLog
```

## 2. Conventions

- PK: `String @id @default(cuid())`.
- Tenant column: `organizationId String` + `@@index([organizationId, ...])` on every query path.
- Timestamps: `createdAt @default(now())`, `updatedAt @updatedAt`.
- Soft delete: `deletedAt DateTime?` on `Organization`, `User`, `Department`, `Team`,
  `Contact`, `Account` (and later `Ticket`, `KbArticle`). The Prisma extension adds
  `deletedAt: null` to reads unless the caller filters on it explicitly, so a deleted
  row can still be inspected or restored deliberately.
- Enums are used only for values the *product* controls (`ChannelType`, `MessageType`, `ActivityType`). Ticket **status and priority are tables**, not enums (§15/§16) — the seeded rows are `NEW/OPEN/IN_PROGRESS/ON_HOLD/PENDING/RESOLVED/CLOSED` and `LOW/MEDIUM/HIGH/URGENT`, each with a `systemKey` plus `isDefault`, `isResolved`, `isClosed` behaviour flags so no code branches on the literal name.
- Money/duration: minutes as `Int`; all timestamps `timestamptz`.
- `customFields Json?` on `Ticket`, `Contact`, `Account`.

## 3. Phase 1 schema (`packages/db/prisma/schema.prisma`)

```prisma
model Organization {
  id               String   @id @default(cuid())
  name             String
  slug             String   @unique
  logoUrl          String?
  domain           String?
  timezone         String   @default("UTC")
  locale           String   @default("en")
  currency         String   @default("USD")
  settings         Json     @default("{}")
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  deletedAt        DateTime?
  // relations: users, roles, departments, teams, contacts, accounts, businessHours, ...
}

model BusinessHours {
  id             String  @id @default(cuid())
  organizationId String
  name           String
  timezone       String
  isDefault      Boolean @default(false)
  // [{ day: 1, start: "09:00", end: "18:00" }, ...]
  weeklySchedule Json
  holidays       Holiday[]
  @@index([organizationId])
}

model Holiday {
  id              String   @id @default(cuid())
  organizationId  String
  businessHoursId String
  name            String
  date            DateTime @db.Date
  @@index([organizationId, date])
}

model User {
  id               String    @id @default(cuid())
  organizationId   String
  email            String
  passwordHash     String?
  firstName        String
  lastName         String
  avatarUrl        String?
  phone            String?
  type             UserType  @default(AGENT)   // AGENT | CUSTOMER
  contactId        String?   @unique           // set when type = CUSTOMER
  isActive         Boolean   @default(true)
  emailVerifiedAt  DateTime?
  lastLoginAt      DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  deletedAt        DateTime?
  @@unique([organizationId, email])
  @@index([organizationId, isActive])
}

model Role {
  id             String  @id @default(cuid())
  organizationId String
  name           String
  systemKey      String? // SUPER_ADMIN | ADMIN | AGENT | LIGHT_AGENT | CUSTOMER
  description    String?
  isSystem       Boolean @default(false)
  @@unique([organizationId, name])
}

model Permission {          // global catalogue, not tenant-scoped
  id          String @id @default(cuid())
  key         String @unique   // "ticket.read", "ticket.assign", ...
  resource    String
  action      String
  description String
}

model RolePermission { roleId String; permissionId String; @@id([roleId, permissionId]) }
model UserRole       { userId String; roleId String;       @@id([userId, roleId]) }

model Department {
  id             String  @id @default(cuid())
  organizationId String
  name           String
  description    String?
  email          String?          // department support address
  isDefault      Boolean @default(false)
  parentId       String?          // sub-departments
  @@unique([organizationId, name])
}

model UserDepartment { userId String; departmentId String; @@id([userId, departmentId]) }

model Team {
  id             String @id @default(cuid())
  organizationId String
  departmentId   String?
  name           String
  @@unique([organizationId, name])
}
model TeamMember { teamId String; userId String; @@id([teamId, userId]) }

model Account {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  website        String?
  industry       String?
  phone          String?
  email          String?
  addressLine1   String?
  addressLine2   String?
  city           String?
  state          String?
  postalCode     String?
  country        String?
  description    String?
  customFields   Json?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?
  @@index([organizationId, name])
}

model Contact {
  id             String        @id @default(cuid())
  organizationId String
  accountId      String?
  firstName      String
  lastName       String?
  email          String?
  phone          String?
  mobile         String?
  jobTitle       String?
  avatarUrl      String?
  status         ContactStatus @default(ACTIVE)
  isVip          Boolean       @default(false)
  customFields   Json?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  deletedAt      DateTime?
  @@unique([organizationId, email])
  @@index([organizationId, accountId])
}

model RefreshToken {
  id             String   @id @default(cuid())
  userId         String
  organizationId String
  tokenHash      String   @unique
  familyId       String
  userAgent      String?
  ip             String?
  expiresAt      DateTime
  revokedAt      DateTime?
  createdAt      DateTime @default(now())
  @@index([userId, familyId])
}

model VerificationToken {
  id        String   @id @default(cuid())
  userId    String
  type      TokenType    // EMAIL_VERIFICATION | PASSWORD_RESET | INVITE
  tokenHash String   @unique
  expiresAt DateTime
  usedAt    DateTime?
  @@index([userId, type])
}

model AuditLog {
  id             String   @id @default(cuid())
  organizationId String
  actorId        String?
  actorType      String   @default("USER")   // USER | SYSTEM | AUTOMATION
  action         String                      // "ticket.status_changed"
  entity         String
  entityId       String
  oldValue       Json?
  newValue       Json?
  ip             String?
  createdAt      DateTime @default(now())
  @@index([organizationId, entity, entityId, createdAt])
  @@index([organizationId, createdAt])
}
```

## 4. Later-phase tables (shape fixed now, migrated in their phase)

- **Phase 2 (built)** — `Ticket`, `TicketStatus`, `TicketPriority`, `TicketCategory`,
  `Tag`, `TicketTag`, `TicketMessage`, `Attachment`, `TicketFollower`, `TicketLink`.
  Two decisions differ from the original sketch:
  - `TicketMessage.type` is an enum (`PUBLIC_REPLY` / `INTERNAL_COMMENT` /
    `SYSTEM_NOTE`) rather than an `isInternal` boolean, so system notes are a first
    class kind instead of a third state squeezed into a flag.
  - There is no separate `TicketHistory` table: `GET /tickets/:id/history` reads
    `AuditLog` filtered to the ticket. One append-only trail is easier to keep correct
    than two, and it already carries actor, action, old and new values.
- **Phase 3 (built)** — `Activity`, `AssignmentRule`, `AutomationRule`, `AutomationRun`,
  `SlaPolicy`, `SlaTarget`, `Blueprint`, `BlueprintTransition`. Three decisions differ
  from the sketch:
  - **No `SlaTimer` table.** The clock lives on `Ticket` (`slaPolicyId`,
    `firstResponseDueAt`, `resolutionDueAt`, `*WarnedAt`, `*BreachedAt`, `slaPausedAt`,
    `firstResponseRemainingMin`, `resolutionRemainingMin`), indexed on the two due
    columns. Pausing stores the *remaining business minutes*; resuming rebuilds the due
    dates from now on the policy's calendar, so a weekend spent on hold is not handed
    back to the customer as extra time.
  - **No `EscalationRule` table.** An escalation is an `AutomationRule` on the
    `SLA_WARNING` / `SLA_BREACHED` trigger — one engine, one run log.
  - `TicketStatus.pausesSla` marks statuses that stop the clock (On Hold and Pending by
    default). `AutomationRun` records every evaluation, matched or not, with the action
    outcomes, so "why didn't my rule fire" is answerable from the data.
- **Phase 4** — `KbCategory`, `KbArticle` (tsvector column + GIN index), `KbArticleFeedback`, `WebForm`, `CommunityTopic`, `CommunityPost`, `CommunityVote`.
- **Phase 5** — `Channel`, `EmailInbox`, `EmailMessageRef`, `ChatConversation`, `CallLog`, `WebhookEndpoint`, `WebhookDelivery`.
- **Phase 6** — `AiInsight`, `AiProviderConfig`, `AiRequestLog` (+ `pgvector` extension and `KbArticleEmbedding` later).
- **Phase 7** — `CsatResponse`, `ReportDefinition`, plus rollup tables `TicketDailyMetric` / `AgentDailyMetric` populated by a worker so dashboards never scan the ticket table (§40).

## 4a. Ticket numbering

`Ticket.ticketNumber` is sequential **per organization**, not global. The counter lives
in `Organization.ticketSequence` and is bumped with an `increment` inside the same
transaction that inserts the ticket, so the row lock serialises concurrent creates and
no two tickets can share a number. `@@unique([organizationId, ticketNumber])` is the
backstop, and a concurrency test asserts five simultaneous creates produce 1–5.

## 5. Isolation in the data layer

`packages/db/src/tenant.extension.ts` wraps every Prisma operation:

- reads, updates and deletes against a tenant-owned model get `organizationId` merged
  into `where` — a caller-supplied value is overwritten, never trusted;
- creates get `organizationId` stamped onto the row;
- with no tenant context the query throws rather than running unscoped (fail closed);
- `TenantContext.runUnscoped()` is the only escape hatch, used by login lookup and
  organization provisioning, and is grep-auditable.

The rewriting logic is a pure function (`scopeArgs`) so the rules are unit tested
directly, and the guarantee is tested again end to end in
`apps/api/test/tenant-isolation.e2e-spec.ts`.

Join tables (`UserRole`, `UserDepartment`, `TeamMember`, `RolePermission`) carry no
`organizationId`; they are only reachable through a parent row whose ownership the
owning service verifies first. `Permission` is a global catalogue by design.

## 6. Indexing plan (§49)

Every one of these is a composite index leading with `organizationId`:
`Ticket(statusId)`, `Ticket(priorityId)`, `Ticket(assignedAgentId, statusId)`, `Ticket(departmentId, statusId)`, `Ticket(contactId)`, `Ticket(accountId)`, `Ticket(createdAt)`, `Ticket(dueAt)` (partial: `WHERE "closedAt" IS NULL`), `TicketMessage(ticketId, createdAt)`, `Activity(ticketId)`, `AuditLog(entity, entityId, createdAt)`, `Contact(email)`, `Account(name)`.
Full-text: generated `tsvector` columns with GIN indexes on `Ticket(subject, description)` and `KbArticle(title, body)`; the search layer sits behind a `SearchService` interface so OpenSearch can replace the implementation (§44).
