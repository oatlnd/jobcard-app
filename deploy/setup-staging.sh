#!/usr/bin/env bash
# One-time setup of the TEST SITE (staging) on the same VPS as the live site.
#   git clone git@github.com:oatlnd/jobcard-app.git ~/jobcard-staging
#   cd ~/jobcard-staging && ./deploy/setup-staging.sh
# Default: the test site opens at http://YOUR-VPS-IP:8080 (no domain needed).
# Options: STAGING_PORT=8080   PROD_DIR=~/jobcard-app
#          STAGING_DOMAIN=test.jobs.example.com   (use a domain + HTTPS instead of IP:port)
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  local HERE PROD_DIR DOMAIN PORT NAME URL IP
  HERE=$(pwd)
  PROD_DIR="${PROD_DIR:-$HOME/jobcard-app}"
  DOMAIN="${STAGING_DOMAIN:-}"
  if [ -n "$DOMAIN" ]; then
    PORT=80; NAME="$DOMAIN"; URL="https://$DOMAIN"
  else
    PORT="${STAGING_PORT:-8080}"; NAME="_"
    IP=$(curl -4 -fsS --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
    URL="http://$IP:$PORT"
    if ss -ltn | awk '{print $4}' | grep -qE "[:.]$PORT\$" && [ ! -f /etc/nginx/sites-enabled/jobs-staging ]; then
      echo "!! Port $PORT is already used by something else. Try:  STAGING_PORT=8081 ./deploy/setup-staging.sh" >&2; exit 1
    fi
  fi

  [ "$(realpath "$HERE")" != "$(realpath -m "$PROD_DIR")" ] || { echo "!! Run this from the TEST-SITE folder (e.g. ~/jobcard-staging), not the live one." >&2; exit 1; }
  [ -f "$PROD_DIR/server/.env" ] || { echo "!! Live site not found at $PROD_DIR. Set PROD_DIR=... and try again." >&2; exit 1; }

  echo "Setting up the test site at $URL"
  echo "  test-site folder : $HERE"
  echo "  live-site folder : $PROD_DIR (only read, never changed)"
  echo

  # ---- 1. Database ----
  local P_DB S_DB DBUSER
  P_DB=$(grep -E '^DATABASE_URL=' "$PROD_DIR/server/.env" | cut -d= -f2- | tr -d '"')
  S_DB="${P_DB%/*}/jobcards_staging"
  DBUSER=$(echo "$P_DB" | sed -E 's#^postgres(ql)?://([^:@/]+).*#\2#')
  echo "==> 1/6 Test database (jobcards_staging) – you may be asked for your password (sudo)"
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='jobcards_staging'" | grep -q 1; then
    echo "    already exists"
  else
    sudo -u postgres psql -q -c "CREATE DATABASE jobcards_staging OWNER \"$DBUSER\";"
    echo "    created"
  fi

  # ---- 2. Settings file ----
  echo "==> 2/6 Test-site settings (server/.env)"
  if [ -f server/.env ]; then
    echo "    server/.env already exists – keeping it"
  else
    cat > server/.env << EOF
# TEST SITE settings – created by deploy/setup-staging.sh
DEPLOY_ENV=staging
NODE_ENV=production
PORT=3100
DATABASE_URL=$S_DB
JWT_SECRET=$(openssl rand -hex 32)
PUBLIC_BASE_URL=$URL
SERVE_CLIENT=false
UPLOAD_DIR=$HOME/jobcard-staging-uploads
BACKUP_DIR=$HOME/backups-staging
# Messages are never sent from the test site (forced in code), these just make it obvious:
WHATSAPP_PROVIDER=console
SMS_PROVIDER=console
EOF
    chmod 600 server/.env
    echo "    created"
  fi
  mkdir -p "$HOME/jobcard-staging-uploads" "$HOME/backups-staging"

  # ---- 3. Password for the test site ----
  echo "==> 3/6 Test-site password (keeps customers and Google out)"
  command -v htpasswd >/dev/null || sudo apt-get install -y -qq apache2-utils >/dev/null
  if [ -f /etc/nginx/jobcard-staging.htpasswd ]; then
    echo "    password file already exists – keeping it"
  else
    local U
    read -r -p "    Choose a username for the test site [test]: " U
    U=${U:-test}
    sudo htpasswd -c /etc/nginx/jobcard-staging.htpasswd "$U"
  fi

  # ---- 4. Nginx ----
  echo "==> 4/6 Web server (Nginx)"
  sed -e "s#__PORT__#$PORT#" -e "s#__NAME__#$NAME#" -e "s#__DIR__#$HERE#" deploy/nginx-staging.conf \
    | sudo tee /etc/nginx/sites-available/jobs-staging >/dev/null
  sudo ln -sf /etc/nginx/sites-available/jobs-staging /etc/nginx/sites-enabled/jobs-staging
  chmod 755 "$HOME"
  sudo nginx -t
  sudo systemctl reload nginx
  if [ "$PORT" != "80" ] && sudo ufw status 2>/dev/null | grep -q "Status: active"; then
    sudo ufw allow "$PORT/tcp" >/dev/null && echo "    opened port $PORT in the firewall"
  fi

  # ---- 5. Code + data ----
  echo "==> 5/6 Building the test site (2–4 minutes)"
  ./deploy/update.sh main
  echo
  read -r -p "    Copy the LIVE data into the test site (personal details scrambled)? [Y/n] " C
  if [[ "${C:-Y}" =~ ^[Nn] ]]; then
    ./deploy/refresh-staging-data.sh -y --demo
  else
    ./deploy/refresh-staging-data.sh -y
  fi

  # ---- 6. HTTPS (only with a domain) ----
  if [ -n "$DOMAIN" ]; then
    echo "==> 6/6 HTTPS certificate"
    if sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect; then
      echo "    HTTPS ready"
    else
      echo "    Could not get the certificate yet (DNS for $DOMAIN may not point here yet)."
      echo "    When it does, run:  sudo certbot --nginx -d $DOMAIN"
    fi
  else
    echo "==> 6/6 HTTPS skipped (IP address only)"
  fi

  echo
  echo "Done. Open  $URL"
  echo "First the test-site username/password, then your normal app login."
  echo "If the page doesn't open: in Hostinger hPanel → VPS → Firewall, allow TCP port $PORT."
}

main "$@"
exit
