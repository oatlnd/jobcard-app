#!/usr/bin/env bash
# Nightly database backup. Keeps the last 14 days.
# Add to crontab (crontab -e):
#   0 2 * * * /home/ramana/jobcard-app/deploy/backup.sh >> /home/ramana/backups/backup.log 2>&1
set -euo pipefail
DIR="${BACKUP_DIR:-$HOME/backups}"
mkdir -p "$DIR"
# Reads DATABASE_URL from the server .env
source <(grep -E '^DATABASE_URL=' "$(dirname "$0")/../server/.env")
FILE="$DIR/jobcards_$(date +%F_%H%M).sql.gz"
pg_dump "$DATABASE_URL" | gzip > "$FILE"
find "$DIR" -name 'jobcards_*.sql.gz' -mtime +14 -delete
echo "$(date -Is) backup ok: $FILE"
