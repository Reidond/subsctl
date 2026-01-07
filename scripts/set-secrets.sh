#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

WRANGLER_CONFIG="apps/worker/wrangler.jsonc"

if ! command -v wrangler >/dev/null 2>&1; then
  echo "[error] wrangler is required" >&2
  exit 1
fi

keys=(
  BETTER_AUTH_SECRET
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  BETTER_AUTH_URL
  OPEN_EXCHANGE_RATES_APP_ID
  VAPID_PUBLIC_KEY
  VAPID_PRIVATE_KEY
  ALLOWED_EMAILS
)

for key in "${keys[@]}"; do
  val="${!key:-}"
  if [ -z "$val" ]; then
    read -r -s -p "Enter $key (leave blank to skip): " val
    echo
  fi

  if [ -n "$val" ]; then
    printf "%s" "$val" | wrangler secret put "$key" --config "$WRANGLER_CONFIG"
  else
    echo "[warn] Skipped $key"
  fi
done

echo "[note] Set VITE_VAPID_PUBLIC_KEY for the web build via apps/web/.env or CI env."
