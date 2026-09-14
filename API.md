# Digisoft360 Help Desk — API Reference and Plan

> Status: endpoints marked **P1** are **implemented and tested**. Everything else is
> planned for the phase noted beside it and is not reachable yet.

Base path `/api/v1`. All responses use the envelope:

```json
{ "success": true, "data": { }, "meta": { "page": 1, "pageSize": 25, "total": 0 } }
{ "success": false, "error": { "code": "TICKET_NOT_FOUND", "message": "Ticket not found" } }
```

List endpoints share `?page&pageSize&sort&order&q&<filters>` and are cursor-capable where volume demands it. Every route except `@Public()` ones requires a bearer access token and is checked by `PermissionsGuard`.

## Auth — P1 (implemented)
```
POST   /auth/register                 # creates org + super admin (self-serve signup)
POST   /auth/login
POST   /auth/refresh                  # refresh cookie -> new access token (rotates)
POST   /auth/logout
GET    /auth/me
POST   /auth/forgot-password
POST   /auth/reset-password
POST   /auth/verify-email
POST   /auth/resend-verification
PATCH  /auth/password                 # change own password
```

## Organization — P1 (implemented)
```
GET    /organizations/current
PATCH  /organizations/current
GET    /organizations/current/business-hours
POST   /organizations/current/business-hours
PATCH  /organizations/current/business-hours/:id
POST   /organizations/current/business-hours/:id/holidays
DELETE /organizations/current/holidays/:id
```

## Users, roles, permissions, departments, teams — P1 (implemented)
```
GET|POST        /users
GET|PATCH|DELETE /users/:id
POST            /users/invite
PATCH           /users/:id/roles
PATCH           /users/:id/departments
POST            /users/:id/activate | /deactivate

GET|POST        /roles
GET|PATCH|DELETE /roles/:id
GET             /permissions

GET|POST        /departments
GET|PATCH|DELETE /departments/:id
GET|POST        /teams
GET|PATCH|DELETE /teams/:id
PATCH           /teams/:id/members
```

## Contacts & accounts — P1 (implemented)
```
GET|POST        /contacts
GET|PATCH|DELETE /contacts/:id
GET             /contacts/:id/tickets        # P2
GET             /contacts/:id/activities     # P3
POST            /contacts/import             # P2

GET|POST        /accounts
GET|PATCH|DELETE /accounts/:id
GET             /accounts/:id/contacts
GET             /accounts/:id/tickets        # P2
```

## Tickets — P2 (implemented)
```
GET    /tickets                       # ?page&pageSize&q&sort&order plus the filters below
GET    /tickets/summary               # counts behind the saved views
GET    /tickets/:id
POST   /tickets
PATCH  /tickets/:id                   # only the fields sent are changed
DELETE /tickets/:id                   # soft delete

POST   /tickets/:id/assign            # { assignedAgentId?, departmentId? }
POST   /tickets/:id/status            # { statusId, resolutionNote? }
POST   /tickets/:id/priority          # { priorityId }
POST   /tickets/:id/resolve           # { resolutionNote } — required
POST   /tickets/:id/close
POST   /tickets/:id/reopen
PATCH  /tickets/:id/tags              # { tagIds } replaces the set
POST   /tickets/:id/merge             # { targetTicketId, comment? }
POST   /tickets/:id/links             # { linkedTicketId, type }
DELETE /tickets/:id/links/:linkId
POST   /tickets/:id/follow | /unfollow
GET    /tickets/:id/history           # from the audit trail

GET    /tickets/:id/messages          # internal comments filtered out for non-agents
POST   /tickets/:id/messages          # public reply     (ticket.reply)
POST   /tickets/:id/comments          # internal comment (ticket.comment)

POST   /tickets/:id/attachments       # multipart upload, validated and stored
GET    /tickets/:id/attachments
GET    /attachments/:id/download      # streamed (local) or 302 to a signed URL (S3)
DELETE /attachments/:id

GET|POST         /ticket-statuses    · PATCH|DELETE /ticket-statuses/:id
GET|POST         /ticket-priorities  · PATCH|DELETE /ticket-priorities/:id
GET|POST         /ticket-categories  · PATCH|DELETE /ticket-categories/:id
GET|POST         /tags               · DELETE       /tags/:id
```

**List filters:** `statusId`, `priorityId`, `departmentId`, `assignedAgentId`, `categoryId`,
`contactId`, `accountId`, `tagId`, `source`, plus the saved-view shortcuts `assignedToMe`,
`unassigned` and `open` (neither resolved nor closed). `q` matches the subject, the
description or a ticket number.

**Not yet built:** `POST /tickets/bulk`.

## Activities — P3 (implemented)
```
GET    /activities                    # ?type&status&ticketId&contactId&accountId&assignedToId&assignedToMe&overdue&q
GET    /activities/:id
POST   /activities                    # { type: TASK|CALL|EVENT, subject, ... }
PATCH  /activities/:id                # includes { status: OPEN|COMPLETED|CANCELLED }
DELETE /activities/:id                # soft delete
```
A call logged with a duration is stored as already completed. An event needs `startAt`.

## Support operations — P3 (implemented)
```
GET|POST         /assignment-rules   · PATCH|DELETE /assignment-rules/:id
PATCH            /assignment-rules/reorder            # { ids } — full evaluation order

GET              /automation-rules?escalations=true|false
GET              /automation-rules/runs               # ?ruleId&ticketId&matched — every evaluation
GET|POST         /automation-rules   · PATCH|DELETE /automation-rules/:id
POST             /automation-rules/:id/enable | /disable

GET|POST         /sla-policies       · PATCH|DELETE /sla-policies/:id   (PATCH takes the full policy)
GET|POST         /blueprints         · PATCH|DELETE /blueprints/:id     (PATCH takes the full blueprint)

GET    /tickets/:id/transitions        # { governed, blueprint?, transitions[] } for the caller's roles
```

**Escalations are automation rules** whose trigger is `SLA_WARNING` or `SLA_BREACHED`;
there is no separate escalation resource. `?escalations=true` lists just those.

**Rule DSL** (shared by assignment rules, automation rules, SLA policies and blueprints):
conditions are `{ all: Leaf[], any: Leaf[] }` with `Leaf = { field, op, value? }` over
`statusId · priorityId · departmentId · categoryId · assignedAgentId · contactId ·
accountId · source · tagIds · subject · description · contactIsVip · isAssigned ·
priorityWeight` and operators `eq neq in not_in contains not_contains is_empty
is_not_empty gt gte lt lte`. Actions: `assign_agent · assign_department · unassign ·
set_priority · set_status · add_tag · remove_tag · apply_sla · notify_users ·
notify_assignee · notify_department · send_email · add_internal_note · create_task`.
Messages accept `{{ticket.number}} {{ticket.subject}} {{ticket.status}}
{{ticket.priority}} {{contact.name}} {{assignee.name}} {{organization.name}}`.

**Ticket SLA fields** (on every ticket payload): `slaPolicy`, `firstResponseDueAt`,
`resolutionDueAt`, `firstResponseBreachedAt`, `resolutionBreachedAt`, `slaPausedAt`;
`dueAt` mirrors `resolutionDueAt`.

**Query booleans** are parsed strictly: `true|false|1|0`. Anything else is a 400.

## Self-service — P4
```
GET|POST /knowledge-base/categories · /:id
GET|POST /knowledge-base/articles   · /:id · POST /:id/publish|/archive
POST     /knowledge-base/articles/:id/feedback
GET      /knowledge-base/search?q=

GET|POST /web-forms · /:id
POST     /public/forms/:slug/submit          # @Public, captcha + rate limited

# Help center / customer portal (customer JWT)
GET  /portal/tickets · /portal/tickets/:id · POST /portal/tickets
POST /portal/tickets/:id/replies
GET  /portal/profile · PATCH /portal/profile
GET  /public/help/categories · /public/help/articles · /public/help/articles/:slug

GET|POST /community/topics · /:id · POST /:id/posts · POST /posts/:id/vote
POST     /community/posts/:id/moderate
```

## Channels — P5
```
GET|POST /channels · /:id · POST /:id/test
POST     /webhooks/email/:channelId        # @Public + signature verification
POST     /webhooks/whatsapp/:channelId
POST     /webhooks/meta/:channelId         # instagram + messenger
POST     /webhooks/telegram/:channelId
POST     /webhooks/telephony/:channelId
GET|POST /calls · /calls/:id
GET|POST /chat/conversations · /:id · POST /:id/convert-to-ticket
GET|POST /webhook-endpoints · /:id · GET /:id/deliveries · POST /deliveries/:id/retry
```

## AI — P6
```
GET|PATCH /ai/settings
POST /ai/tickets/:id/summary
POST /ai/tickets/:id/sentiment
POST /ai/tickets/:id/intent
POST /ai/tickets/:id/suggest-reply     # returns a draft; never sends
POST /ai/answers                       # KB-grounded answer
GET  /ai/usage
```

## Analytics — P7
```
GET /dashboard                        # ?range&departmentId&agentId
GET /reports/tickets · /reports/agents · /reports/sla · /reports/csat
POST /reports/export                  # queued -> signed download URL
GET|POST /report-definitions · /:id
POST /tickets/:id/csat                # @Public via signed token
GET  /csat/summary
```

## Notifications — P1 (implemented)
```
GET    /notifications?page&pageSize&unreadOnly
GET    /notifications/unread-count
POST   /notifications/:id/read
POST   /notifications/read-all
```

## Health — P1 (implemented)
```
GET    /health                        # @Public; reports database and redis status
```

## Search — P2
```
GET    /search?q=&types=tickets,contacts,accounts,articles
```

## Socket.IO events (§43)

Namespace `/rt`, authenticated on handshake with the access token. A socket joins
`org:{id}` and `org:{id}:user:{userId}` only, so a broadcast cannot cross a tenant
boundary. Ticket and department rooms arrive with Phase 2.

Implemented today: `ticket.created`, `ticket.updated`, `ticket.assigned`,
`ticket.status_changed`, `message.created`, `sla.warning`, `sla.breached`,
`notification.created`, `agent.online`, `agent.offline`. Worker-originated ticket
events carry an `audience` and are routed to the same rooms as API-originated ones.

Ticket events are addressed to three rooms — the organization's full-queue room (joined
only by sockets whose user holds `ticket.read.all`), the ticket's department room, and
the assignee — so a socket is never sent an event for a ticket its user could not open
through the API. Background workers publish envelopes on the Redis channel `rt:emit`,
which the API instances fan out to their own sockets.

```
server -> client: ticket.created · ticket.updated · ticket.assigned ·
                  ticket.status_changed · message.created · comment.created ·
                  notification.created · agent.online · agent.offline ·
                  chat.message · chat.typing · sla.warning · sla.breached
client -> server: ticket.subscribe · ticket.unsubscribe · chat.message ·
                  chat.typing · presence.ping
```

## Error codes (initial catalogue)

`VALIDATION_ERROR` · `UNAUTHENTICATED` · `TOKEN_EXPIRED` · `INVALID_CREDENTIALS` ·
`FORBIDDEN` · `PERMISSION_DENIED` · `NOT_FOUND` · `<ENTITY>_NOT_FOUND` ·
`CONFLICT` · `EMAIL_ALREADY_EXISTS` · `RATE_LIMITED` · `FILE_TOO_LARGE` ·
`UNSUPPORTED_MEDIA_TYPE` · `WEBHOOK_SIGNATURE_INVALID` · `INTERNAL_ERROR`
