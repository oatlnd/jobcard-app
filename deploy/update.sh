#!/usr/bin/env bash
# Deploy code on the VPS. Works for both the live site and the test site (staging):
# the folder's server/.env decides which one it is (DEPLOY_ENV=staging for the test site).
#
#   ./deploy/update.sh                      -> latest code on main
#   ./deploy/update.sh v2.0                 -> a tagged version (roll back)
#   ./deploy/update.sh feature/bike-models  -> any branch on GitHub (test site)
#
# Run automatically by GitHub Actions. Everything is inside main() so bash reads the
# whole script before running it (git checkout may replace this file while it runs).
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  local REF="${1:-main}"
  local PREV DEPLOY_ENV PM2_FILE
  PREV=$(git rev-parse HEAD)
  DEPLOY_ENV=$(grep -E '^DEPLOY_ENV=' server/.env | cut -d= -f2 | tr -d '[:space:]"' || true)
  DEPLOY_ENV=${DEPLOY_ENV:-production}
  if [ "$DEPLOY_ENV" = "staging" ]; then PM2_FILE=deploy/ecosystem.staging.config.cjs; else PM2_FILE=ecosystem.config.cjs; fi
  echo "==> Deploying to: $DEPLOY_ENV"

  echo "==> Backing up database and photos"
  ./deploy/backup.sh

  echo "==> Getting code ($REF)"
  git fetch --tags --prune --force origin
  if git show-ref --verify --quiet "refs/remotes/origin/$REF"; then
    git checkout -q -B "$REF" "origin/$REF"   # branch: match GitHub exactly (also after force-pushes)
  else
    git checkout -q "$REF"                    # tag or commit
  fi
  echo "    now at $(git describe --tags --always) - $(git log -1 --format=%s)"

  # Code that is older than the database would break the app.
  local DBURL APPLIED MISSING="" RESET=0
  DBURL=$(grep -E '^DATABASE_URL=' server/.env | cut -d= -f2-)
  APPLIED=$(psql "$DBURL" -Atc "SELECT name FROM schema_migrations" 2>/dev/null || true)
  for m in $APPLIED; do
    [ -f "server/src/db/migrations/$m" ] || MISSING="$MISSING $m"
  done
  if [ -n "$MISSING" ] && [ "$DEPLOY_ENV" = "staging" ]; then
    # Test site: its data is disposable, so start it again from fresh data that matches this code.
    echo "    test database has changes this code doesn't know about:$MISSING"
    echo "    -> the test data will be reset after the code is installed"
    RESET=1
  elif [ -n "$MISSING" ] && [ "${FORCE:-0}" != "1" ]; then
    git checkout -q "$PREV"
    echo "!! $REF is older than the database (it doesn't know about:$MISSING)." >&2
    echo "!! Restore the database backup taken before that upgrade first (docs/GITHUB.md, Part E)." >&2
    echo "!! Nothing was changed; still on $(git describe --tags --always)." >&2
    exit 1
  fi

  echo "==> Server packages + database updates"
  (cd server && npm ci --omit=dev --no-audit --no-fund)
  if [ "$RESET" = "1" ]; then
    local PROD_DIR="${PROD_DIR:-$HOME/jobcard-app}"
    if [ -f "$PROD_DIR/server/.env" ]; then ./deploy/refresh-staging-data.sh -y
    else ./deploy/refresh-staging-data.sh -y --demo; fi
  else
    (cd server && npm run migrate)
  fi

  echo "==> Building screens"
  (cd client && npm ci --no-audit --no-fund && npm run build)

  echo "==> Restarting"
  pm2 startOrReload "$PM2_FILE" --update-env
  pm2 save >/dev/null

  echo "==> Health check"
  local PORT
  PORT=$(grep -E '^PORT=' server/.env | cut -d= -f2 || true)
  for _ in $(seq 1 15); do
    if curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" >/dev/null; then
      echo "Deployed $(git describe --tags --always) to $DEPLOY_ENV OK"
      return 0
    fi
    sleep 2
  done
  echo "!! The app did not start. Check: pm2 logs --lines 50" >&2
  exit 1
}

main "$@"
exit
