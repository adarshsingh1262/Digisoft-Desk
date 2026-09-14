# Digisoft360 Help Desk — API Plan

> Status: **Planning deliverable (§70)**. Endpoints marked **P1** are in Phase 1 scope; the rest are planned.

Base path `/api/v1`. All responses use the envelope:

```json
{ "success": true, "data": { }, "meta": { "page": 1, "pageSize": 25, "total": 0 } }
{ "success": false, "error": { "code": "TICKET_NOT_FOUND", "message": "Ticket not found" } }
```

List endpoints share `?page&pageSize&sort&order&q&<filters>` and are cursor-capable where volume demands it. Every route except `@Public()` ones requires a bearer access token and is checked by `PermissionsGuard`.

## Auth — P1
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

## Organization — P1
```
GET    /organizations/current
PATCH  /organizations/current
GET    /organizations/current/business-hours
POST   /organizations/current/business-hours
PATCH  /organizations/current/business-hours/:id
POST   /organizations/current/business-hours/:id/holidays
DELETE /organizations/current/holidays/:id
```

## Users, roles, permissions, departments, teams — P1
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

## Contacts & accounts — P1
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

## Tickets — P2
```
GET|POST        /tickets
GET|PATCH|DELETE /tickets/:id
POST   /tickets/:id/assign            # { agentId?, departmentId? }
POST   /tickets/:id/status
POST   /tickets/:id/priority
POST   /tickets/:id/resolve           # { resolutionNote }
POST   /tickets/:id/close
POST   /tickets/:id/reopen
POST   /tickets/:id/merge             # { targetTicketId }
POST   /tickets/:id/links
POST   /tickets/:id/follow | /unfollow
GET|POST /tickets/:id/messages        # public reply
POST   /tickets/:id/comments          # internal comment
GET    /tickets/:id/history
POST   /tickets/:id/attachments       # -> presigned PUT
GET    /attachments/:id/download      # -> presigned GET, authz checked
PATCH  /tickets/:id/tags
POST   /tickets/bulk                  # bulk assign/status/priority/tag
GET    /ticket-statuses | /ticket-priorities | /categories | /tags   (CRUD, admin)
```

## Activities, automation, SLA, blueprints — P3
```
GET|POST /activities                   # ?type=TASK|CALL|EVENT
GET|PATCH|DELETE /activities/:id
GET|POST /automation-rules  · /:id · POST /:id/enable|/disable · GET /:id/runs
GET|POST /assignment-rules  · /:id · PATCH /reorder
GET|POST /sla-policies · /:id · GET /tickets/:id/sla
GET|POST /escalation-rules · /:id
GET|POST /blueprints · /:id · GET /tickets/:id/transitions
```

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

## Notifications & search — P1/P2
```
GET   /notifications · POST /notifications/:id/read · POST /notifications/read-all
GET   /search?q=&types=tickets,contacts,accounts,articles
```

## Socket.IO events (§43)

Namespace `/rt`, authenticated on handshake, rooms `org:{id}`, `user:{id}`, `ticket:{id}`, `dept:{id}`.

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
