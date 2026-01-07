# Subscription Tracker Service — Project Specification (SPEC.md)

## 1. Summary

A personal subscription tracking service that lets you sign in with Google, record recurring subscriptions (price, cadence, next renewal), and view upcoming charges and spend summaries. It is built as a single Cloudflare Worker deployment that serves both:

- A React SPA (Vite build output as static assets)
- A JSON API implemented with Elysia

Authentication is handled by Better Auth using Google OAuth/OpenID Connect, with cookie-based sessions.

The app is a **Progressive Web App (PWA)** with push notification support for renewal reminders.

Deployment instructions live in `DEPLOYMENT.md`.

## 2. Goals

### Product goals (MVP)

- Sign in/out with Google.
- First-time onboarding wizard (timezone confirmation, currency selection, optional first subscription).
- Create, view, update, and archive subscriptions.
- Pause/resume subscriptions.
- Dashboard view:
  - Upcoming renewals (next 7/30/90 days, user-selectable tabs, persisted preference)
  - Monthly and yearly projected spend (converted to primary currency)
  - Month-over-month spend change indicator
- Analytics:
  - Spend by category (list with amounts and percentages)
  - "Active vs paused" counts
  - "Uncategorized" shown as pseudo-category in breakdown
- Mark subscriptions as paid (with amount override option).
- Push notifications for upcoming renewals (3 days before, with snooze).
- Export subscriptions to CSV (with status filter).
- Semantic search powered by Cloudflare Vectorize.
- Multi-currency support with FX conversion to user's primary currency.
- Runs as a single deployment on Cloudflare Workers.

### Engineering goals

- Modern stack:
  - Runtime/tooling: Bun
  - Backend: Elysia
  - Frontend: React + Vite
  - UI Components: shadcn/ui (Tailwind CSS) with Lyra style preset
  - Client data: TanStack Query
  - Routing: TanStack Router (file-based routing)
  - Forms: TanStack Form
  - Deployment: Cloudflare Wrangler (Workers + D1 + Vectorize + Queues)
- Type-safe request/response contracts between client and API.
- Simple, predictable data model.
- PWA with service worker and push notification support.

## 3. Non-goals (MVP)

- Automatic subscription detection from email/receipts/bank transactions.
- Real payment processing integration.
- Shared/family accounts.
- Multi-tenant enterprise controls.
- Mobile native app (PWA web-only).
- CSV import (deferred to future).
- E2E tests (deferred to post-MVP).

## 4. Target user & usage

- Primary user: you (single owner).
- Optional: allow multiple Google accounts only if explicitly whitelisted via env var.

## 5. Technology stack

### Backend

- **Elysia** (TypeScript web framework).
- **Better Auth** for Google OAuth (cookie-based sessions, 30-day expiry).
- **Cloudflare Workers** runtime; deployed via **Wrangler**.

> Note: Better Auth uses AsyncLocalStorage; on Cloudflare Workers this requires enabling Node.js compatibility flags in Wrangler (`nodejs_compat` or `nodejs_als`). See Better Auth installation docs.

### Frontend

- **React** + **Vite**
- **TanStack Router** (file-based routing via Vite plugin)
- **TanStack Query** for server state caching and mutations
- **TanStack Form** for forms and validation integration
- **shadcn/ui** with Tailwind CSS
  - Style: Lyra
  - Base color: Zinc
  - Theme: Blue
  - Font: Noto Sans
  - Menu accent: Bold
- **Theme**: System preference (follows OS light/dark mode)

### Data/storage

- **Cloudflare D1** (SQLite) for persistent subscription data.
- **Cloudflare Vectorize** for semantic search (embeddings).
- **Cloudflare Queues** for async embedding generation.

### External services

- **Open Exchange Rates** for FX conversion rates.

## 6. High-level architecture

```
Browser (React PWA)
  |
  |  fetch("/api/...")  (cookies included)
  v
Cloudflare Worker
  - Static assets handler (Vite build output)
  - Elysia app mounted for /api/*
      - /api/auth/*  -> Better Auth handler
      - /api/*       -> Subscription Tracker API
  |
  +---> Cloudflare D1 (subscriptions, categories, settings, push subscriptions, FX rates)
  +---> Cloudflare Vectorize (semantic search embeddings)
  +---> Cloudflare Queues (async embedding generation)
  +---> Open Exchange Rates API (FX rates, cached in D1)
  +---> Web Push (notifications via cron trigger)
```

### Routing considerations (SPA + API)

Workers static assets can be configured with SPA fallback (`assets.not_found_handling = "single-page-application"`). To ensure API routes do not return `index.html`, configure `assets.run_worker_first` to run the Worker first for `/api/*` routes (and optionally other server-only endpoints).

## 7. Authentication & authorization

### 7.1 Authentication approach

- Use **Better Auth** with **Google** as the only enabled sign-in provider.
- Use cookie-based sessions (default Better Auth behavior).
- Session expiry: 30 days.
- Store no passwords.

### 7.2 "Personal app" authorization (owner-only)

Because this is a personal service, enforce an allowlist:

- Env var `ALLOWED_EMAILS`: comma-separated list of Google emails permitted to use the app.
- Any authenticated session whose `user.email` is not in the allowlist receives `403 Forbidden` on API calls.
- If `ALLOWED_EMAILS` changes and an email is removed, existing sessions are invalidated immediately on next request.
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
- If no session -> 401.
- If session exists but email not allowed -> 403.

### 7.5 Concurrent sessions

- Multiple devices allowed.
- Settings page shows active sessions with ability to revoke.

## 8. Data model

### 8.1 Core entities

#### `users`

User settings and preferences (extends Better Auth user).

| Column            | Type        | Notes                              |
| ----------------- | ----------- | ---------------------------------- |
| id                | TEXT (uuid) | primary key (from Better Auth)     |
| email             | TEXT        | Google email                       |
| name              | TEXT        | Display name (from Google)         |
| image             | TEXT        | Profile image URL (from Google)    |
| primary_currency  | TEXT        | ISO 4217 (e.g., "UAH")             |
| timezone          | TEXT        | IANA timezone (e.g., "Europe/Kyiv")|
| push_enabled      | INTEGER     | 0 or 1                             |
| onboarding_done   | INTEGER     | 0 or 1                             |
| created_at        | TEXT        | ISO datetime                       |
| updated_at        | TEXT        | ISO datetime                       |

#### `subscriptions`

Stores the active subscription definitions.

| Column          | Type        | Notes                                       |
| --------------- | ----------- | ------------------------------------------- |
| id              | TEXT (uuid) | primary key                                 |
| owner_email     | TEXT        | Google email (owner key)                    |
| name            | TEXT        | "Netflix", "iCloud", etc.                   |
| merchant        | TEXT        | optional (display)                          |
| amount_cents    | INTEGER     | store as minor units                        |
| currency        | TEXT        | ISO 4217 (original currency)                |
| cadence_unit    | TEXT        | `day | week | month | year`                 |
| cadence_count   | INTEGER     | e.g. 1 month, 3 months, 12 months           |
| next_renewal_at | TEXT        | ISO datetime in UTC                         |
| status          | TEXT        | `active | paused | archived`                |
| category_id     | TEXT        | nullable FK (null = uncategorized)          |
| notes           | TEXT        | nullable                                    |
| created_at      | TEXT        | ISO datetime                                |
| updated_at      | TEXT        | ISO datetime                                |
| rate_at_creation| REAL        | FX rate to primary currency at creation     |

#### `categories`

Optional categorization. Includes a system "Default" category for orphaned subscriptions.

| Column      | Type        | Notes                    |
| ----------- | ----------- | ------------------------ |
| id          | TEXT (uuid) | primary key              |
| owner_email | TEXT        |                          |
| name        | TEXT        |                          |
| color       | TEXT        | optional                 |
| is_default  | INTEGER     | 0 or 1 (system default)  |
| created_at  | TEXT        | ISO datetime             |

#### `subscription_events`

Tracks payments to support history.

| Column          | Type        | Notes                              |
| --------------- | ----------- | ---------------------------------- |
| id              | TEXT (uuid) | primary key                        |
| subscription_id | TEXT        | FK                                 |
| owner_email     | TEXT        | redundant for indexing             |
| type            | TEXT        | `payment | skip`                   |
| occurred_at     | TEXT        | ISO datetime                       |
| amount_cents    | INTEGER     | actual amount paid (may differ)    |
| currency        | TEXT        | original currency                  |
| rate_at_event   | REAL        | FX rate at time of payment         |
| note            | TEXT        | nullable                           |

#### `push_subscriptions`

Web push subscription storage.

| Column      | Type        | Notes                    |
| ----------- | ----------- | ------------------------ |
| id          | TEXT (uuid) | primary key              |
| user_id     | TEXT        | FK to users              |
| endpoint    | TEXT        | Push service endpoint    |
| p256dh      | TEXT        | Public key               |
| auth        | TEXT        | Auth secret              |
| created_at  | TEXT        | ISO datetime             |

#### `notification_snoozes`

Tracks snoozed renewal notifications.

| Column          | Type        | Notes                    |
| --------------- | ----------- | ------------------------ |
| id              | TEXT (uuid) | primary key              |
| subscription_id | TEXT        | FK                       |
| user_id         | TEXT        | FK                       |
| snoozed_until   | TEXT        | ISO datetime             |
| created_at      | TEXT        | ISO datetime             |

#### `fx_rates`

Cached exchange rates from Open Exchange Rates.

| Column      | Type        | Notes                        |
| ----------- | ----------- | ---------------------------- |
| id          | TEXT (uuid) | primary key                  |
| base        | TEXT        | Base currency (USD)          |
| target      | TEXT        | Target currency              |
| rate        | REAL        | Exchange rate                |
| fetched_at  | TEXT        | ISO datetime                 |
| is_stale    | INTEGER     | 0 or 1 (API was unavailable) |

#### `sessions`

Active user sessions (for session management UI).

| Column      | Type        | Notes                    |
| ----------- | ----------- | ------------------------ |
| id          | TEXT (uuid) | primary key              |
| user_id     | TEXT        | FK                       |
| device_info | TEXT        | User agent / device name |
| created_at  | TEXT        | ISO datetime             |
| last_used   | TEXT        | ISO datetime             |

### 8.2 Indices

- `subscriptions(owner_email, status, next_renewal_at)`
- `categories(owner_email, name)`
- `subscription_events(subscription_id, occurred_at DESC)`
- `fx_rates(base, target, fetched_at DESC)`
- `push_subscriptions(user_id)`
- `notification_snoozes(subscription_id, user_id)`

### 8.3 Time & currency rules

- Store all timestamps in UTC.
- Display in the user's browser locale/timezone.
- Monetary fields stored as integers (cents/minor units) + currency.
- FX rates cached in D1, refreshed daily (smart quota management for Open Exchange Rates ~30 req/mo).
- If FX API unavailable, use last known rate and mark as stale (show indicator in UI).
- Rate snapshots stored at subscription creation and each payment event.
- Projections use current cached rate; historical views use historical rates.

## 9. API specification (HTTP/JSON)

All API endpoints are under `/api`.

### 9.1 Conventions

- JSON request/response
- Cookies for auth; client uses `credentials: 'include'`
- Standard error format:
  - `{ "error": { "code": string, "message": string, "details"?: unknown } }`
- Rate limiting on expensive operations (Vectorize search, FX API calls).

### 9.2 Endpoints

#### Health

- `GET /api/health`
  - 200 `{ ok: true, version: string }`

#### Session

- `GET /api/me`
  - 200 `{ user: { email, name, image?, primaryCurrency, timezone, onboardingDone } }`
  - 401 if not signed in

- `GET /api/sessions`
  - 200 `{ items: Session[] }` — list active sessions

- `DELETE /api/sessions/:id`
  - 200 `{ ok: true }` — revoke a session

#### Onboarding

- `POST /api/onboarding/timezone`
  - Body: `{ timezone: string }`
  - 200 `{ ok: true }`

- `POST /api/onboarding/currency`
  - Body: `{ currency: string }`
  - 200 `{ ok: true }`

- `POST /api/onboarding/complete`
  - 200 `{ ok: true }`

#### Subscriptions

- `GET /api/subscriptions`

  - Query params:
    - `status`: `active|paused|archived|all` (default `active`)
    - `from`: ISO date/time (optional)
    - `to`: ISO date/time (optional)
    - `q`: semantic search query (optional, uses Vectorize)
  - 200 `{ items: Subscription[] }`
  - Note: Search with `q` searches across all statuses.

- `POST /api/subscriptions`

  - Body: `{ name, amount_cents, currency, cadence_unit, cadence_count, next_renewal_at, category_id?, merchant?, notes? }`
  - 201 `{ item: Subscription }`
  - Triggers Vectorize embedding generation via Queue.

- `GET /api/subscriptions/:id`

  - 200 `{ item: Subscription }`

- `PUT /api/subscriptions/:id`

  - Body: partial update
  - 200 `{ item: Subscription }`
  - If name or merchant changes, re-triggers embedding generation.

- `POST /api/subscriptions/:id/archive`

  - 200 `{ item: Subscription }`

- `POST /api/subscriptions/:id/pause`

  - 200 `{ item: Subscription }`
  - Freezes `next_renewal_at` at current value.

- `POST /api/subscriptions/:id/resume`
  - Body: `{ next_renewal_at: ISO datetime }`
  - 200 `{ item: Subscription }`
  - User provides new renewal date.

- `POST /api/subscriptions/:id/restore`
  - Body: `{ next_renewal_at: ISO datetime }`
  - 200 `{ item: Subscription }`
  - Restores archived subscription to active.

#### Duplicate detection

- `GET /api/subscriptions/check-duplicate`
  - Query params: `name` (required)
  - 200 `{ duplicates: Subscription[] }` — archived subscriptions with similar names (Vectorize semantic match)
  - Used on name field blur during creation.

#### Events (Mark as Paid)

- `POST /api/subscriptions/:id/mark-paid`
  - Body: `{ occurred_at?: ISO, amount_cents?: number, note?: string }`
  - Writes a `payment` event and advances `next_renewal_at` using catch-up logic (advance until date is in future).
  - 200 `{ item: Subscription, event: SubscriptionEvent }`

- `GET /api/subscriptions/:id/events`
  - 200 `{ items: SubscriptionEvent[] }`

#### Categories

- `GET /api/categories`
  - 200 `{ items: Category[] }`

- `POST /api/categories`
  - Body: `{ name, color? }`
  - 201 `{ item: Category }`

- `PUT /api/categories/:id`
  - Body: partial update
  - 200 `{ item: Category }`

- `DELETE /api/categories/:id`
  - Moves subscriptions to default category, then deletes.
  - 200 `{ ok: true }`

#### Stats

- `GET /api/stats/summary`
  - Returns totals (converted to primary currency):
    - `totalMonthlySpend`: number
    - `totalYearlyProjection`: number
    - `activeCount`: number
    - `pausedCount`: number
    - `monthOverMonthChange`: number (percentage)
    - `byCategory`: `[{ categoryId, categoryName, amount, percentage }]`
  - 200 `{ totals: {...}, byCategory: [...] }`

#### Export

- `GET /api/export/subscriptions.csv`
  - Query params:
    - `statuses`: comma-separated list (`active,paused,archived`)
  - Returns CSV with all subscription fields + converted primary currency amount + category name.
  - Dates formatted in user's locale.

#### FX Rates

- `GET /api/fx/rates`
  - 200 `{ rates: { [currency]: number }, base: "USD", fetchedAt: ISO, isStale: boolean }`

#### Push Notifications

- `POST /api/push/subscribe`
  - Body: `{ endpoint, p256dh, auth }`
  - 201 `{ ok: true }`

- `DELETE /api/push/unsubscribe`
  - 200 `{ ok: true }`

- `POST /api/notifications/:subscriptionId/snooze`
  - Body: `{ until: ISO datetime }` (default: tomorrow)
  - 200 `{ ok: true }`

#### Settings

- `PUT /api/settings`
  - Body: `{ primaryCurrency?, timezone?, pushEnabled? }`
  - 200 `{ ok: true }`

## 10. Frontend specification

### 10.1 Routes (TanStack Router)

- `/` -> redirects to `/dashboard` if signed in and onboarding complete; else `/sign-in` or `/onboarding`
- `/sign-in`
- `/onboarding` (wizard: timezone -> currency -> add subscription)
- `/dashboard`
- `/subscriptions`
- `/subscriptions/new`
- `/subscriptions/$id`
- `/categories`
- `/settings`

### 10.2 UI requirements (MVP)

#### Sign-in page
- "Continue with Google" button
- Uses Better Auth client `signIn.social({ provider: 'google' })`

#### Onboarding wizard (first-time users)
- Step 1: Timezone confirmation ("We detected Europe/Kyiv. Is this correct?")
- Step 2: Primary currency selection (blocking)
- Step 3: Add first subscription (skippable)
- Linear flow (no back button)
- If skipped subscription, remind once on next login

#### Dashboard
- Upcoming renewals list (tabs: 7/30/90 days, user preference persisted)
- Sorted by amount descending (biggest charges first)
- Total monthly spend, yearly projection (in primary currency)
- Month-over-month change indicator
- Spend by category (simple list with amounts and percentages)
- Quick "Add subscription" button
- Mark-paid quick action available on upcoming items

#### Subscriptions list
- Compact rows (mobile-friendly)
- Status, next renewal, amount (converted to primary currency)
- Filters: status (tabs), semantic search
- Search: on name field blur, debounced single character allowed
- Mark-paid and archive quick actions

#### Subscription form
- TanStack Form driven
- Cadence presets: Weekly, Every 2 weeks, Monthly, Quarterly, Every 6 months, Yearly
- Validations:
  - required name
  - amount_cents >= 0
  - next_renewal_at must be valid ISO date/time
- Duplicate detection on name blur (Vectorize semantic similarity)
- Inline warning if archived duplicate found with restore option

#### Subscription detail
- Full subscription info
- Payment history
- Mark-paid button (dialog with amount override option)
- Archive, pause/resume actions

#### Categories page
- List categories with subscription counts
- Create, edit, delete actions
- Cannot delete default category

#### Settings
- Profile (name/email from Google, read-only)
- Primary currency selection
- Timezone override
- Push notification toggle
- Active sessions list with revoke
- Data export (CSV with status checkboxes)
- Sign out

### 10.3 UI patterns

#### Empty states
- Illustrated empty state with call-to-action ("Add your first subscription")
- Context-specific messages for filtered views

#### Loading states
- Skeleton loaders (shimmer placeholders, per shadcn patterns)

#### Error handling
- Toast notifications with retry button
- No optimistic updates (wait for server confirmation)

#### Mobile navigation
- Hamburger menu (slide-out drawer)
- Compact list rows
- Single scrollable forms
- Dashboard: vertical stack (totals -> upcoming -> categories)

### 10.4 Client data layer

- TanStack Query:
  - Query keys:
    - `['me']`
    - `['subscriptions', { status, q }]`
    - `['subscription', id]`
    - `['subscription-events', id]`
    - `['categories']`
    - `['stats']`
    - `['sessions']`
    - `['fx-rates']`
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
- `src/server/fx.ts` (FX rate fetching and caching)
- `src/server/vectorize.ts` (Vectorize integration)
- `src/server/push.ts` (Web Push helpers)
- `src/worker.ts` (Cloudflare Worker entrypoint exporting Elysia compiled handler)

### 11.2 Auth middleware

- Elysia macro/plugin that:
  - retrieves session via Better Auth
  - injects `user` into context
  - enforces allowlist
  - invalidates removed emails immediately

### 11.3 Input validation

- Use Elysia's schema validation (or a Zod-based approach) consistently on all request bodies and params.

### 11.4 Vectorize integration

- Embedding model: `@cf/baai/bge-small-en-v1.5` (384 dimensions)
- Text embedded: name + merchant concatenated
- Sync: Queue-based (Cloudflare Queues) for async embedding generation
- Fallback: If Vectorize unavailable, show "Search unavailable" message

### 11.5 Cron trigger (notifications)

- Daily cron job checks for subscriptions renewing in 3 days
- Sends web push notifications to subscribed users
- Respects user timezone for notification timing
- Skips snoozed notifications

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
  - Vectorize binding for semantic search
  - Queue binding and consumer for embeddings
  - Cron trigger for notifications
  - Secrets/env vars

### 12.2 Environment variables (minimum)

- `BETTER_AUTH_SECRET` (required)
- `GOOGLE_CLIENT_ID` (required)
- `GOOGLE_CLIENT_SECRET` (required)
- `BETTER_AUTH_URL` (required in production)
- `ALLOWED_EMAILS` (recommended)
- `OPEN_EXCHANGE_RATES_APP_ID` (required for FX)
- `VAPID_PUBLIC_KEY` (required for push)
- `VAPID_PRIVATE_KEY` (required for push)

### 12.3 Local development

- `bun install`
- `bunx wrangler dev` (Worker + API)
- Frontend dev options:
  1. Vite dev server with proxy `/api` -> `http://localhost:8787`
  2. Full Worker static assets dev by building `vite build` and using Worker assets (slower feedback loop)

## 13. Security & privacy

- Do not store sensitive payment instruments (card numbers, bank accounts).
- Store only:
  - subscription metadata (name, price, cadence)
  - owner email (for authorization)
- Enforce `httpOnly` cookies for sessions (Better Auth default); production cookies should be `Secure`.
- Protect state-changing endpoints with same-site cookies and standard CSRF protections as needed (Better Auth handles OAuth state cookies; API should still be designed as cookie-authenticated).
- Rate limiting on expensive operations (Vectorize search, FX API calls).
- Session expiry: 30 days.
- Removed emails invalidated immediately.

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
  - cadence advancement (catch-up logic)
  - spend projections
  - CSV export formatting
  - FX conversion
- Run with Vitest.

### Integration tests

- API endpoints using Miniflare/Wrangler local runtime.
- Vectorize/Queues: Use Miniflare's local emulation.
- Push notifications: Test subscription storage in D1, mock actual sending.
- FX rates: Mock API responses with fixed test rates.
- "Auth-required" endpoints test with a mocked session (or Better Auth test mode, if available).

### E2E tests

- Deferred to post-MVP.
- Will use Playwright for critical flows (login, add subscription, mark paid).

## 16. Milestones

### M0 — Repo scaffolding

- Bun workspace, linting/formatting, basic CI.
- React+Vite app with TanStack Router plugin.
- shadcn/ui setup with Lyra preset.
- Worker skeleton with Elysia adapter for Cloudflare.
- PWA manifest and service worker setup.

### M1 — Auth

- Better Auth + Google OAuth working end-to-end.
- `/api/me` returns session user.
- Session management (list, revoke).

### M2 — Onboarding & Settings

- First-time wizard (timezone, currency).
- Settings page with all options.
- FX rate fetching and caching.

### M3 — Subscriptions CRUD

- D1 schema + migrations.
- CRUD endpoints + UI.
- Cadence presets.
- Pause/resume/archive flows.

### M4 — Dashboard & Stats

- Dashboard "upcoming renewals" with tabs.
- Spend projections and analytics.
- Category management.

### M5 — Search & Duplicate Detection

- Vectorize integration.
- Queue-based embedding sync.
- Semantic search.
- Duplicate detection on create.

### M6 — Mark Paid & Events

- Mark-paid flow with catch-up logic.
- Payment history.
- Amount override support.

### M7 — Notifications

- Push subscription management.
- Cron trigger for reminders.
- Snooze functionality.

### M8 — Export & Polish

- CSV export with filters.
- Empty states, loading states, error handling.
- Mobile responsiveness.
- Bug fixes and polish.

## 17. Subscription behavior rules

### 17.1 Renewal advancement (mark-paid)

When marking a subscription as paid:
1. Record payment event with amount and FX rate at time of payment.
2. Advance `next_renewal_at` using **catch-up logic**: keep adding cadence periods until the date is in the future.
3. User may optionally override the new renewal date in the mark-paid dialog.

### 17.2 Paused subscriptions

- `next_renewal_at` freezes at last value.
- Excluded from "upcoming renewals" on dashboard.
- Excluded from spend projections.
- On resume, user is prompted for new renewal date (prefilled with today + cadence).

### 17.3 Archived subscriptions

- Soft delete (no hard delete).
- Can be restored manually or via duplicate detection during creation.
- Excluded from dashboard and projections.
- Included in CSV export when selected.

### 17.4 Category deletion

- Subscriptions moved to system "Default" category.
- Default category cannot be deleted.

## 18. Reference documentation links

- Better Auth docs: Installation, OAuth, Session Management
- Elysia: Cloudflare Worker adapter, Better Auth integration
- Cloudflare Workers: Static assets, SPA routing, run_worker_first routing control
- Cloudflare Vectorize: https://developers.cloudflare.com/vectorize/
- Cloudflare Queues: https://developers.cloudflare.com/queues/
- TanStack:
  - Router Vite plugin + file-based routing
  - Query + Router integration
  - Form installation
- shadcn/ui: https://ui.shadcn.com/
- Open Exchange Rates: https://openexchangerates.org/

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
- Router <-> Query integration docs: https://tanstack.com/router/v1/docs/integrations/query
- TanStack Form installation: https://tanstack.com/form/latest/docs/installation

### Web Push

- Web Push protocol: https://web.dev/push-notifications-overview/
- VAPID keys: https://developers.google.com/web/fundamentals/push-notifications/web-push-protocol
