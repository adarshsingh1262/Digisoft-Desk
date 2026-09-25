# Frontend Route & Module Plan (Next.js App Router)

Three route groups with separate layouts and separate auth expectations.

## `(app)` — agent console (authenticated staff, desktop-first)
```
/dashboard
/tickets                      list + saved views (?view=my_open)
/tickets/[id]                 3-pane workspace: list | conversation | details
                              tabs: conversation | assistant | activities | history
/activities                   ?type=tasks|calls|events
/customers                    contacts list
/customers/[id]
/accounts  /accounts/[id]
/knowledge-base  /knowledge-base/new  /knowledge-base/[id]   (categories in a dialog)
/community  /community/[id]                                   (categories in a dialog)
/automation/rules  /automation/assignment  /automation/sla  /automation/blueprints
/chat                                                         live chat inbox
/reports                                                      Tickets, Agents, SLA, CSAT and Exports tabs
/settings/{organization,users,roles,departments,teams,ticket-fields,help-center,
          web-forms,channels,webhooks,api-keys,ai,csat}
```

## `(portal)` — the help center, one route group for every tenant (built)

The organization is addressed by its help center slug, so a single deployment serves
every customer-facing site. Anonymous and signed-in visitors share these routes; what
they may see is decided by the API, not by hiding links.

```
/help/[slug]                          home: search, categories, most read, calls to action
/help/[slug]/kb                       browse, filter by category
/help/[slug]/kb/[articleSlug]         article, "was this helpful", related articles
/help/[slug]/submit                   web form, with knowledge base deflection above it
/help/[slug]/tickets                  my requests (signed in)
/help/[slug]/tickets/[id]             conversation, reply, attachments, close
/help/[slug]/community                topics, new topic (signed in)
/help/[slug]/community/[topicSlug]    topic, replies, votes, accepted answer
/help/[slug]/login  /register  /forgot-password  /reset-password
```

## `(auth)` — agent sign-in
```
/login  /register  /forgot-password  /reset-password  /verify-email
```

## Conventions
- **Server components by default.** Client components only for interactivity (ticket workspace, forms, realtime).
- **Data**: TanStack Query against the NestJS API through a typed `services/` layer; no `fetch` calls inside components (Rule 6). Query keys are namespaced by resource + filters.
- **State**: Zustand for UI state only (sidebar, selected ticket, composer draft, command palette). Server state stays in TanStack Query.
- **Forms**: React Hook Form + Zod resolvers, with the Zod schemas imported from `backend/packages/shared` so FE and BE validate identically.
- **Realtime**: one Socket.IO client in a provider; events invalidate the matching TanStack Query keys rather than mutating caches by hand.
- **Auth**: `middleware.ts` guards route groups by reading the session cookie; the access token is held in memory and refreshed transparently by an Axios interceptor on 401.
- **UI**: shadcn/ui + Tailwind, neutral enterprise palette, dense tables, no decorative gradients or animation (§45/§62). Ticket list virtualised with TanStack Virtual (§65).
- **States**: every data surface ships loading skeleton, empty state, and error state — required by the §69 definition of done.
- **A11y**: semantic landmarks, focus traps in dialogs, full keyboard paths for reply/assign/status, visible focus rings, WCAG AA contrast (§64).
