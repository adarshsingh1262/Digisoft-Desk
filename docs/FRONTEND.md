# Frontend Route & Module Plan (Next.js App Router)

Three route groups with separate layouts and separate auth expectations.

## `(app)` — agent console (authenticated staff, desktop-first)
```
/dashboard
/tickets                      list + saved views (?view=my_open)
/tickets/[id]                 3-pane workspace: list | conversation | details
/activities                   ?type=tasks|calls|events
/customers                    contacts list
/customers/[id]
/accounts  /accounts/[id]
/knowledge-base  /knowledge-base/articles/[id]  /knowledge-base/categories
/community  /community/[topicId]
/reports  /reports/[reportId]
/automation/rules  /automation/assignment  /automation/sla  /automation/blueprints
/channels  /channels/[id]
/ai
/settings/{organization,users,roles,departments,teams,statuses,priorities,
          categories,tags,business-hours,web-forms,webhooks,notifications}
```

## `(portal)` — customer portal (authenticated contacts, fully responsive)
```
/portal  /portal/tickets  /portal/tickets/new  /portal/tickets/[id]
/portal/profile  /portal/notifications
```

## `(public)` — help center (SEO, server-rendered, ISR)
```
/help  /help/[categorySlug]  /help/articles/[slug]  /help/search
/help/submit-ticket
/login  /register  /forgot-password  /reset-password  /verify-email
```

## Conventions
- **Server components by default.** Client components only for interactivity (ticket workspace, forms, realtime).
- **Data**: TanStack Query against the NestJS API through a typed `services/` layer; no `fetch` calls inside components (Rule 6). Query keys are namespaced by resource + filters.
- **State**: Zustand for UI state only (sidebar, selected ticket, composer draft, command palette). Server state stays in TanStack Query.
- **Forms**: React Hook Form + Zod resolvers, with the Zod schemas imported from `packages/shared` so FE and BE validate identically.
- **Realtime**: one Socket.IO client in a provider; events invalidate the matching TanStack Query keys rather than mutating caches by hand.
- **Auth**: `middleware.ts` guards route groups by reading the session cookie; the access token is held in memory and refreshed transparently by an Axios interceptor on 401.
- **UI**: shadcn/ui + Tailwind, neutral enterprise palette, dense tables, no decorative gradients or animation (§45/§62). Ticket list virtualised with TanStack Virtual (§65).
- **States**: every data surface ships loading skeleton, empty state, and error state — required by the §69 definition of done.
- **A11y**: semantic landmarks, focus traps in dialogs, full keyboard paths for reply/assign/status, visible focus rings, WCAG AA contrast (§64).
