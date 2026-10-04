# GitHub setup – version control and automatic deployment

This folder is already a Git repository with the full history:

| Version | Tag | What's in it |
|---|---|---|
| 1 | `v1.0` | Job cards, live board, parts, invoices, WhatsApp/SMS, customer status page |
| 2 | `v2.0` | Roles & permissions, job + delivery status, multiple services/parts, A4/80mm/dot-matrix printing, purchase orders & GRN, expenses with photos, employees, attendance, payroll with EPF/ETF |
| – | (main) | GitHub Actions: tests on every change, automatic deploy to the VPS |

How it fits together:

```
Your computer ──push──▶ GitHub ──(tests pass)──▶ GitHub Actions ──SSH──▶ VPS runs deploy/update.sh
```

Passwords never go to GitHub: `.env`, `node_modules`, built files and uploaded photos are excluded by `.gitignore`.

---

## Part A – Put the code on GitHub (10 minutes)

**A1. Install Git** – Windows: git-scm.com (default options). Mac: run `git --version` in Terminal.

**A2. Create an empty private repository**
1. github.com → **New repository** → name `jobcard-app` → **Private**.
2. Do **not** tick "Add a README" / ".gitignore" / "license" (the repo must be empty).
3. Click **Create repository** and copy its address, e.g. `https://github.com/YOUR-USERNAME/jobcard-app.git`.

**A3. Push the code and the version tags**

Unzip `jobcard-app-git.zip`, open a terminal **inside the `jobcard-app` folder** and run:

```bash
git remote add origin https://github.com/YOUR-USERNAME/jobcard-app.git
git push -u origin main --tags
```

Sign in through the browser window that opens (or use a personal access token – GitHub no longer accepts your account password here).

**A4. Check it** – on github.com you should see the code, **3 commits**, tags `v1.0` and `v2.0`, and no `.env` file. Open the **Actions** tab: the "Test and deploy" run starts by itself. The **Tests** job should go green in about 2–3 minutes. "Deploy to VPS" says *skipping deploy* until Part C is done – that's expected.

---

## Part B – Let the VPS download from GitHub (once)

Do this **after** the server is set up (README → "Deploy on the Hostinger VPS"). Run on the VPS as `ramana`.

**B1. Make a read-only key for the server**

```bash
ssh-keygen -t ed25519 -C "vps-read-github" -f ~/.ssh/github_read -N ""
cat ~/.ssh/github_read.pub
```

**B2. Add it to GitHub** – repo → **Settings → Deploy keys → Add deploy key** → title `VPS`, paste the line, leave **Allow write access unticked** → **Add key**.

**B3. Use that key for GitHub**

```bash
cat >> ~/.ssh/config << 'EOF'
Host github.com
  IdentityFile ~/.ssh/github_read
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com        # type "yes"; expect "successfully authenticated"
```

**B4. Replace the zip copy with a Git copy** (your `.env` and photos are kept)

```bash
cd ~
mv jobcard-app jobcard-app-old
git clone git@github.com:YOUR-USERNAME/jobcard-app.git
cp jobcard-app-old/server/.env jobcard-app/server/.env
cd jobcard-app && ./deploy/update.sh
```

`update.sh` backs up, pulls, installs, updates the database, builds, restarts and checks the app is healthy. Once you've checked the site works you can remove the old copy: `rm -rf ~/jobcard-app-old`.

From now on you can deploy by hand at any time with `cd ~/jobcard-app && ./deploy/update.sh`.

---

## Part C – Automatic deploy after every merge (once)

GitHub needs its own key to log in to the VPS.

**C1. On the VPS, create a login key for GitHub Actions**

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/gh_actions -N ""
cat ~/.ssh/gh_actions.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/gh_actions          # the PRIVATE key – copy everything incl. BEGIN/END lines
```

**C2. Add three secrets on GitHub** – repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `VPS_HOST` | your VPS IP address |
| `VPS_USER` | `ramana` |
| `VPS_SSH_KEY` | the private key you just copied |

(Optional: `VPS_PORT` if SSH is not on 22, `VPS_APP_DIR` if the app is not in `/home/ramana/jobcard-app`.)

After pasting, delete the private key from your screen/clipboard. On the VPS you can remove the file too: `rm ~/.ssh/gh_actions` (the public half stays in `authorized_keys`).

**C3. Test it** – GitHub → **Actions → Test and deploy → Run workflow** (on `main`). Both jobs should go green and the last line of the deploy log says `Deployed v2.0-… OK`.

**C4. (Recommended) Approve each deploy** – repo → **Settings → Environments → production → Required reviewers** → add yourself. Every deploy then waits for you to click **Approve** – handy so nothing goes live during busy workshop hours.

---

## Part D – Everyday workflow

1. **Get the latest code** on your computer: `git checkout main && git pull`
2. **Start a branch** for the change: `git checkout -b bike-models-list`
3. **Make and test the change** locally (README → "Try it on your computer").
4. **Commit and push**
   ```bash
   git add .
   git commit -m "Add bike models list under Lists & service types"
   git push -u origin bike-models-list
   ```
5. **Open a pull request** on GitHub (yellow "Compare & pull request" button). The tests run on it automatically – wait for the green tick.
6. **Merge** the pull request. GitHub runs the tests again and then deploys to the VPS (after your approval if you set up C4).
7. **Tag releases** you may want to go back to:
   ```bash
   git checkout main && git pull
   git tag -a v2.1 -m "Bike models list"
   git push origin v2.1
   ```

Database changes: never edit an old migration file. Add a new numbered file in `server/src/db/migrations/` (e.g. `003_bike_models.sql`); it runs once on every server automatically during deploy.

---

## Part E – Something went wrong after a deploy

**Go back to the last good version** (when the new version did not change the database):

```bash
cd ~/jobcard-app
./deploy/update.sh v2.0
```

**If the new version changed the database**, `update.sh` refuses to roll back and tells you which database change is in the way – old code can't run on a newer database. Restore the backup that was taken automatically just before the bad deploy, then roll back:

```bash
pm2 stop all
ls -lt ~/backups | head                    # pick the jobcards_YYYY-MM-DD_HHMM.sql.gz from just before the deploy
sudo -u postgres psql -c "DROP DATABASE jobcards;" -c "CREATE DATABASE jobcards OWNER jobapp;"
gunzip -c ~/backups/jobcards_YYYY-MM-DD_HHMM.sql.gz | psql "$(grep ^DATABASE_URL ~/jobcard-app/server/.env | cut -d= -f2-)"
./deploy/update.sh v2.0
```

Restoring a backup loses anything entered after it was taken, so only do this when the new version is really broken. Usually it's better to fix forward: correct the code, merge, and let it deploy again.

To stop automatic deploys temporarily: GitHub → **Actions → Test and deploy → ⋯ → Disable workflow**.

---

## Rules

- `.env` is never committed. If a password or key ever lands on GitHub by mistake, change that password/key immediately – deleting the commit is not enough.
- Keep the repository **private**.
- Don't edit code directly on the VPS – the next deploy overwrites it (`update.sh` makes the server match GitHub exactly).
- One branch per change, clear commit messages, tag anything you might want to roll back to.
