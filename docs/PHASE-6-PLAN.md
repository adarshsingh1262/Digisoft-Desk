# Phase 6 — AI assistant

> **Status: complete.** Verified against a real PostgreSQL, Redis, the worker process
> and a Chromium browser. The built-in provider was exercised end to end; the Anthropic
> provider was exercised against `api.anthropic.com` (see *What needs credentials*).

## What shipped

| Area | Detail |
|---|---|
| Provider interface | `AiProvider` — `summarise`, `sentiment`, `intent`, `suggestReply` — each returning a typed result and its token usage, so nothing above the provider layer knows which one answered |
| Anthropic provider | The official SDK, four pinned models (`claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`, `claude-fable-5-1`) with per-model pricing, a cached system prompt, refusal handling and tolerant JSON parsing |
| Built-in provider | A rule-based analyser: a sentiment lexicon that understands negation, intent rules mapped to the organization's own categories and priorities, an extractive summary and a grounded reply template. No credentials, no network — the default, so the feature works on a fresh install |
| Settings | One `AiSettings` row per organization: provider, model, API key (encrypted, write-only), a switch per feature, auto-analysis, a monthly token budget and free-text guidance, plus the result of the last provider check |
| Insights | Every call stored as an `AiInsight` with its content, provider, model, input/output tokens, cost in micros, latency and — on failure — the error. An insight generated since the last message is reused rather than paid for again |
| Grounding | Published knowledge base articles retrieved by keyword score (title ×3, summary ×2, body ×1); a reply that matched nothing says so instead of inventing an answer, and the UI marks it ungrounded |
| Auto-analysis | An `ai` queue: summary, sentiment and intent on ticket creation and on a customer reply, deduplicated per minute, skipped entirely when the organization has it off |
| Usage and budget | Month-to-date calls, tokens and cost, broken down by insight type; the monthly token budget is checked before a call, so it is a hard stop |
| UI | An Assistant tab in the ticket workspace (summary, sentiment, intent with one-press apply, suggested reply with "use this draft", knowledge base matches) and Settings → Assistant (provider, model, key, toggles, budget, guidance, connection state, usage, test request) |

## Changed from the plan

1. **One `AiInsight` table, not `AiRequestLog` beside it.** The log *is* the result: a
   failed call is a row with `status = FAILED` and its error, so usage, cost, budget and
   "what did it last say" read one table and a failure is debuggable without a second
   write path.
2. **A built-in provider, not an Anthropic-only feature.** A deployment with no API key
   still gets summaries, sentiment, intent and grounded drafts. It also makes the whole
   feature testable — the suites exercise the real code path with no network and no
   spend.
3. **Keyword retrieval, not pgvector.** Embeddings and `KbArticleEmbedding` are still
   later work; scoring published articles by title/summary/body is enough to ground a
   draft and adds no extension, no migration risk and no embedding spend.
4. **Nothing is applied automatically.** The plan allowed auto-categorisation; the
   implementation makes the intent a suggestion with a "Set *X*" button, and the reply a
   draft handed to the composer. An assistant that silently re-prioritises tickets is
   indistinguishable from a bug.
5. **The API key is per organization, in the database**, not an environment variable, so
   two tenants on one deployment bill separately and neither key is readable through the
   API.

## What needs credentials

The Anthropic provider needs an organization-level API key, entered in Settings →
Assistant. Without one it cannot be enabled — the API refuses the combination rather
than failing later at call time. It was verified live: with a bogus key the request
reached `api.anthropic.com` and came back `401 authentication_error`, which was stored
as a failed insight and surfaced in the connection card. Everything else in this phase
runs on the built-in provider, so the feature is covered end to end without a third
party.

## Safety rules the implementation enforces

- **Internal comments never leave the server.** The context sent to a provider is built
  from public replies alone.
- **The suggested reply is a draft.** It reaches the composer as editable text; nothing
  is ever sent on an agent's behalf.
- **The key is never returned.** The settings response carries `hasApiKey`, never the
  value, and the key is encrypted with the same AES-256-GCM helper as channel
  credentials.
- **The budget is a stop, not a report.** It is checked before the call.
- **Everything is tenant-scoped.** Settings, insights and usage go through the same
  Prisma tenant extension as every other model.

## Bugs the tests and the live run caught

| Bug | Consequence if shipped |
|---|---|
| `AiSettings` was created with find-then-create | The settings screen loads settings and usage side by side, so both first requests raced and one 500'd on the unique constraint. Caught by the browser suite; a losing create now re-reads |
| Heuristic intents did not map to the organization's categories | "Set category" would have offered a name that does not exist in that tenant; intents now carry category hints resolved against real rows |
| `@digisoft/ai` was consumed before it was built | The API resolved stale exports — the same class of failure as the Phase 5 tenant-extension bug |
| A dispatch dependency cycle (tickets → AI → tickets) | The API would not have booted with auto-analysis wired in; dispatch is now a global fire-and-forget queue producer |

## Tests

| Suite | Count |
|---|---|
| Engine unit | 24 |
| Channel adapters unit | 32 |
| Assistant unit | 19 |
| API unit | 73 |
| API integration | 151 |
| Browser | 21 |

New coverage: assistant integration (10) — disabled by default and refusing to generate,
the key never returned and explicitly clearable, Anthropic refused without a key,
summary/sentiment/intent on a real ticket, reuse versus refresh, per-feature toggles, a
reply grounded in a published article, the budget hard stop, usage totals, and settings,
insights and tickets isolated between organizations. Unit: provider selection, prompt
rendering and caps, tolerant JSON parsing, cost estimation, the sentiment lexicon with
negation, intent rules and category hints, and keyword retrieval scoring. Browser (3):
an administrator turns the assistant on and sends a real test request, an agent reads
the assistant on a ticket and moves its draft into the composer without sending, and
usage appears in settings.

## Known limitations carried into Phase 7

- Retrieval is keyword-based; there is no embedding index, so grounding weakens on large
  knowledge bases and on wording that does not overlap the article.
- No streaming: an insight is a single request/response, so a long summary is a wait
  rather than text appearing as it is written.
- The assistant does not answer customers directly — there is no portal-side "ask the
  assistant" surface, by design for now.
- Auto-analysis covers creation and customer replies only, not status changes or
  escalations, and it runs summary, sentiment and intent but never a reply.
- One prompt set for every organization; `promptGuidance` is appended, but there is no
  per-department or per-language prompt.
- No per-agent usage attribution beyond `requestedById` on the row, and no cost alerting
  before the budget is reached.
