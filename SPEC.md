# Subscription Tracker Service — Project Specification (SPEC.md)

## 1. Summary

A personal subscription tracking service that lets you sign in with Google, record recurring subscriptions (price, cadence, next renewal), and view upcoming charges and spend summaries. It is built as a single Cloudflare Worker deployment that serves both:

- A React SPA (Vite build output as static assets)
- A JSON API implemented with Elysia

Authentication is handled by Better Auth using Google OAuth/OpenID Connect, with cookie-based sessions.

## 2. Goals

### Product goals (MVP)

- Sign in/out with Google.
- Create, view, update, and archive subscriptions.
- Dashboard view:
  - Upcoming renewals (next 7/30/90 days)
  - Monthly and yearly projected spend
- Basic analytics:
  - Spend by category
  - “Active vs archived” counts
- Export subscriptions to CSV (for backup).
- Runs as a single deployment on Cloudflare Workers.

### Engineering goals

- Modern stack:
  - Runtime/tooling: Bun
  - Backend: Elysia
  - Frontend: React + Vite
  - Client data: TanStack Query
  - Routing: TanStack Router (file-based routing)
  - Forms: TanStack Form
  - Deployment: Cloudflare Wrangler (Workers)
- Type-safe request/response contracts between client and API.
- Simple, predictable data model.
- Small operational footprint (single D1 database, no additional services required for MVP).

## 3. Non-goals (MVP)

- Automatic subscription detection from email/receipts/bank transactions.
- Multi-currency FX conversion and historic exchange rates.
- Real payment processing integration.
- Shared/family accounts.
- Multi-tenant enterprise controls.
- Mobile native app (web-only).

## 4. Target user & usage

- Primary user: you (single owner).
- Optional: allow multiple Google accounts only if explicitly whitelisted via env var.

## 5. Technology stack

### Backend

- **Elysia** (TypeScript web framework).
- **Better Auth** for Google OAuth (cookie-based sessions).
- **Cloudflare Workers** runtime; deployed via **Wrangler**.

> Note: Better Auth uses AsyncLocalStorage; on Cloudflare Workers this requires enabling Node.js compatibility flags in Wrangler (`nodejs_compat` or `nodejs_als`). See Better Auth installation docs.

### Frontend

- **React** + **Vite**
- **TanStack Router** (file-based routing via Vite plugin)
- **TanStack Query** for server state caching and mutations
- **TanStack Form** for forms and validation integration

### Data/storage

- **Cloudflare D1** (SQLite) for persistent subscription data (MVP).

## 6. High-level architecture

```
Browser (React SPA)
  |
  |  fetch("/api/...")  (cookies included)
  v
Cloudflare Worker
  - Static assets handler (Vite build output)
  - Elysia app mounted for /api/*
      - /api/auth/*  -> Better Auth handler
      - /api/*       -> Subscription Tracker API
  |
  v
Cloudflare D1 (subscriptions, categories, settings)
```

### Routing considerations (SPA + API)

Workers static assets can be configured with SPA fallback (`assets.not_found_handling = "single-page-application"`). To ensure API routes do not return `index.html`, configure `assets.run_worker_first` to run the Worker first for `/api/*` routes (and optionally other server-only endpoints).

## 7. Authentication & authorization

### 7.1 Authentication approach

- Use **Better Auth** with **Google** as the only enabled sign-in provider.
- Use cookie-based sessions (default Better Auth behavior).
- Store no passwords.

### 7.2 “Personal app” authorization (owner-only)

Because this is a personal service, enforce an allowlist:

- Env var `ALLOWED_EMAILS`: comma-separated list of Google emails permitted to use the app.
- Any authenticated session whose `user.email` is not in the allowlist receives `403 Forbidden` on API calls.
- Optionally, block during sign-in using Better Auth hooks; otherwise enforce at API boundary.

### 7.3 Better Auth deployment requirements (Workers)

- Mount Better Auth handler at `/api/auth/*`.
- Set `BETTER_AUTH_SECRET` (cookie signing/encryption).
- Set `BETTER_AUTH_URL` / base URL to the deployed origin.
- Enable `nodejs_compat` (or `nodejs_als`) compatibility flag in Wrangler for AsyncLocalStorage support.

### 7.4 Session retrieval in API

For each protected API request:

- Read request headers.
- Use Better Auth server API (e.g., `auth.api.getSession({ headers })`) to obtain session + user.
- If no session → 401.
- If session exists but email not allowed → 403.

## 8. Data model

### 8.1 Core entities

#### `subscriptions`

Stores the active subscription definitions.

| Column          | Type        | Notes                     |
| --------------- | ----------- | ------------------------- | ------ | --------- | ----- |
| id              | TEXT (uuid) | primary key               |
| owner_email     | TEXT        | Google email (owner key)  |
| name            | TEXT        | “Netflix”, “iCloud”, etc. |
| merchant        | TEXT        | optional (display)        |
| amount_cents    | INTEGER     | store as minor units      |
| currency        | TEXT        | ISO 4217 (default “USD”)  |
| cadence_unit    | TEXT        | `day                      | week   | month     | year` |
| cadence_count   | INTEGER     | e.g. 1 month, 12 months   |
| next_renewal_at | TEXT        | ISO datetime in UTC       |
| status          | TEXT        | `active                   | paused | archived` |
| category_id     | TEXT        | nullable FK               |
| notes           | TEXT        | nullable                  |
| created_at      | TEXT        | ISO datetime              |
| updated_at      | TEXT        | ISO datetime              |

#### `categories`

Optional categorization.

| Column      | Type        | Notes        |
| ----------- | ----------- | ------------ |
| id          | TEXT (uuid) | primary key  |
| owner_email | TEXT        |              |
| name        | TEXT        |              |
| color       | TEXT        | optional     |
| created_at  | TEXT        | ISO datetime |

#### `subscription_events` (optional for MVP, recommended for v1)

Tracks payments/cancellations to support history.

| Column          | Type        | Notes                    |
| --------------- | ----------- | ------------------------ | ---- | ------ | ------- |
| id              | TEXT (uuid) | primary key              |
| subscription_id | TEXT        | FK                       |
| owner_email     | TEXT        | redundant for indexing   |
| type            | TEXT        | `payment                 | skip | cancel | refund` |
| occurred_at     | TEXT        | ISO datetime             |
| amount_cents    | INTEGER     | nullable for non-payment |
| currency        | TEXT        | nullable                 |
| note            | TEXT        | nullable                 |

### 8.2 Indices

- `subscriptions(owner_email, status, next_renewal_at)`
- `categories(owner_email, name)`
- `subscription_events(subscription_id, occurred_at DESC)`

### 8.3 Time & currency rules

- Store all timestamps in UTC.
- Display in the user’s browser locale/timezone.
- Monetary fields stored as integers (cents/minor units) + currency.

## 9. API specification (HTTP/JSON)

All API endpoints are under `/api`.

### 9.1 Conventions

- JSON request/response
- Cookies for auth; client uses `credentials: 'include'`
- Standard error format:
  - `{ "error": { "code": string, "message": string, "details"?: unknown } }`

### 9.2 Endpoints

#### Health

- `GET /api/health`
  - 200 `{ ok: true, version: string }`

#### Session

- `GET /api/me`
  - 200 `{ user: { email, name, image? } }`
  - 401 if not signed in

#### Subscriptions

- `GET /api/subscriptions`

  - Query params:
    - `status`: `active|paused|archived|all` (default `active`)
    - `from`: ISO date/time (optional)
    - `to`: ISO date/time (optional)
    - `q`: text search (optional)
  - 200 `{ items: Subscription[] }`

- `POST /api/subscriptions`

  - Body: `{ name, amount_cents, currency, cadence_unit, cadence_count, next_renewal_at, category_id?, merchant?, notes? }`
  - 201 `{ item: Subscription }`

- `GET /api/subscriptions/:id`

  - 200 `{ item: Subscription }`

- `PUT /api/subscriptions/:id`

  - Body: partial update
  - 200 `{ item: Subscription }`

- `POST /api/subscriptions/:id/archive`

  - 200 `{ item: Subscription }`

- `POST /api/subscriptions/:id/pause`

  - 200 `{ item: Subscription }`

- `POST /api/subscriptions/:id/resume`
  - 200 `{ item: Subscription }`

#### Events (v1)

- `POST /api/subscriptions/:id/mark-paid`
  - Body: `{ occurred_at?: ISO, amount_cents?: number }`
  - Writes a `payment` event and advances `next_renewal_at` by cadence.
  - 200 `{ item: Subscription, event: SubscriptionEvent }`

#### Categories

- `GET /api/categories`
- `POST /api/categories`
- `PUT /api/categories/:id`
- `DELETE /api/categories/:id` (only if unused)

#### Stats

- `GET /api/stats/summary?window=30|90|365`
  - Returns totals and breakdowns
  - 200 `{ totals: {...}, by_category: [...] }`

#### Export/Import

- `GET /api/export/subscriptions.csv`
- `POST /api/import/subscriptions.csv` (optional; v1)

## 10. Frontend specification

### 10.1 Routes (TanStack Router)

- `/` → redirects to `/dashboard` if signed in; else `/sign-in`
- `/sign-in`
- `/dashboard`
- `/subscriptions`
- `/subscriptions/new`
- `/subscriptions/$id`
- `/categories`
- `/settings`

### 10.2 UI requirements (MVP)

- **Sign-in page**
  - “Continue with Google” button
  - Uses Better Auth client `signIn.social({ provider: 'google' })`
- **Dashboard**
  - Upcoming renewals list
  - Total spend projections
  - Quick “Add subscription”
- **Subscriptions list**
  - Table with status, next renewal, amount
  - Filters: status, search text
- **Subscription form**
  - TanStack Form driven
  - Validations:
    - required name
    - amount_cents >= 0
    - cadence_count >= 1
    - next_renewal_at must be valid ISO date/time
- **Settings**
  - Profile (name/email)
  - Sign out
  - (Optional) set preferred default currency and timezone display options

### 10.3 Client data layer

- TanStack Query:
  - Query keys:
    - `['me']`
    - `['subscriptions', { status, q, from, to }]`
    - `['subscription', id]`
    - `['categories']`
    - `['stats', window]`
  - Mutations invalidate relevant keys.
- Use a shared `fetchJson` wrapper:
  - `credentials: 'include'`
  - JSON serialization
  - standardized error parsing

## 11. Backend implementation notes (Elysia)

### 11.1 Elysia app structure

- `src/server/app.ts` (Elysia instance, routes, plugins)
- `src/server/auth.ts` (Better Auth config + handler)
- `src/server/db.ts` (D1 helpers)
- `src/worker.ts` (Cloudflare Worker entrypoint exporting Elysia compiled handler)

### 11.2 Auth middleware

- Elysia macro/plugin that:
  - retrieves session via Better Auth
  - injects `user` into context
  - enforces allowlist

### 11.3 Input validation

- Use Elysia’s schema validation (or a Zod-based approach) consistently on all request bodies and params.

## 12. Cloudflare deployment

### 12.1 Wrangler configuration

- Use `wrangler.jsonc` (recommended for new projects).
- Required settings:
  - `compatibility_date`
  - `compatibility_flags`: include `nodejs_compat` (or `nodejs_als`) for Better Auth
  - `assets.directory` pointing to Vite build output (e.g. `./dist`)
  - `assets.not_found_handling = "single-page-application"`
  - `assets.run_worker_first = ["/api/*"]` to ensure API is handled by Worker, not SPA fallback
  - D1 binding for app data
  - Secrets/env vars

### 12.2 Environment variables (minimum)

- `BETTER_AUTH_SECRET` (required)
- `GOOGLE_CLIENT_ID` (required)
- `GOOGLE_CLIENT_SECRET` (required)
- `BETTER_AUTH_URL` (required in production)
- `ALLOWED_EMAILS` (recommended)

### 12.3 Local development

- `bun install`
- `bunx wrangler dev` (Worker + API)
- Frontend dev options:
  1. Vite dev server with proxy `/api` → `http://localhost:8787`
  2. Full Worker static assets dev by building `vite build` and using Worker assets (slower feedback loop)

## 13. Security & privacy

- Do not store sensitive payment instruments (card numbers, bank accounts).
- Store only:
  - subscription metadata (name, price, cadence)
  - owner email (for authorization)
- Enforce `httpOnly` cookies for sessions (Better Auth default); production cookies should be `Secure`.
- Protect state-changing endpoints with same-site cookies and standard CSRF protections as needed (Better Auth handles OAuth state cookies; API should still be designed as cookie-authenticated).
- Rate limit sign-in endpoints if exposed publicly (optional v1).

## 14. Observability

- Structured logging in Worker:
  - request id
  - route
  - status code
  - latency
- Do not log session cookies or secrets.
- Optional v1: Sentry (frontend + worker) or Workers Logpush.

## 15. Testing strategy

### Unit tests

- Pure logic:
  - cadence advancement
  - spend projections
  - CSV export formatting
- Run with Vitest.

### Integration tests

- API endpoints using Miniflare/Wrangler local runtime.
- “Auth-required” endpoints test with a mocked session (or Better Auth test mode, if available).

## 16. Milestones

### M0 — Repo scaffolding

- Bun workspace, linting/formatting, basic CI.
- React+Vite app with TanStack Router plugin.
- Worker skeleton with Elysia adapter for Cloudflare.

### M1 — Auth

- Better Auth + Google OAuth working end-to-end.
- `/api/me` returns session user.

### M2 — Subscriptions CRUD

- D1 schema + migrations
- CRUD endpoints + UI
- Dashboard “upcoming renewals”

### M3 — Stats & export

- Summary stats endpoint
- CSV export
- Basic categories

### M4 — Payments/events (v1)

- Mark-paid flow + history table
- Better projections

## 17. Reference documentation links

- Better Auth docs: Installation, OAuth, Session Management
- Elysia: Cloudflare Worker adapter, Better Auth integration
- Cloudflare Workers: Static assets, SPA routing, run_worker_first routing control
- TanStack:
  - Router Vite plugin + file-based routing
  - Query + Router integration
  - Form installation

### Better Auth

- Installation: https://www.better-auth.com/docs/installation
- OAuth (Google provider config pattern): https://www.better-auth.com/docs/concepts/oauth
- Session management (stateless mode details): https://www.better-auth.com/docs/concepts/session-management
- Cookies: https://www.better-auth.com/docs/concepts/cookies

### Elysia

- Better Auth integration: https://elysiajs.com/integrations/better-auth
- Cloudflare Worker adapter: https://elysiajs.com/integrations/cloudflare-worker

### Cloudflare Workers / Wrangler

- Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- Static assets: https://developers.cloudflare.com/workers/static-assets/
- SPA routing: https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
- Worker script routing & `run_worker_first`: https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
- Advanced routing control changelog: https://developers.cloudflare.com/changelog/2025-06-17-advanced-routing/

### TanStack

- TanStack Router (Vite file-based routing): https://tanstack.com/router/v1/docs/framework/react/installation/with-vite
- Router ↔ Query integration docs: https://tanstack.com/router/v1/docs/integrations/query
- TanStack Form installation: https://tanstack.com/form/latest/docs/installation
