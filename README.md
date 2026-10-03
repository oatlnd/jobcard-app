# Ratnam Service Station – Job Card App

Workshop job card system: check bikes in, track them through the workshop live, add parts and labour, invoice, take payment, and keep customers updated by WhatsApp/SMS in Tamil or English.

**Stack:** React (Vite) · Node.js 20 (Express) · PostgreSQL 16 · Socket.IO (live board) · background worker for messages.

---

## What it does

| Area | Features |
|---|---|
| **Job cards** | Open by bike number (finds the bike and owner, or registers a new walk-in). Service type, complaint, odometer, fuel, mechanic, promised time. Blocks a second open job on the same bike. |
| **Lifecycle** | Checked in → In progress → Waiting for parts → Quality check → Ready → Delivered (or Cancelled). Only valid moves are allowed. QA can send a job back to the mechanic. Full history of who changed what and when. |
| **Live board** | Kanban board that updates on every screen instantly. Overdue jobs are flagged. Mechanics can filter to their own jobs. |
| **Customers & bikes** | Search by name, mobile or bike number. Service history per customer. Next service date/km set automatically on delivery. |
| **Parts & stock** | Catalogue by Honda categories. Stock goes down when a part is added to a job and back up if it's removed or the job is cancelled. Low-stock flag. |
| **Invoice & payment** | Invoice built from job items (LKR, optional discount and tax). Cash/card/bank payments, part payments, balance. Printable invoice and printable job card. |
| **Messages** | Automatic WhatsApp (with SMS fallback) on check-in, waiting for parts, ready for pickup (with amount), delivered (with next service date), and service-due reminders. Tamil or English per customer. Retries failed messages. |
| **Customer status page** | `/status` – customer enters bike number + last 4 digits of mobile and sees progress in Tamil/English. Link is included in the check-in message. |
| **Staff roles** | **Admin** (everything), **Advisor** (job cards, invoices, payments, parts), **Mechanic** (board, their jobs, diagnosis, adding parts used – no prices/discounts). |

---

## Try it on your computer

Needs Node.js 20+ and PostgreSQL.

```bash
createdb jobcards

cd server
cp .env.example .env          # set DATABASE_URL, leave providers as "console"
npm install
npm run seed                  # demo data + logins (admin/admin123, advisor/advisor123, kumar/mech123)
npm run dev                   # API on http://localhost:3000
npm run worker                # (second terminal) prints messages instead of sending

cd ../client
npm install
npm run dev                   # open http://localhost:5173
```

Run the tests with `cd server && npm test` (needs the seeded database).

---

## Deploy on the Hostinger VPS (KVM 2, Ubuntu 24.04)

### 1. DNS
In hPanel → Domains → **mobike360.com** → DNS, add an **A record**: name `jobs`, points to your VPS IP.

### 2. Server software (once)
```bash
ssh root@YOUR_VPS_IP
adduser ramana && usermod -aG sudo ramana
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
su - ramana

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx postgresql git certbot python3-certbot-nginx
sudo npm install -g pm2
```

### 3. Database
```bash
sudo -u postgres psql -c "CREATE USER jobapp WITH PASSWORD 'PICK-A-STRONG-PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE jobcards OWNER jobapp;"
```

### 4. App
```bash
cd ~ && git clone https://github.com/YOUR-ACCOUNT/jobcard-app.git   # or upload the zip and unzip
cd jobcard-app/server
cp .env.example .env && nano .env      # DATABASE_URL, JWT_SECRET (openssl rand -hex 32), PUBLIC_BASE_URL
npm ci --omit=dev
npm run migrate
npm run create-admin -- ramana 'YourPassword' "Ramana"

cd ../client && npm ci && npm run build
cd .. && pm2 start ecosystem.config.cjs && pm2 save && pm2 startup   # run the command pm2 prints
```

### 5. Nginx + HTTPS
```bash
sudo cp deploy/nginx-jobs.conf /etc/nginx/sites-available/jobs
sudo ln -s /etc/nginx/sites-available/jobs /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d jobs.mobike360.com
```
Open **https://jobs.mobike360.com**, sign in, then add your staff (Staff page) and parts (Parts page), and fill in Settings.

### 6. Backups
```bash
crontab -e
# add:
0 2 * * * /home/ramana/jobcard-app/deploy/backup.sh >> /home/ramana/backups/backup.log 2>&1
```
Also turn on weekly snapshots in hPanel → VPS. Copy a backup off the server now and then.

### Updating later
`./deploy/update.sh` (pulls code, installs, migrates, rebuilds, restarts).

### Docker / Coolify instead
`cp server/.env.example .env`, add `DB_PASSWORD=...`, then `docker compose up -d --build`. In Coolify, create a **Docker Compose** resource from this repo. Create the first login with
`docker compose exec api npm run create-admin -- ramana 'YourPassword' "Ramana"`.

---

## Turning on WhatsApp and SMS

Leave both as `console` until you're ready – the worker log (`pm2 logs jobcard-worker`) shows exactly what would be sent.

### WhatsApp (Meta WhatsApp Cloud API)
1. Create a Meta Business account and a WhatsApp Business app at developers.facebook.com. Add and verify the shop's phone number.
2. Create a **permanent access token** (System User) and note the **Phone number ID**.
3. In WhatsApp Manager → Message templates, create these templates (category **Utility**), in **English** and **Tamil**. The variables must be in this order:

| Template name | Variables in order |
|---|---|
| `jobcard_checkin` | {{1}} name, {{2}} bike no, {{3}} job no, {{4}} status link, {{5}} shop |
| `jobcard_waiting_parts` | {{1}} name, {{2}} bike no, {{3}} shop |
| `jobcard_ready` | {{1}} name, {{2}} bike no, {{3}} amount, {{4}} shop, {{5}} phone |
| `jobcard_delivered` | {{1}} name, {{2}} shop, {{3}} next service date |
| `jobcard_service_reminder` | {{1}} name, {{2}} bike no, {{3}} due date, {{4}} phone, {{5}} shop |

   Example (English, `jobcard_ready`): *Hi {{1}}, your motorbike {{2}} is ready for pickup. Amount due: LKR {{3}}. - {{4}}, {{5}}*
   The full English and Tamil wording used by the app is in `server/src/lib/notify.js`.
4. In `server/.env`: `WHATSAPP_PROVIDER=whatsapp`, `WHATSAPP_TOKEN=...`, `WHATSAPP_PHONE_NUMBER_ID=...`. Set `WHATSAPP_LANG_EN` to the language code you chose for English (`en` or `en_US`). Then `pm2 restart jobcard-worker`.

### SMS (Notify.lk)
1. Create an account at notify.lk, top up, and request a sender ID (e.g. `RATNAM`).
2. In `server/.env`: `SMS_PROVIDER=notifylk`, `NOTIFYLK_USER_ID`, `NOTIFYLK_API_KEY`, `NOTIFYLK_SENDER_ID`. Restart the worker.
3. Tamil SMS are sent as unicode (`type=unicode`). Unicode SMS hold fewer characters, so a Tamil message may count as 2–3 SMS. Send yourself a test first and confirm with Notify.lk that unicode is enabled on your account.

In the app, **Settings → Customer messages** chooses WhatsApp first with SMS as fallback (or the other way round), and which events send a message.

---

## Project layout

```
server/
  src/index.js            API server (Express + Socket.IO)
  src/worker.js           sends WhatsApp/SMS, queues service reminders
  src/routes/             auth, users, customers, bikes, parts, jobs, invoices, dashboard, settings, notifications, public
  src/lib/status.js       job lifecycle rules
  src/lib/notify.js       message templates (English + Tamil)
  src/providers/          WhatsApp Cloud API, Notify.lk, console
  src/db/migrations/      database schema
client/
  src/pages/              Board, NewJob, JobDetail, Customers, Parts, Invoices, Reminders, Users, Settings, PublicStatus, InvoicePrint
deploy/                   nginx config, backup and update scripts
ecosystem.config.cjs      PM2 (api + worker)
docker-compose.yml        optional Docker/Coolify setup
```

## Notes
- The seeded part numbers are placeholders – replace them with your real Honda parts list.
- Keep **one** API process (live updates are in memory). The worker can be scaled.
- Change every demo password, or don't run `npm run seed` on the live server – use `npm run create-admin` instead.
