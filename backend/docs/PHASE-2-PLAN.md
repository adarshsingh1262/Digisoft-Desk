# Phase 2 — Core helpdesk

> **Status: complete.** Verified against a real PostgreSQL, Redis and a Chromium
> browser. Two deliverables landed differently from the plan and are noted inline.

## What shipped

| Area | Detail |
|---|---|
| Ticket model | Sequential per-organization numbering, contact/account/department/agent/category links, source, custom fields, soft delete |
| Configuration | Statuses, priorities, categories and tags as tenant-owned rows with behaviour flags — no code branches on a status name |
| Conversation | One row per message, typed `PUBLIC_REPLY` / `INTERNAL_COMMENT` / `SYSTEM_NOTE`; first-response time stamped from the first public reply only |
| Internal comments | Filtered out in the database query for non-agents, and visually unmistakable in the UI (amber panel, "Internal" label, warning above the composer) |
| Attachments | Upload with MIME allowlist, size cap and filename sanitisation; metadata in PostgreSQL, bytes in storage; every download re-authorised |
| Storage | Two real providers — local filesystem (streamed through the API) and S3-compatible (short-lived signed URLs) |
| Lifecycle | Assign, status, priority, resolve (resolution note required), close, reopen, merge, link, follow |
| History | Read from the audit trail, rendered as a timeline |
| Realtime | Ticket and message events addressed to the full-queue, department and assignee rooms only |
| Agent workspace | Three-pane layout: queue, conversation, properties; saved views; filters; search |
| Notifications | In-app notification on assignment and on activity for followers |

## Changed from the plan

1. **No `TicketHistory` table.** `GET /tickets/:id/history` reads `AuditLog`, which
   already records actor, action, entity and the old/new values. One append-only trail
   beats two that can disagree.
2. **Uploads are proxied, not presigned.** The original sketch had the browser PUT
   straight to object storage. Uploading through the API keeps one validation path
   (size, MIME, tenant, ticket visibility) for both storage providers, and is what
   makes the local provider a real option rather than a stub. Downloads still use
   signed URLs on S3.

## Record-level access

Tenant isolation is unchanged from Phase 1. On top of it:

- `ticket.read.all` sees the organization's whole queue.
- Without it, a user sees only tickets assigned to them, raised by them, followed by
  them, or sitting in one of their departments. Light agents are this case by default.
- `ticket.reply` (customer-visible) and `ticket.comment` (internal) are separate
  permissions, so a collaborator can help internally without ever being able to write
  to the customer.
- Out-of-scope tickets answer 404, never 403.

## Bugs the tests caught

| Bug | Consequence if shipped |
|---|---|
| `optionalField` applied its transform outside `.optional()` | `PATCH /tickets/:id` with one field nulled every other optional field — a ticket edit would silently detach its contact and department |
| Local storage root was compared unresolved against an absolute path | Every upload failed with an internal error |
| Changing a user's departments did not invalidate their cached access scope | A user kept their old ticket visibility for up to a minute after being moved |
| The SPA retried HTTP 429 | Rate-limited clients spent the rest of their budget making the throttling worse |
| The "Open" saved view used `isClosed: false` | Resolved tickets stayed in agents' open queues |

## Upgrade path for existing tenants

Two reconciliations run automatically, because Phase 2 adds configuration and
permissions that organizations created under Phase 1 do not have:

- **System role permissions** are reconciled against `SYSTEM_ROLE_PERMISSIONS` on every
  API boot. System roles are not editable through the API, which is what makes this
  safe; custom roles are never touched.
- **Ticket defaults** (statuses, priorities, categories) are backfilled by `pnpm db:seed`
  for any organization that has none.

## Test results

| Suite | Count |
|---|---|
| API unit | 53 |
| API integration | 65 |
| Browser | 6 |

New integration coverage: ticket lifecycle and numbering (22), record-level access and
cross-organization boundaries (8), attachments including traversal and MIME rejection (8).

## Known limitations carried into Phase 3

- No bulk actions on the queue (`POST /tickets/bulk` is planned, not built).
- Ticket search is `ILIKE` over subject and description; the PostgreSQL full-text
  indexes described in DATABASE.md are not in place yet.
- The conversation renders plain text. `bodyHtml` is stored but not displayed, because
  rendering it needs sanitisation that belongs with the email channel in Phase 5.
- Customers cannot see their own tickets yet — the portal is Phase 4. Internal-comment
  filtering is already enforced for non-agent users so it is ready for them.
- The S3 storage provider is implemented but has not been exercised against a live
  bucket in this environment; the local provider is covered end to end.
