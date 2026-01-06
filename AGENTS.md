# AGENTS.md — Working Agreement for Agents & Contributors

This repository is designed to be friendly to automated coding agents and human contributors. The purpose of this document is to define expectations, guardrails, and the "definition of done" for changes.

## 1. Project snapshot

**Goal:** A personal subscription tracking PWA deployed as a Cloudflare Worker (SPA + API) with Google login via Better Auth.

**Core stack:**

- Bun (package manager + scripts)
- Elysia (API framework)
- Better Auth (Google auth)
- React + Vite (SPA/PWA)
- TanStack Router, Query, Form
- shadcn/ui + Tailwind CSS (UI components)
- Cloudflare Wrangler (deployment)
- Cloudflare D1 (database)
- Cloudflare Vectorize (semantic search)
- Cloudflare Queues (async processing)
- Open Exchange Rates (FX conversion)

## 2. Hard constraints

- Do not introduce additional runtimes (no separate server). Everything must deploy to Cloudflare Workers.
- Authentication must remain Google via Better Auth.
- The app must work as a single-origin deployment (SPA assets + API on the same host) in production.
- No secrets in git. Ever.
- UI components must use shadcn/ui with the configured Lyra preset.

## 3. Repo conventions (expected layout)

```
/
  src/
    worker.ts            # Worker entrypoint (Elysia compiled handler)
    server/
      app.ts             # Elysia routes/plugins
      auth.ts            # Better Auth instance + wiring
      db.ts              # D1 helpers
      fx.ts              # FX rate fetching and caching
      vectorize.ts       # Vectorize integration
      push.ts            # Web Push helpers
  web/
    src/
      components/        # React components
        ui/              # shadcn/ui components (copy-pasted)
      routes/            # TanStack Router file-based routes
      lib/               # Utilities, API client
    vite.config.ts
    components.json      # shadcn/ui configuration
    tailwind.config.ts
  migrations/            # D1 SQL migrations
  wrangler.jsonc
  SPEC.md
  AGENTS.md
```

If you change the layout, you must update this file and SPEC.md.

## 4. Local development commands (agents should use)

- Install deps: `bun install`
- Run worker locally: `bunx wrangler dev`
- Run web dev server: `bun run dev` (Vite)
  - If needed, proxy `/api/*` to the worker dev port.
- Typecheck: `bun run typecheck`
- Tests: `bun run test`
- Lint/format: `bun run lint` / `bun run format`
- Add shadcn component: `bunx shadcn@latest add <component>`

If you add scripts, document them here.

## 5. Coding standards

### TypeScript

- `strict` must remain enabled.
- Avoid `any` unless there is no alternative; add a TODO with context.
- Prefer small, composable modules.

### API design

- All API routes under `/api`.
- Return consistent JSON errors: `{ "error": { "code": string, "message": string, "details"?: unknown } }`
- Enforce authentication at the boundary (middleware/macro).
- Never trust client input—validate every request body/param.
- Rate limit expensive operations (Vectorize, FX API).

### Client data fetching

- TanStack Query is the single source of truth for server state.
- All fetches must use `credentials: 'include'`.
- Define stable query keys (see SPEC.md section 10.4).
- No optimistic updates—wait for server confirmation.

### Dates and money

- Store timestamps in UTC (ISO 8601 strings).
- Display in the user's browser locale/timezone.
- Store money in minor units (cents) + currency code.
- FX conversion to primary currency for display/aggregation.

### UI components (shadcn/ui)

- Use shadcn/ui components from `web/src/components/ui/`.
- Do NOT modify shadcn components directly—extend via composition or wrapper components.
- Follow the Lyra style preset (zinc base, blue theme, Noto Sans font).
- Theme follows system preference (light/dark).
- Use skeleton loaders for loading states, toast notifications for errors.

## 6. Security rules

- Never log:
  - cookies
  - OAuth codes/tokens
  - secrets/env vars
- Do not weaken cookie security settings in production.
- Owner-only access must be preserved (allowlist via `ALLOWED_EMAILS`).
- Removed emails invalidated immediately on next request.
- 30-day session expiry.

## 7. Definition of done (DoD)

A change is done when:

- The feature matches SPEC.md scope or SPEC.md is updated accordingly.
- Typecheck passes.
- Tests pass (or you add tests if previously missing for touched code).
- No new secrets or credentials are introduced.
- API routes are documented in SPEC.md if new/changed.
- UI behavior is verified manually at least once (dev environment).
- shadcn components are used correctly (no custom CSS overrides).

## 8. How agents should work in this repo

When implementing a task:

1. Identify the affected surfaces: Worker API, DB schema, UI routes, shared types.
2. Make the smallest coherent change that satisfies the requirement.
3. Update or add:
   - migrations (if data changes)
   - types
   - tests
   - SPEC.md notes (if behavior changes)
4. Run the full quality gate (typecheck + tests).

### Working with shadcn/ui

Agents have access to shadcn MCP tools for accurate component usage:

1. **Before adding a component**: Use `shadcn_search_items_in_registries` to find available components.
2. **Get component details**: Use `shadcn_view_items_in_registries` to see props, variants, and file contents.
3. **Find usage examples**: Use `shadcn_get_item_examples_from_registries` for demo code.
4. **Install components**: Use `shadcn_get_add_command_for_items` to get the CLI command.
5. **After creating components**: Use `shadcn_get_audit_checklist` to verify implementation.

**Registry configuration**: This project uses the `@shadcn` registry. Always query with `registries: ["@shadcn"]`.

**Do NOT**:
- Hallucinate component APIs—always verify with MCP tools.
- Create custom styled components when a shadcn component exists.
- Modify files in `web/src/components/ui/` directly.

### Vectorize and Queues

- Embedding text: `name + merchant` concatenated.
- Model: `@cf/baai/bge-small-en-v1.5` (384 dimensions).
- Use Queue-based async processing for embedding generation.
- Handle Vectorize unavailability gracefully ("Search unavailable").

### FX rates

- Use Open Exchange Rates API.
- Cache in D1, refresh daily.
- If API unavailable, use last known rate and mark as stale.

## 9. Safe defaults / preferred libraries

- Validation: prefer Elysia's validation primitives (or Zod if already present).
- UUIDs: prefer `crypto.randomUUID()` (available in Workers).
- CSV: prefer a small, dependency-light implementation.
- Search: Cloudflare Vectorize (semantic), no client-side fallback.
- FX: Open Exchange Rates (cached).
- Push: Web Push with VAPID.

## 10. Subscription behavior rules

Agents must understand these business rules:

### Renewal advancement (mark-paid)
- Use **catch-up logic**: advance `next_renewal_at` by cadence periods until date is in future.
- Record payment event with FX rate at time of payment.

### Paused subscriptions
- Freeze `next_renewal_at`.
- Exclude from dashboard and projections.
- On resume, prompt user for new renewal date.

### Archived subscriptions
- Soft delete only (no hard delete).
- Restorable manually or via duplicate detection.
- Excluded from dashboard and projections.

### Category deletion
- Move orphaned subscriptions to system "Default" category.
- Default category cannot be deleted.

### Duplicate detection
- Use Vectorize semantic similarity on name field blur.
- Show inline warning with option to restore archived duplicate.

## 11. UI patterns (MVP)

### Empty states
- Illustrated empty state with call-to-action.

### Loading states
- Skeleton loaders (shimmer, per shadcn patterns).

### Error handling
- Toast notifications with retry button.

### Mobile
- Hamburger menu (slide-out drawer).
- Compact list rows.
- Vertical stack layout on dashboard.

### Forms
- Single scrollable page (no multi-step wizards except onboarding).
- Cadence presets: Weekly, Every 2 weeks, Monthly, Quarterly, Every 6 months, Yearly.

### Mark-paid flow
- Available from dashboard, list, and detail views.
- Confirmation dialog with amount override option.
- Stay in place after success, update UI contextually, show toast.

## 12. Resolved decisions (do not re-ask)

These were explicitly decided during specification review:

| Topic | Decision |
|-------|----------|
| Primary currency | User-configurable (default: user's choice during onboarding) |
| Timezone | Auto-detect on first login, stored in D1, override in settings |
| FX conversion | Store original currency, convert to primary for display |
| FX source | Open Exchange Rates, cached daily in D1 |
| Stale FX fallback | Use last known rate, show staleness indicator |
| Rate snapshots | Store at subscription creation and each payment event |
| Search | Cloudflare Vectorize semantic search |
| Search fallback | "Search unavailable" message (no client-side fallback) |
| Notifications | PWA push notifications, 3 days before renewal |
| Notification timing | User's timezone (stored in D1) |
| Snooze | In D1 (cross-device) |
| CSV export | All fields + converted amount + category name, no payment history |
| CSV import | Deferred to future |
| Hard delete | Not supported (archive only) |
| Theme | System preference (no manual toggle) |
| Accessibility | Best effort (rely on shadcn defaults) |
| E2E tests | Deferred to post-MVP |
