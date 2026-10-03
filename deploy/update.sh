#!/usr/bin/env bash
# Pull the latest code, rebuild and restart.  Run from the jobcard-app folder:  ./deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
(cd server && npm ci --omit=dev && npm run migrate)
(cd client && npm ci && npm run build)
pm2 reload ecosystem.config.cjs
echo "Updated and restarted."
