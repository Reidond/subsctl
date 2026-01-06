# AGENTS.md — Working Agreement for Agents & Contributors

This repository is designed to be friendly to automated coding agents and human contributors. The purpose of this document is to define expectations, guardrails, and the “definition of done” for changes.

## 1. Project snapshot

**Goal:** A personal subscription tracking web app deployed as a Cloudflare Worker (SPA + API) with Google login via Better Auth.

**Core stack:**

- Bun (package manager + scripts)
- Elysia (API framework)
- Better Auth (Google auth)
- React + Vite (SPA)
- TanStack Router, Query, Form
- Cloudflare Wrangler (deployment)

## 2. Hard constraints

- Do not introduce additional runtimes (no separate server). Everything must deploy to Cloudflare Workers.
- Authentication must remain Google via Better Auth.
- The app must work as a single-origin deployment (SPA assets + API on the same host) in production.
- No secrets in git. Ever.

## 3. Repo conventions (expected layout)

```
/
  src/
    worker.ts            # Worker entrypoint (Elysia compiled handler)
    server/
      app.ts             # Elysia routes/plugins
      auth.ts            # Better Auth instance + wiring
      db.ts              # D1 helpers
  web/
    src/                 # React app source (TanStack Router routes, components)
    vite.config.ts
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

If you add scripts, document them here.

## 5. Coding standards

### TypeScript

- `strict` must remain enabled.
- Avoid `any` unless there is no alternative; add a TODO with context.
- Prefer small, composable modules.

### API design

- All API routes under `/api`.
- Return consistent JSON errors.
- Enforce authentication at the boundary (middleware/macro).
- Never trust client input—validate every request body/param.

### Client data fetching

- TanStack Query is the single source of truth for server state.
- All fetches must use `credentials: 'include'`.
- Define stable query keys (see SPEC.md).

### Dates and money

- Store timestamps in UTC.
- Store money in minor units (cents) + currency code.

## 6. Security rules

- Never log:
  - cookies
  - OAuth codes/tokens
  - secrets/env vars
- Do not weaken cookie security settings in production.
- Owner-only access must be preserved (allowlist).

## 7. Definition of done (DoD)

A change is done when:

- The feature matches SPEC.md scope or SPEC.md is updated accordingly.
- Typecheck passes.
- Tests pass (or you add tests if previously missing for touched code).
- No new secrets or credentials are introduced.
- API routes are documented in SPEC.md if new/changed.
- UI behavior is verified manually at least once (dev environment).

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

## 9. Safe defaults / preferred libraries

- Validation: prefer Elysia’s validation primitives (or Zod if already present).
- UUIDs: prefer `crypto.randomUUID()` (available in Workers).
- CSV: prefer a small, dependency-light implementation.

## 10. Open questions (agents should not guess silently)

If any of these are unclear, implement with reasonable defaults and document assumptions in SPEC.md:

- Default currency
- Default timezone display rules
- Whether to track payment history in MVP
- Reminder/notification strategy (in-app only vs email)
