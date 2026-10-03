#!/usr/bin/env bash
# Nightly database backup. Keeps the last 14 days.
# Add to crontab (crontab -e):
#   0 2 * * * /home/ramana/jobcard-app/deploy/backup.sh >> /home/ramana/backups/backup.log 2>&1
set -euo pipefail
DIR="${BACKUP_DIR:-$HOME/backups}"
mkdir -p "$DIR"
# Reads DATABASE_URL from the server .env
source <(grep -E '^(DATABASE_URL|UPLOAD_DIR)=' "$(dirname "$0")/../server/.env")
STAMP=$(date +%F_%H%M)
FILE="$DIR/jobcards_$STAMP.sql.gz"
pg_dump "$DATABASE_URL" | gzip > "$FILE"
# Photos / receipts
UPLOADS="${UPLOAD_DIR:-$(dirname "$0")/../server/uploads}"
if [ -d "$UPLOADS" ]; then tar -czf "$DIR/uploads_$STAMP.tar.gz" -C "$UPLOADS" .; fi
find "$DIR" -name 'jobcards_*.sql.gz' -mtime +14 -delete
find "$DIR" -name 'uploads_*.tar.gz' -mtime +14 -delete
echo "$(date -Is) backup ok: $FILE"
