# Test site (staging)

The test site is a second copy of the app on the same VPS:

| | Live site | Test site |
|---|---|---|
| Address | http://YOUR-VPS-IP | http://YOUR-VPS-IP:8080 (extra password) |
| Folder on VPS | `~/jobcard-app` | `~/jobcard-staging` |
| Database | `jobcards` | `jobcards_staging` |
| Photos | `~/jobcard-app/server/uploads` (or UPLOAD_DIR) | `~/jobcard-staging-uploads` |
| Backups | `~/backups` | `~/backups-staging` |
| PM2 names | `jobcard-api`, `jobcard-worker` | `jobcard-staging-api`, `jobcard-staging-worker` |
| Port | 3000 | 3100 |
| WhatsApp / SMS | real | **never sent** (forced in code when `DEPLOY_ENV=staging`) |

The test site shows an orange **TEST SITE** strip at the top and `[TEST]` in the browser tab.

---

## One-time setup

No domain needed. On the VPS:
```bash
git clone git@github.com:oatlnd/jobcard-app.git ~/jobcard-staging
cd ~/jobcard-staging
./deploy/setup-staging.sh
```
It asks for your sudo password, a username/password for the test site, and whether to copy the
live data (personal details scrambled). Answer **Y**. At the end it prints the address, e.g.
`http://72.61.10.25:8080`.

If that page doesn't open from your phone/PC: Hostinger hPanel → VPS → **Firewall** → allow TCP port 8080.

Optional:
- Port 8080 already used? `STAGING_PORT=8081 ./deploy/setup-staging.sh`
- Later you get a domain? `STAGING_DOMAIN=test.example.com ./deploy/setup-staging.sh` (adds HTTPS).
- GitHub: Settings → Environments → New environment → `staging` (no approvals). If your folder is not
  `/home/ramana/jobcard-staging`, add the secret `VPS_STAGING_DIR`.

---

## Everyday use: test a branch before it goes live

1. Push your feature branch as usual: `git push -u origin feature/my-change`.
2. GitHub → **Actions** → **Test and deploy** → **Run workflow**.
3. *Use workflow from*: your branch. *Target*: **staging**. Click **Run workflow**.
4. When it is green, open http://YOUR-VPS-IP:8080 and try the change.
5. Happy? Open the pull request and merge → the live site updates automatically.

Or from the VPS: `cd ~/jobcard-staging && ./deploy/update.sh feature/my-change`

> Branches must be created from `main` **after** this test-site change was merged.

## Fresh data

```bash
cd ~/jobcard-staging
./deploy/refresh-staging-data.sh          # new scrambled copy of live data
./deploy/refresh-staging-data.sh --demo   # demo data instead (admin/admin123 ...)
```
Do this whenever the test data gets messy. You don't need it when switching branches: if you
tested a branch that changed the database and then deploy `main` again, the test site resets its
data by itself (a new scrambled copy of live data).

What gets scrambled: customer mobiles become `9470` + customer number, emails removed;
staff mobiles, addresses and dates of birth removed; NIC and bank account numbers masked
(only last digits kept). Logins and passwords stay the same as live. Any message waiting
to be sent is marked as sent, so nothing piles up.

## Safety

- The live database and photos are only **read**, never changed.
- The scripts refuse to run if the folder isn't the test site, or if test and live point to the same database or photo folder.
- Production deploys still only happen from `main`.

## Remove the test site
```bash
pm2 delete jobcard-staging-api jobcard-staging-worker && pm2 save
sudo rm /etc/nginx/sites-enabled/jobs-staging && sudo systemctl reload nginx
sudo ufw delete allow 8080/tcp 2>/dev/null
sudo -u postgres dropdb jobcards_staging
rm -rf ~/jobcard-staging ~/jobcard-staging-uploads ~/backups-staging
```
