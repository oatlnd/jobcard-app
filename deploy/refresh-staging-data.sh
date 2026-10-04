#!/usr/bin/env bash
# Copy the LIVE data into the TEST SITE, with personal details scrambled.
# Run on the VPS from the test-site folder:   cd ~/jobcard-staging && ./deploy/refresh-staging-data.sh
#   -y            don't ask for confirmation
#   --demo        load demo data instead of a copy of live data
# The live database is only READ, never changed.
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  local STAGING_DIR PROD_DIR YES=0 DEMO=0
  STAGING_DIR=$(pwd)
  PROD_DIR="${PROD_DIR:-$HOME/jobcard-app}"
  for a in "$@"; do
    case "$a" in -y) YES=1 ;; --demo) DEMO=1 ;; *) echo "Unknown option $a" >&2; exit 2 ;; esac
  done

  envval() { grep -E "^$2=" "$1/server/.env" | head -1 | cut -d= -f2- | tr -d '"' || true; }

  # ---- Safety checks: only ever write to the test site ----
  [ "$(envval "$STAGING_DIR" DEPLOY_ENV)" = "staging" ] || { echo "!! This folder is not the test site (DEPLOY_ENV=staging missing in server/.env). Stopping." >&2; exit 1; }
  local S_DB P_DB S_UP P_UP
  S_DB=$(envval "$STAGING_DIR" DATABASE_URL)
  S_UP=$(envval "$STAGING_DIR" UPLOAD_DIR); S_UP=${S_UP:-$STAGING_DIR/server/uploads}
  if [ "$DEMO" = "0" ]; then
    [ -f "$PROD_DIR/server/.env" ] || { echo "!! Live site not found at $PROD_DIR (set PROD_DIR=...)." >&2; exit 1; }
    P_DB=$(envval "$PROD_DIR" DATABASE_URL)
    P_UP=$(envval "$PROD_DIR" UPLOAD_DIR); P_UP=${P_UP:-$PROD_DIR/server/uploads}
    [ "$S_DB" != "$P_DB" ] || { echo "!! Test and live sites point at the SAME database. Stopping." >&2; exit 1; }
    [ "$(realpath -m "$S_UP")" != "$(realpath -m "$P_UP")" ] || { echo "!! Test and live sites use the SAME photo folder. Stopping." >&2; exit 1; }
  fi

  if [ "$YES" = "0" ]; then
    if [ "$DEMO" = "1" ]; then echo "This REPLACES all test-site data with demo data."
    else echo "This REPLACES all test-site data with a scrambled copy of the live data."; fi
    read -r -p "Continue? [y/N] " ans
    [[ "$ans" =~ ^[Yy] ]] || { echo "Cancelled."; exit 0; }
  fi

  echo "==> Stopping test site"
  pm2 stop jobcard-staging-api jobcard-staging-worker >/dev/null 2>&1 || true

  echo "==> Emptying test database"
  PGOPTIONS="-c client_min_messages=warning" psql "$S_DB" -q -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

  if [ "$DEMO" = "1" ]; then
    echo "==> Loading demo data"
    (cd server && npm run seed)
    rm -rf "${S_UP:?}"/* 2>/dev/null || true
  else
    echo "==> Copying live database (read-only)"
    pg_dump --no-owner --no-privileges "$P_DB" | psql "$S_DB" -q -v ON_ERROR_STOP=1 >/dev/null

    echo "==> Scrambling personal details"
    psql "$S_DB" -q -v ON_ERROR_STOP=1 << 'SQL'
BEGIN;
-- Customers: fake mobile numbers 9470xxxxxxx (last digits = customer id), no emails
UPDATE customers SET mobile = '9470' || lpad(id::text, 7, '0'), email = NULL;
UPDATE notifications SET to_number = '9470' || lpad(COALESCE(customer_id, 0)::text, 7, '0');
-- Nothing left waiting to be sent, no reminder flood
UPDATE notifications SET status = 'SENT', last_error = 'Copied to test site' WHERE status IN ('QUEUED', 'SENDING');
UPDATE bikes SET reminder_sent_for = next_service_due_date WHERE next_service_due_date IS NOT NULL;
-- Staff / employees: hide phone numbers, NIC, bank accounts, addresses
UPDATE users SET mobile = NULL;
UPDATE employees SET
  mobile = NULL, address = NULL, date_of_birth = NULL,
  nic = CASE WHEN nic IS NULL THEN NULL ELSE 'XXXXXX' || right(nic, 3) END,
  bank_account = CASE WHEN bank_account IS NULL THEN NULL ELSE '******' || right(bank_account, 4) END;
COMMIT;
SQL

    echo "==> Copying photos"
    mkdir -p "$S_UP"
    rm -rf "${S_UP:?}"/* 2>/dev/null || true
    if [ -d "$P_UP" ]; then cp -a "$P_UP"/. "$S_UP"/; fi
  fi

  echo "==> Applying any newer database changes from the test-site code"
  (cd server && npm run migrate)

  echo "==> Starting test site"
  pm2 startOrReload deploy/ecosystem.staging.config.cjs --update-env >/dev/null
  pm2 save >/dev/null
  echo "Test site data refreshed."
  [ "$DEMO" = "1" ] && echo "Demo logins: admin/admin123, advisor/advisor123, kumar/mech123, store/store123, accounts/accounts123"
  [ "$DEMO" = "0" ] && echo "Logins are the same as the live site. Customer mobiles are now fake: 9470 + customer number."
  return 0
}

main "$@"
exit
