# Phase 5 — Omnichannel

> **Status: complete.** Verified against a real PostgreSQL, Redis, the worker process
> and a Chromium browser. Messaging and telephony adapters were exercised against the
> providers' real APIs and signature schemes; see *What needs credentials* below.

## What shipped

| Area | Detail |
|---|---|
| Channel framework | `Channel` rows per organization with typed providers, per-channel routing (department, priority, category), credentials encrypted at rest, a rotatable webhook URL, and a delivery log of every inbound payload |
| Email | Inbound webhooks for `generic`, `mailgun` and `postmark` with real signature verification; contact resolution, attachment storage, quoted-history trimming, auto-reply and bounce suppression; outbound replies with `Message-ID`, `In-Reply-To`, `References` and a `[#number]` subject tag |
| Threading | Stored message id → subject ticket number → the contact's open conversation from the last 24 hours (conversational channels only) |
| Live chat | Visitor widget on the help center, its own authenticated socket namespace, an agent chat inbox with accept/answer/end, ratings, and a conversation that is a ticket from the first line |
| WhatsApp / Messenger / Instagram | Meta signature verification, `hub.challenge` handshake, inbound parsing (echoes and receipts skipped), outbound through the Cloud and Graph APIs |
| Telegram | Bot API webhook with secret-token verification, inbound parsing, outbound `sendMessage` |
| Telephony | Twilio signature verification over the URL and parameters; an inbound call becomes a ticket plus a completed call activity carrying duration and recording; repeated posts for one call update the same record |
| Outbound webhooks | Per-endpoint signing keys, `t=…,v1=…` HMAC over `timestamp.body`, subscription per event, retries with backoff, full delivery log, replay and a test send |
| API keys | `X-Api-Key`, hashed at rest, shown once, each backed by its own service user and role so machine calls are authorised and audited like any other actor |
| UI | Settings → Channels (with the webhook URL shown once, test send, rotate, delivery log), Webhooks (endpoints, deliveries, replay), API keys; a live chat inbox for agents and a chat widget in the help center |

## Changed from the plan

1. **No `EmailInbox`, `ChatConversation` or `CallLog` tables.** A conversation is a
   ticket whatever brought it in; messages carry the provider's id, and a call is an
   activity. One set of conversation rules instead of four.
2. **`ChannelEvent` is the idempotency key, not an afterthought.** The delivery is stored
   before it is parsed, so a redelivery is a no-op and a parser bug leaves the payload
   behind to re-run.
3. **Outbound email goes through the deployment's mail provider**, not a per-channel
   sending API. The channel supplies the from-address, display name, reply-to and
   signature. It keeps one send path (already retried, already queued) and avoids a
   half-built second one.
4. **An API key is a service user.** Giving each key its own `User` row means ownership
   columns, the audit trail and record-level visibility need no special case for
   machines, and revoking a key deactivates that identity everywhere at once.
5. **Chat delivery travels over Redis**, not a direct gateway call, so a reply reaches
   the visitor's socket whichever API instance is holding it — and it broke a dependency
   cycle between the ticket conversation and chat.
6. **Webhook events are the audit action names.** Dispatch hangs off the audit trail, so
   there is one vocabulary and no second list of hooks to keep in step.

## What needs credentials

The adapters make real HTTP calls and verify the providers' real signature schemes; what
cannot be exercised here is a live account. Their parsing, verification and challenge
handling are unit-tested against captured payload shapes (32 tests), and the outbound
path was proven end to end by pointing the Telegram adapter at the Bot API with a bogus
token: the call went out and Telegram refused it, which is exactly what a wrong
credential should look like. Email, chat, telephony and the webhook/API-key surfaces are
covered end to end without any third party.

IMAP polling (for mailboxes with no webhook relay) is **not** implemented; every email
channel needs a provider that can POST.

## Bugs the tests and the live run caught

| Bug | Consequence if shipped |
|---|---|
| `backend/packages/db` was not rebuilt after the new models were added to the tenant extension | `Channel`, `ChatSession`, `ApiKey` and the webhook tables would have been **unscoped**: one organization could list another's channels. Caught by the cross-tenant channel test |
| API-key principals first used a synthetic id (`apikey:<id>`) | Every ownership column (`createdById`, followers, activities) would have failed its foreign key the moment a key created anything |
| Circular provider dependency (outbound → chat → ticket messages → outbound) | The API would not have booted once chat delivery was wired in |
| Channel send failures were invisible | An expired token would have failed silently in the worker; failures now land on the channel and show as an error state in the UI |
| The e2e environment had no encryption key | Channel creation failed with a validation error in tests only; the key is now part of the test environment |

## Tests

| Suite | Count |
|---|---|
| Engine unit | 24 |
| Channel adapters unit | 32 |
| API unit | 73 |
| API integration | 141 |
| Browser | 18 |

New coverage: channels (11) — credentials never returned, provider validation, signed
inbound email → ticket with contact and attachment, unsigned and wrong-secret rejection,
redelivery, auto-reply suppression, threading by message id and by subject, a messaging
conversation staying on one ticket, a telephony call, cross-tenant isolation; chat (7) —
availability, ticket creation, both directions, internal comments never reaching the
visitor, token rejection, ending with a rating, transcript survival; integrations (8) —
secret shown once, subscription filtering, all-events endpoints, ticket payload
enrichment, replay, API-key authentication and role enforcement, revocation, tenant
binding. Unit: adapter signatures, parsing, quoted text, auto-reply detection, subject
references, registry and AES-GCM credential storage. Browser: connect an email channel,
watch a signed inbound email become a ticket, and hold a live chat between a visitor and
an agent in two browser contexts (3).

## Known limitations carried into Phase 6

- No IMAP/POP polling; inbound email needs a provider that posts webhooks.
- Outbound attachments are not sent over channels — inbound attachments are stored, but
  an agent's reply goes out as text (plus HTML for email).
- WhatsApp template messages, interactive buttons and media replies are not implemented;
  the adapter sends plain text.
- Twilio click-to-call is implemented in the adapter (`placeTwilioCall`) but is not yet
  exposed as an endpoint, because there is nowhere in the agent UI to dial from.
- Chat has no typing indicator, file upload or transfer between agents.
- Outbound webhook payloads carry the audit-shaped event plus the ticket; there is no
  per-event schema yet.
