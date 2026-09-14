# Phase 4 — Self-service

> **Status: complete.** Verified against a real PostgreSQL, Redis, the worker process
> and a Chromium browser. Decisions that differ from the original sketch are noted.

## What shipped

| Area | Detail |
|---|---|
| Help center | One customer-facing site per organization at `/help/<slug>`, provisioned on registration and backfilled for existing tenants; branding plus switches for publishing, public browsing, sign-up, request submission, knowledge base, community and community moderation |
| Knowledge base | Nested categories and Markdown articles; `DRAFT · PENDING_REVIEW · PUBLISHED · ARCHIVED`; visibility `PUBLIC · PORTAL_USERS · AGENTS_ONLY`; slugs derived from titles and unique per organization; keywords; view counts; helpful / not-helpful feedback with the comments visible to the author |
| Portal knowledge base | Category browse, paginated listings, article pages with related articles, and search that ranks title and keyword matches above body matches |
| Web forms | Field builder (8 field types, ordering, required flags, option lists) with each field mapped to a ticket field or stored in `customFields`; submissions become tickets through the same path as every other channel |
| Customer accounts | Portal sign-up, sign-in, password reset and profile; a visitor is a `User` of type `CUSTOMER` linked to a `Contact`, reusing the contact an agent or an earlier submission already created |
| My requests | List and detail, replies with attachments, authorised attachment download, closing a request; replying to a resolved request reopens it and fires `CUSTOMER_REPLIED` |
| Community | Categories, topics (5 types), replies, one-vote-per-person upvotes on topics and replies, accepted answers, pinning, locking and an optional moderation queue |
| Agent UI | Knowledge base list and Markdown editor with preview and reader feedback, community moderation screens, help center settings and the web form builder |
| Portal UI | Branded shell, home with search, knowledge base, request form with deflection, my requests, community — one Next.js route group serving every tenant |

## Changed from the plan

1. **`HelpCenter` is a table, not organization settings JSON.** The portal address has to
   be indexed and unique across the platform — it is how an anonymous request finds its
   tenant — and the switches are typed columns rather than untyped JSON keys.
2. **Portal visitors are `User` rows of type `CUSTOMER`.** The schema already had
   `User.type` and `User.contactId`, so sessions, refresh rotation, password rules and
   reset links are the ones the agent app uses. There is no second, weaker auth path,
   and community authorship and votes need only one relation.
3. **One ticket creation path for every channel.** `TicketsService.createTicket` was
   extracted from the agent-only `create` and now owns numbering, audit, assignment
   routing, the SLA clock and the `TICKET_CREATED` trigger; the portal and web forms
   hand over to it. A customer's request is routed and measured exactly like an agent's.
4. **Search is indexed `ILIKE`, not `tsvector` yet.** Two queries — title and keywords,
   then summary and body — merged in rank order. Honest, fast enough at this size, and
   the generated column plus GIN index slots in behind the same endpoint later.
5. **Honeypot instead of a captcha.** A filled `website` field is answered as success and
   stored nowhere, so a bot learns nothing; the standard rate limiter does the rest.
   Adding a third-party captcha would have meant a key the product does not have.
6. **`CommunityReply`, not `CommunityPost`**, and vote uniqueness is a database
   constraint (`@@unique([topicId, userId])`, `@@unique([replyId, userId])`) rather than
   application logic.

## How the portal is isolated

`PortalContextMiddleware` resolves `/portal/:slug` to its organization (Redis-cached for
30 seconds, dropped the moment settings change) and opens the tenant scope for visitors
with no token. `PortalGuard` then enforces, in one place: the site exists and is
published, a bearer token belongs to *this* organization (403 otherwise — never silently
ignored), and `allowPublicBrowsing` decides whether an anonymous visitor may read
anything. Record visibility is narrowed before permissions are consulted:
`ticketVisibilityFilter` gives a `CUSTOMER` their own requests and nothing else, whatever
their role grants, and the portal's ticket projection excludes internal comments in the
query rather than filtering them afterwards.

## Bugs the tests and the live run caught

| Bug | Consequence if shipped |
|---|---|
| Help center cached by slug in Redis | Portal integration tests resolved a re-registered organization to the id of the one the previous test deleted; settings changes also took up to 30s to appear. Fixed by dropping the cache on write, and flushing it between test runs |
| Honeypot rejected with a validation error | A bot could tell the field mattered; it now succeeds and stores nothing |
| Duplicate "description" validation messages | A form missing every field told the customer twice to describe their request |
| Articles with no category disappeared from the portal | The visibility filter required a visible category; uncategorised published articles are visible now |
| Feedback and contact creation omitted `organizationId` | Compile-time failure caught before runtime — the tenant extension injects it, but Prisma's types require it explicitly, so it is passed from `TenantContext` |
| The e2e environment inherited `DATABASE_URL` | Running the integration suites from a shell that had loaded the app's own `.env` truncated the **development** database instead of the test one. The setup now forces the database name to end in `_test` whatever it inherits, with a unit test for it |

## Upgrade path for existing tenants

`pnpm --filter @digisoft/db migrate:deploy && pnpm --filter @digisoft/db seed`. The seed
provisions a help center (address derived from the organization slug, with a suffix if
taken), one knowledge base category, one community category and a "Contact support" form
for every organization that has none. It is idempotent.

## Tests

| Suite | Count |
|---|---|
| Engine unit | 24 |
| API unit | 73 |
| API integration | 115 |
| Browser | 15 |

New coverage: knowledge base (8) — slug derivation, what the portal serves, view counts,
search ranking, feedback counters, unpublishing, cross-organization isolation; portal
(14) — provisioning, anonymous form submission, validation, honeypot, contact adoption on
sign-up, raise/reply/close, internal comments never reaching the customer, reopening on
reply, another customer's ticket, a token from another help center, private browsing,
unpublishing, duplicate accounts, sign-up disabled; community (7) — publishing,
moderation queue and author visibility, accepted answers, vote toggling, locked topics,
editing someone else's topic, and the community switch. Unit: web form value mapping (5),
slug generation (4) and the e2e environment's database-name guard (3). Browser: publish an article, find and rate it, submit a request,
sign up and find it, ask the community, answer from the moderation queue (6).

## Known limitations carried into Phase 5

- Portal search is `ILIKE`-based; no stemming, no typo tolerance, no relevance scoring
  beyond title-before-body.
- Attachments can be added to a reply, not to the first message of a new request, because
  uploads are authorised against an existing ticket.
- Article versioning and scheduled publishing are not implemented — an edit to a
  published article is live immediately.
- The community has no notification when someone replies to your topic; that arrives with
  the notification work in a later phase.
- Help center branding is a name, logo URL, accent colour and footer text — not a theme
  editor or custom CSS.
- Articles are not yet suggested from a ticket's text in the agent workspace (deflection
  exists on the customer side only).
