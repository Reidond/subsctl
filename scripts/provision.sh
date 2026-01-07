#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

log() {
  printf "\n==> %s\n" "$1"
}

warn() {
  printf "\n[warn] %s\n" "$1"
}

fail() {
  printf "\n[error] %s\n" "$1"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_cmd wrangler
require_cmd python3

WRANGLER_CONFIG="apps/worker/wrangler.jsonc"

log "Checking D1 database (subsctl)"
db_id=$(wrangler d1 list --json --config "$WRANGLER_CONFIG" | python3 - <<'PY'
import json, sys
data = json.load(sys.stdin)
for item in data:
    if item.get('name') == 'subsctl':
        print(item.get('uuid',''))
        sys.exit(0)
print('')
PY
)

if [ -z "$db_id" ]; then
  log "Creating D1 database: subsctl"
  out=$(wrangler d1 create subsctl --config "$WRANGLER_CONFIG")
  db_id=$(python3 - <<PY
import re
text = '''$out'''
match = re.search(r'database_id"\s*:\s*"([0-9a-fA-F-]{36})"', text)
if match:
    print(match.group(1))
else:
    # fallback: first UUID in output
    m2 = re.search(r'([0-9a-fA-F-]{36})', text)
    print(m2.group(1) if m2 else '')
PY
  )
fi

if [ -z "$db_id" ]; then
  fail "Unable to resolve D1 database_id for subsctl. Please run 'wrangler d1 create subsctl' manually."
fi

log "Updating wrangler.jsonc with D1 database_id"
python3 - <<PY
import json
import re
from pathlib import Path

path = Path("$WRANGLER_CONFIG")
text = path.read_text()

def update_json(parsed):
    updated = False
    for db in parsed.get("d1_databases", []):
        if db.get("binding") == "DB" and db.get("database_name") == "subsctl":
            db["database_id"] = "$db_id"
            updated = True
    if not updated:
        raise SystemExit("Failed to update database_id in wrangler.jsonc")
    path.write_text(json.dumps(parsed, indent=2) + "\n")

try:
    update_json(json.loads(text))
except Exception:
    # Fallback for JSONC: replace database_id within the DB binding object.
    db_id = "$db_id"
    pattern = (
        r'("d1_databases"\s*:\s*\[[\s\S]*?'
        r'"binding"\s*:\s*"DB"[\s\S]*?'
        r'"database_name"\s*:\s*"subsctl"[\s\S]*?'
        r'"database_id"\s*:\s*")([^"]*)(")'
    )
    def repl(match):
        return f"{match.group(1)}{db_id}{match.group(3)}"
    updated, count = re.subn(pattern, repl, text, count=1)
    if count == 0:
        raise SystemExit("Failed to update database_id in wrangler.jsonc")
    path.write_text(updated)
PY

log "Ensuring Vectorize index"
if ! out=$(wrangler vectorize create subsctl-index --dimensions=384 --metric=cosine --config "$WRANGLER_CONFIG" 2>&1); then
  if echo "$out" | grep -qi "already exists"; then
    warn "Vectorize index already exists"
  else
    fail "Vectorize create failed: $out"
  fi
fi

log "Ensuring Queue"
if ! out=$(wrangler queues create subsctl-embeddings --config "$WRANGLER_CONFIG" 2>&1); then
  if echo "$out" | grep -qi "Queues are unavailable on the free plan"; then
    warn "Queues unavailable on free plan. Upgrade Workers plan, then rerun: wrangler queues create subsctl-embeddings"
  elif echo "$out" | grep -qi "already exists"; then
    warn "Queue already exists"
  else
    fail "Queue create failed: $out"
  fi
fi

log "Applying migrations (local)"
wrangler d1 migrations apply subsctl --config "$WRANGLER_CONFIG" || warn "Local migrations failed. Check wrangler logs."

log "Applying migrations (remote)"
if ! wrangler d1 migrations apply subsctl --remote --config "$WRANGLER_CONFIG"; then
  warn "Remote migrations failed. You may need permissions or a valid account."
fi

log "Provisioning complete"
echo "- D1 database_id: $db_id"
echo "- Vectorize index: subsctl-index"
echo "- Queue: subsctl-embeddings (see warnings if unavailable)"
