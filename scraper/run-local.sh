#!/usr/bin/env bash
# Scrape companies that are blocked by Cloudflare on GitHub Actions runner IPs.
# Uses the same Astro server + batch_run.py approach as the scheduled workflow.
#
# Usage:
#   bash scraper/run-local.sh [--dry-run] [--rebuild]
#
# Options:
#   --dry-run   Scrape and validate but do not upload to the database.
#   --rebuild   Force a fresh pnpm build even if dist/ already exists.
#
# Requirements:
#   - Doppler CLI installed and authenticated
#   - Node + pnpm
#   - Python 3 with scraper/requirements.txt installed
#   - Playwright chromium installed: playwright install chromium

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPANIES_FILE="$SCRIPT_DIR/companies-local.yaml"
API_URL="http://localhost:4321"
DRY_RUN=""
REBUILD=""

# Doppler config to use. Must contain SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# SCRAPER_SECRET, and PLAYWRIGHT_CDP_URL.
#
# Use dev_personal (default) to scrape into the dev database.
# Override with DOPPLER_CONFIG=prd to scrape into production:
#   DOPPLER_CONFIG=prd bash scraper/run-local.sh
DOPPLER_CONFIG="${DOPPLER_CONFIG:-dev_personal}"

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN="--dry-run" ;;
        --rebuild) REBUILD=1 ;;
    esac
done

cd "$REPO_ROOT"

# ── Build ──────────────────────────────────────────────────────────────────────
if [[ -n "$REBUILD" ]] || [[ ! -f "dist/server/entry.mjs" ]]; then
    echo "Building Astro app..."
    pnpm build
else
    echo "Skipping build — dist/server/entry.mjs exists (pass --rebuild to force)"
fi

# ── Start server ───────────────────────────────────────────────────────────────
echo "Starting Astro server..."
HOST=127.0.0.1 PORT=4321 doppler run --config "$DOPPLER_CONFIG" -- node dist/server/entry.mjs \
    > /tmp/astro-local-server.log 2>&1 &
SERVER_PID=$!

cleanup() {
    echo "Stopping server (pid $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

# ── Wait for ready ─────────────────────────────────────────────────────────────
echo "Waiting for $API_URL..."
for i in $(seq 1 60); do
    if curl -s -o /dev/null "$API_URL"; then
        echo "Server ready after ${i}s"
        break
    fi
    if [[ $i -eq 60 ]]; then
        echo "Server did not become ready within 60s"
        cat /tmp/astro-local-server.log
        exit 1
    fi
    sleep 1
done

# ── Run ────────────────────────────────────────────────────────────────────────
doppler run --config "$DOPPLER_CONFIG" -- python scraper/batch_run.py \
    --companies-file "$COMPANIES_FILE" \
    --api-url "$API_URL" \
    --scrape-timeout 3600 \
    ${DRY_RUN}
