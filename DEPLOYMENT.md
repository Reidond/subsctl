# Deployment Checklist (Cloudflare Workers)

This project is a single-origin Cloudflare Worker deployment (SPA + API). Follow these steps to provision infra and ship.

## 0) One-command provisioning (optional)
Run the helper to create D1/Vectorize/Queue and apply migrations:
```
bash scripts/provision.sh
```
If Queues are unavailable on your plan, the script will warn you with the exact upgrade step.
Note: the helper uses `apps/worker/wrangler.jsonc` explicitly.

## 1) Create resources (one-time)

### D1 database
```
wrangler d1 create subsctl --config apps/worker/wrangler.jsonc
```
Update `apps/worker/wrangler.jsonc` with the returned `database_id` (already set in this repo).

### Vectorize index
```
wrangler vectorize create subsctl-index --dimensions=384 --metric=cosine --config apps/worker/wrangler.jsonc
```

### Queues
Queues require a paid Workers plan. Upgrade if needed, then:
```
wrangler queues create subsctl-embeddings --config apps/worker/wrangler.jsonc
```

### Workers AI (required)
This app uses the Workers AI binding (`AI`) for embeddings. Enable Workers AI for your account in the Cloudflare dashboard.

## 2) Run migrations
Local (dev):
```
wrangler d1 migrations apply subsctl --config apps/worker/wrangler.jsonc
```
Remote (production):
```
wrangler d1 migrations apply subsctl --remote --config apps/worker/wrangler.jsonc
```

## 3) Set required secrets
Use `secrets.example` as a template.
Optional helper:
```
bash scripts/set-secrets.sh
```

Manual (one-by-one):
```
wrangler secret put BETTER_AUTH_SECRET --config apps/worker/wrangler.jsonc
wrangler secret put GOOGLE_CLIENT_ID --config apps/worker/wrangler.jsonc
wrangler secret put GOOGLE_CLIENT_SECRET --config apps/worker/wrangler.jsonc
wrangler secret put BETTER_AUTH_URL --config apps/worker/wrangler.jsonc
wrangler secret put OPEN_EXCHANGE_RATES_APP_ID --config apps/worker/wrangler.jsonc
wrangler secret put VAPID_PUBLIC_KEY --config apps/worker/wrangler.jsonc
wrangler secret put VAPID_PRIVATE_KEY --config apps/worker/wrangler.jsonc
wrangler secret put ALLOWED_EMAILS --config apps/worker/wrangler.jsonc
```

## 3b) Web build env
Create `apps/web/.env` (or provide in CI) with:
```
VITE_VAPID_PUBLIC_KEY=...
```

## 4) Build web assets
The worker serves the SPA from `apps/web/dist`, so build the web app before deploy:
```
bun install
bun run --filter @subsctl/web build
```

## Remaining manual steps (if any)
- **Queues on free plan**: upgrade Workers plan, then run `wrangler queues create subsctl-embeddings`.
- **Secrets**: all required secrets must be set before deploy.
- **Web env**: `VITE_VAPID_PUBLIC_KEY` must be available at build time.
- **Workers AI**: ensure Workers AI is enabled for the account (required for embeddings).

## 5) Optional vars
Set `APP_VERSION` for the `/api/health` endpoint:
```jsonc
// apps/worker/wrangler.jsonc
"vars": {
  "APP_VERSION": "1.0.0"
}
```

## 6) Deploy
```
wrangler deploy --config apps/worker/wrangler.jsonc
```

## Notes
- OAuth redirect URI must include: `https://<your-domain>/api/auth/callback/google`
- VAPID keys can be generated with `npx web-push generate-vapid-keys`
