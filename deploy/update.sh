#!/usr/bin/env bash
# Deploy the latest code (or a specific version) on the VPS.
#   ./deploy/update.sh            -> latest code on the main branch
#   ./deploy/update.sh v2.0       -> a tagged version (use this to roll back)
# Also run automatically by GitHub Actions after every merge to main.
#
# Everything is inside main() so bash reads the whole script before running it
# (git checkout may replace this very file while it runs).
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  local REF="${1:-main}"
  local PREV
  PREV=$(git rev-parse HEAD)

  echo "==> Backing up database and photos"
  ./deploy/backup.sh

  echo "==> Getting code ($REF)"
  git fetch --tags --prune origin
  if [ "$REF" = "main" ]; then
    git checkout -q main
    git reset -q --hard origin/main      # server copy always matches GitHub exactly
  else
    git checkout -q "$REF"
  fi
  echo "    now at $(git describe --tags --always) - $(git log -1 --format=%s)"

  # Rolling back to code that is older than the database would break the app.
  local DBURL APPLIED MISSING=""
  DBURL=$(grep -E '^DATABASE_URL=' server/.env | cut -d= -f2-)
  APPLIED=$(psql "$DBURL" -Atc "SELECT name FROM schema_migrations" 2>/dev/null || true)
  for m in $APPLIED; do
    [ -f "server/src/db/migrations/$m" ] || MISSING="$MISSING $m"
  done
  if [ -n "$MISSING" ] && [ "${FORCE:-0}" != "1" ]; then
    git checkout -q "$PREV"
    echo "!! $REF is older than the database (it doesn't know about:$MISSING)." >&2
    echo "!! Restore the database backup taken before that upgrade first (docs/GITHUB.md, Part E)," >&2
    echo "!! then run this again. Nothing was changed; still on $(git describe --tags --always)." >&2
    exit 1
  fi

  echo "==> Server packages + database updates"
  (cd server && npm ci --omit=dev --no-audit --no-fund && npm run migrate)

  echo "==> Building screens"
  (cd client && npm ci --no-audit --no-fund && npm run build)

  echo "==> Restarting"
  pm2 reload ecosystem.config.cjs --update-env
  pm2 save >/dev/null

  echo "==> Health check"
  local PORT
  PORT=$(grep -E '^PORT=' server/.env | cut -d= -f2 || true)
  for _ in $(seq 1 15); do
    if curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" >/dev/null; then
      echo "Deployed $(git describe --tags --always) OK"
      return 0
    fi
    sleep 2
  done
  echo "!! The app did not start. Check: pm2 logs jobcard-api --lines 50" >&2
  exit 1
}

main "$@"
exit
