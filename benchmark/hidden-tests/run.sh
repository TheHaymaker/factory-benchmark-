#!/usr/bin/env bash
# Run the hidden acceptance tests against a checkout of the clinic scheduler.
#
#   benchmark/hidden-tests/run.sh [TARGET_DIR]
#
# TARGET_DIR defaults to this repository. The target must already have its
# dependencies installed (`npm ci`). This script builds it, starts it with a fresh
# database and dev routes enabled, runs the HTTP (Vitest) and UI (Playwright) suites,
# and prints a per-ticket summary.
#
# Env: PORT (default 3100), SKIP_BUILD=1, SKIP_SERVER=1 (use an already-running
# server at BASE_URL; set DATABASE_PATH yourself for T1).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$(cd "${1:-$HERE/../..}" && pwd)"
PORT="${PORT:-3100}"
export BASE_URL="${BASE_URL:-http://localhost:$PORT}"

cd "$HERE"
[ -d node_modules ] || npm ci --no-audit --no-fund >/dev/null
rm -rf results && mkdir -p results

SERVER_PID=""
cleanup() { [ -n "$SERVER_PID" ] && kill -- -"$SERVER_PID" 2>/dev/null; }
trap cleanup EXIT

if [ -z "${SKIP_SERVER:-}" ]; then
  if [ -z "${SKIP_BUILD:-}" ]; then
    echo "Building $TARGET…"
    (cd "$TARGET" && npm run build >"$HERE/results/build.log" 2>&1) || {
      echo "Build failed; see results/build.log"; exit 2; }
  fi
  DB_DIR="$(mktemp -d)"
  export DATABASE_PATH="$DB_DIR/hidden.db"
  echo "Starting server on :$PORT (DATABASE_PATH=$DATABASE_PATH)…"
  (cd "$TARGET" && PORT="$PORT" DATABASE_PATH="$DATABASE_PATH" ENABLE_DEV_ROUTES=1 \
    setsid npm start >"$HERE/results/server.log" 2>&1) &
  SERVER_PID=$!
  for _ in $(seq 1 60); do
    curl -sf "$BASE_URL/api/health" >/dev/null && break
    sleep 0.5
  done
  curl -sf "$BASE_URL/api/health" >/dev/null || { echo "Server did not start; see results/server.log"; exit 2; }
fi

status=0
npx vitest run || status=1
npx playwright test || status=1
node summarize.mjs
exit $status
