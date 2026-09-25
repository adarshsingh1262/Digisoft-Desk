# Phase 3 — Support operations

> **Status: complete.** Verified against a real PostgreSQL, Redis, the worker process
> and a Chromium browser. Decisions that differ from the original sketch are noted.

## What shipped

| Area | Detail |
|---|---|
| Activities | Tasks, calls and events on tickets, contacts and accounts; overdue view; calls logged with a duration are complete on entry |
| Assignment rules | Ordered, condition-driven; strategies: specific agent, department queue, round-robin (per-rule cursor), least-loaded (open-ticket count). Never overrides an explicit assignment |
| Automation | Trigger + `{all, any}` conditions + ordered actions; 14 action types; every evaluation recorded as an `AutomationRun` with per-action outcomes |
| Escalations | Automation rules on `SLA_WARNING` / `SLA_BREACHED`; built-in notices go to the assignee (warning) and all followers (breach) |
| SLA | Policies with per-priority targets and a fallback; business-hours or wall-clock per target; warning window; default policy provisioned for every organization; clock pauses in `pausesSla` statuses and resumes from remaining business minutes |
| SLA sweep | Repeatable worker job; idempotent via stamps; emits realtime `sla.*`, notifications, audit entries and the escalation triggers |
| Blueprints | Condition-scoped state machines; transitions with required fields, allowed roles and follow-up actions; `GET /tickets/:id/transitions` drives the status control |
| Engine package | `@digisoft/engine` shared by API (synchronous pieces) and worker (queued pieces) |
| UI | Activities screen; Automation section (rules, escalations, assignment, SLA, blueprints) with shared condition/action editors; SLA panel and badges; transition-aware status control; activities tab on tickets |

## Changed from the plan

1. **No `SlaTimer` or `EscalationRule` tables.** SLA state lives on the ticket; escalations
   are automation rules on the SLA triggers. One engine and one run log instead of three.
2. **Automation runs in the worker, assignment/SLA/blueprints run in the request.** The
   request-time pieces are the ones whose effect the caller must see immediately; the
   rest must never slow a response.
3. **Business hours without a date library.** `Intl` gives local parts per timezone; a
   two-pass conversion handles DST. Covered by unit tests including a DST crossing.

## Bugs the tests and the live run caught

| Bug | Consequence if shipped |
|---|---|
| `z.coerce.boolean()` on query parameters | `?escalations=false` (and any `=false` filter) parsed as `true`; the workflow-rules list showed nothing after a rule was created |
| BullMQ custom job ids contained `:` | Every ticket creation returned 500 once triggers were enqueued |
| Zod 4 refuses `.partial()` on a refined schema | The API failed to boot; assignment-rule updates now use a separate partial schema with the cross-field check done in the service |
| Timezone conversion double-applied the offset | Every business-hours due date was hours off |
| Existing organizations' On Hold / Pending statuses lacked `pausesSla` | Moving a ticket on hold did not stop the clock for tenants created before Phase 3 |

## Upgrade path for existing tenants

`pnpm db:seed` (idempotent) now also: provisions the default SLA policy for any
organization without one, and marks the On Hold and Pending system statuses as pausing
the SLA clock. System-role permissions continue to reconcile on every API boot, which is
how existing agents received `activity.*` and `operations.read`.

## Test results

| Suite | Count |
|---|---|
| Engine unit | 24 |
| API unit | 59 |
| API integration | 86 |
| Browser | 9 |

New integration coverage: activities (4), operations (17) — round-robin, least-loaded,
rule ordering, explicit-assignment precedence, default SLA and priority re-derivation,
pause/resume, the sweep's idempotence, a VIP policy, blueprint reachability, required
fields, role restrictions and scoping, automation actions, escalation on breach, and
cross-organization isolation of rules and runs.

## Known limitations carried into Phase 4

- `CUSTOMER_REPLIED` exists as a trigger but nothing raises it yet — inbound customer
  messages arrive with the portal (Phase 4) and email (Phase 5).
- The sweep's detection resolution is `SLA_SCAN_INTERVAL_SECONDS` (60s default).
- `send_email` actions render plain text only; HTML templates come with the email channel.
- Rule ordering for automation rules is by `position` but the UI does not yet offer
  drag-to-reorder for them (assignment rules do have move up/down).
- Team-scoped round-robin uses team membership but does not yet consider agent
  availability or working hours.
