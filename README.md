# Ratnam Service Station – Job Card App

Workshop management for a Honda service station: job cards with multiple services and parts, separate job and delivery status, A4 / 80mm / dot-matrix printing, purchase orders and GRN, expenses with receipt photos, employees, attendance and Sri Lankan payroll (EPF/ETF), and role-based permissions. Customers are kept updated by WhatsApp/SMS in Tamil or English.

**Stack:** React (Vite) · Node.js 20 (Express) · PostgreSQL 16 · Socket.IO (live board) · background worker for messages.

---

## What it does

### Workshop
| Area | Features |
|---|---|
| **Job cards** | Open by bike number (finds the bike and owner, or registers a new walk-in). Pick **several service types and several parts** at once, plus **custom service / part lines** with their own amount. Amounts are editable per line. Complaint, odometer, fuel, assigned mechanic, promised time, pickup or home delivery. |
| **Job status + delivery status** | Job status: Checked in → In progress → Waiting for parts → Quality check → Completed (or Cancelled). Delivery status (separate): Not ready → Ready for pickup → Out for delivery → Delivered. Completing a job makes it ready for pickup automatically; delivering needs an invoice. Full history of both. |
| **Job card list** | Key information on one line (job no, bike, customer & mobile, services, mechanic, amount, invoice status) with **job status and delivery status dropdowns right in the list**. Filters by status, delivery, mechanic and search. Becomes cards on a phone. |
| **Live board** | Kanban board that updates on every screen instantly. Overdue jobs are flagged. |
| **Printing** | Job card, estimate and invoice in three layouts: **A4**, **80mm thermal receipt** and **dot-matrix** (plain 80-column text). Job cards print without prices and with tick boxes for the mechanic. |
| **Photos** | Take photos on a phone and attach them to a job card (e.g. scratches at check-in). |
| **Customers & bikes** | Search by name, mobile or bike number. Service history. Next service date/km set automatically on delivery. |
| **Invoice & payment** | Invoice from job items (LKR, discount, tax). Cash/card/bank, part payments, balance. |
| **Messages** | Automatic WhatsApp (SMS fallback) on check-in, waiting for parts, completed/ready (with amount), delivered (with next service date) and service-due reminders – Tamil or English per customer. |
| **Customer status page** | `/status` – bike number + last 4 digits of mobile shows job and delivery progress in Tamil/English. |

### Stock & purchasing
| Area | Features |
|---|---|
| **Parts** | Catalogue with categories, unit, brand, rack, **cost price and selling price** (margin shown), reorder level, low-stock flag, stock value. |
| **Purchase orders** | Supplier, dates, terms, reference, lines with qty and cost, discount/tax. Draft → Ordered → Partly received → Received (or Closed / Cancelled). "Add all low-stock parts" builds a PO in one click. Printable A4 PO. |
| **GRN (goods received)** | Receive against a PO (only what's still outstanding) or directly from a supplier. Supplier invoice no./date, delivery note, vehicle, accepted and rejected qty, cost. Adds to stock and updates cost price. Attach a photo of the supplier invoice. Printable GRN. |
| **Suppliers** | Contact, phone, address, tax no., payment terms. |

### Money & people
| Area | Features |
|---|---|
| **Expenses** | Internal (shop running costs) and external (outside work – can be linked to a job card). Date, category, description, amount, payment method, paid to, receipt no. **Take receipt photos with the phone camera.** Totals by category, export to Excel. |
| **Employees** | Personal details, NIC, designation, join date, basic salary, EPF-liable allowances, other allowances, EPF member no., bank details, link to staff login. |
| **Attendance** | Daily sheet (Present / Half day / Absent / Leave / Holiday, in/out time, OT hours) and a monthly grid with totals. Export to Excel. Locked once month-end payroll is finalised. |
| **Salary advances** | Give an advance any time; it is deducted automatically at month-end. |
| **Payroll** | **Mid-month run** pays a % of basic as an advance. **Month-end run** works out no-pay, OT, gross, **EPF 8% (employee), EPF 12% and ETF 3% (employer)**, deducts advances, APIT and other deductions. Adjust any line before finalising. Payslips (A4, two per page), EPF/ETF contribution list for the C-Form, and a bank transfer list – all exportable. |

### Admin
| Area | Features |
|---|---|
| **Roles & permissions** | 36 separate permissions grouped by area. Ready-made roles: Admin, Service Advisor, Mechanic, Accountant, Store Keeper. Edit them or create your own – tick exactly what each role may see and do. The server enforces every permission (hiding a button is not the only protection). |
| **Lists & service types** | Admin maintains the dropdowns: service types (with default amount), part categories, expense categories, designations and units. Renaming updates old records; used items are hidden instead of deleted. |

**Payroll rules used (change them in Settings → Payroll):** EPF employee 8%, employer 12%, ETF 3%, calculated on basic + EPF-liable allowances − no-pay (OT and other allowances excluded). OT = basic ÷ 240 × 1.5 per hour. No-pay = basic ÷ 30 per day. APIT (PAYE) is entered by hand per employee. *Confirm these with your accountant before running the first live payroll.*

---

## Upgrading from the first version

Your data is kept. The upgrade runs by itself when the new API starts.

```bash
~/jobcard-app/deploy/backup.sh                      # 1. back up first
cd ~ && mv jobcard-app jobcard-app-v1               # 2. keep the old copy
unzip jobcard-app.zip                               # 3. new version
cp jobcard-app-v1/server/.env jobcard-app/server/.env
echo "UPLOAD_DIR=/home/ramana/jobcard-uploads" >> jobcard-app/server/.env && mkdir -p ~/jobcard-uploads
cd jobcard-app/server && npm ci --omit=dev && npm run migrate
cd ../client && npm ci && npm run build
cd .. && pm2 delete all && pm2 start ecosystem.config.cjs && pm2 save
sudo cp deploy/nginx-jobs.conf /etc/nginx/sites-available/jobs && sudo nginx -t && sudo systemctl reload nginx && sudo certbot --nginx -d jobs.mobike360.com
```

What changes for existing data: old "admin/advisor/mechanic" logins become the Admin / Service Advisor / Mechanic roles; "Ready" jobs become *Completed + Ready for pickup*; "Delivered" jobs become *Completed + Delivered*; old labour lines become custom service lines; each job's old service type becomes a service line.

---

## Try it on your computer

Needs Node.js 20+ and PostgreSQL.

```bash
createdb jobcards

cd server
cp .env.example .env          # set DATABASE_URL, leave providers as "console"
npm install
npm run seed                  # demo data + logins: admin/admin123, advisor/advisor123, kumar/mech123, store/store123, accounts/accounts123
npm run dev                   # API on http://localhost:3000
npm run worker                # (second terminal) prints messages instead of sending

cd ../client
npm install
npm run dev                   # open http://localhost:5173
```

Tests: `npm test` (worker) and, with the API running on a freshly seeded database, `npm run test:api` (job cards, permissions, purchasing, expenses uploads, payroll).

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

### 6. Backups (database + photos)
```bash
crontab -e
# add:
0 2 * * * /home/ramana/jobcard-app/deploy/backup.sh >> /home/ramana/backups/backup.log 2>&1
```
Also turn on weekly snapshots in hPanel → VPS. Copy a backup off the server now and then.

### Updating later
`./deploy/update.sh` – backs up, pulls the latest code from GitHub, installs, updates the database, rebuilds, restarts and checks the app is healthy. `./deploy/update.sh v2.0` goes back to a tagged version.

### Version control & automatic deploy
The project is a Git repository with tags `v1.0` and `v2.0`. **[docs/GITHUB.md](docs/GITHUB.md)** walks through pushing it to a private GitHub repo, letting the VPS pull from it, and turning on GitHub Actions: tests run on every pull request and every merge to `main` deploys to the VPS automatically.

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
  src/routes/             auth, users & roles, customers, bikes, parts, jobs, invoices, masters, purchasing, expenses, hr, payroll, attachments, public
  src/lib/status.js       job & delivery status rules
  src/lib/permissions.js  every permission + default roles
  src/lib/payroll.js      EPF/ETF, OT and no-pay calculations
  src/lib/notify.js       message templates (English + Tamil)
  src/providers/          WhatsApp Cloud API, Notify.lk, console
  src/db/migrations/      database schema
client/
  src/pages/              job cards, printing, parts, purchasing/GRN, expenses, employees, attendance, payroll, roles, lists, settings
deploy/                   nginx config, backup and update (deploy) scripts
docs/GITHUB.md            GitHub, branches, releases, auto-deploy, rollback
.github/workflows/        CI tests + automatic deploy to the VPS
ecosystem.config.cjs      PM2 (api + worker)
docker-compose.yml        optional Docker/Coolify setup
```

## Notes
- The seeded part numbers are placeholders – replace them with your real Honda parts list.
- Keep **one** API process (live updates are in memory). The worker can be scaled.
- Change every demo password, or don't run `npm run seed` on the live server – use `npm run create-admin` instead.
