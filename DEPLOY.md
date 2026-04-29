# Deployment Guide — Vercel + Supabase + crm.solarmaintenanceguys.com

This is the once-only setup to move SMG CRM from a local dev environment to production. After this, every `git push` to `main` deploys automatically.

---

## 0. Prerequisites

You should already have:
- A Twilio account with two business numbers + auth token (✓ done)
- A SendGrid account with a verified sender (✓ done — `titius@solarmaintenanceguys.com`)
- A domain at a registrar (✓ `solarmaintenanceguys.com`)
- The local app working against Postgres.app (✓ done)

You need to create (free):
- A **GitHub** account (any plan, free is fine)
- A **Vercel** account (free Hobby plan works for now; Pro is $20/mo and unlocks more cron + bandwidth)
- A **Supabase** project (free tier is fine to start: 500 MB DB, 2 GB egress)

---

## 1. Push the repo to GitHub

```bash
cd "/Users/titiusmclaughlin/Desktop/Solar Maintenance Guys/AI Stuff/Sales Management CRM/smg-crm"
git add .
git commit -m "Phase 1A–1E + 1C complete; ready for production"

# Create the repo on github.com/new (private!), then:
git remote add origin git@github.com:<your-handle>/smg-crm.git
git branch -M main
git push -u origin main
```

> Use a private repo. The repo doesn't contain `.env`, but commit history could leak data later.

---

## 2. Provision Supabase Postgres

1. Sign in at https://supabase.com → **New project**
2. Name: `smg-crm`. Region: pick the one closest to Texas (us-east-1 is fine). Database password: generate a strong one and **save it** — you'll paste it into Vercel.
3. Wait ~2 minutes for the DB to provision.
4. **Settings → Database → Connection string**, copy:
   - **Transaction pooler** (port 6543) → this is your `DATABASE_URL`
   - **Direct connection** (port 5432) → this is your `DIRECT_URL`

---

## 3. Run migrations against Supabase from your laptop

```bash
cd "/Users/titiusmclaughlin/Desktop/Solar Maintenance Guys/AI Stuff/Sales Management CRM/smg-crm"

# One-shot: temporarily set production URLs in your shell, run migrate, then unset.
DATABASE_URL="postgresql://postgres.xxxxx:PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1" \
DIRECT_URL="postgresql://postgres.xxxxx:PASSWORD@aws-0-region.pooler.supabase.com:5432/postgres" \
pnpm exec prisma migrate deploy

# Then seed Titius + Matthew + Peter + line items + global settings
DATABASE_URL="..." DIRECT_URL="..." pnpm db:seed
```

Verify in the Supabase dashboard → **Table Editor** that the `User`, `Company`, `LineItemMenu` etc. tables exist and the seed users appear.

---

## 4. Deploy to Vercel

1. Sign in at https://vercel.com → **Add New** → **Project** → import your `smg-crm` GitHub repo.
2. Vercel auto-detects Next.js. Don't change framework or build settings.
3. **Environment Variables** — paste each line from `.env.production.example`, filling in real values:
   - `DATABASE_URL`, `DIRECT_URL` from step 2
   - `AUTH_SECRET`: run `openssl rand -base64 32` locally, paste output
   - `AUTH_URL`, `APP_URL`, `PUBLIC_WEBHOOK_URL`: all set to `https://crm.solarmaintenanceguys.com`
   - `AUTH_TRUST_HOST`: `true`
   - All Twilio / SendGrid keys from your local `.env`
   - `CRON_SECRET`: run `openssl rand -hex 32` locally, paste output
4. Click **Deploy**. Wait ~90s.
5. You'll get a `*.vercel.app` URL (e.g. `smg-crm-abc123.vercel.app`). Visit it — you should see the login page. Don't sign in yet (we'll do it once the real domain is wired up).

---

## 5. Add the custom subdomain

### 5a. In Vercel
1. Project → **Settings → Domains** → enter `crm.solarmaintenanceguys.com` → **Add**.
2. Vercel will display either:
   - **CNAME**: target `cname.vercel-dns.com` → use this for subdomains (preferred)
   - or A records for the apex; we don't need those.
3. Note the exact target string Vercel gives you.

### 5b. At your domain registrar
1. Open whichever registrar hosts `solarmaintenanceguys.com`'s DNS (where you bought the domain). Common ones: GoDaddy, Namecheap, Cloudflare, Google Domains/Squarespace.
2. Find the **DNS records** / **DNS management** screen.
3. Add a new record:
   - **Type**: CNAME
   - **Host / Name**: `crm` (just `crm`, not the full domain — the registrar fills the suffix)
   - **Value / Target / Points to**: `cname.vercel-dns.com` (or whatever Vercel showed you)
   - **TTL**: leave default (or set to 600)
4. Save.

### 5c. Verify
- Wait 1–5 minutes (sometimes longer).
- Refresh the Vercel Domains page. The status should change from "Invalid Configuration" to a green checkmark.
- Visit `https://crm.solarmaintenanceguys.com` — should show the login page over HTTPS (Vercel auto-provisions an SSL certificate).

---

## 6. Update webhooks at Twilio + SendGrid

### 6a. Twilio (each rep's number)
For both **+12148172544 (Matthew)** and **+18172413733 (Peter)**, replace the ngrok URLs with:
- Voice: A call comes in → `https://crm.solarmaintenanceguys.com/api/twilio/voice/incoming`
- Voice: Status change → `https://crm.solarmaintenanceguys.com/api/twilio/voice/status`
- Messaging: A message comes in → `https://crm.solarmaintenanceguys.com/api/twilio/sms/incoming`
- Messaging: Status callback → `https://crm.solarmaintenanceguys.com/api/twilio/sms/status`

### 6b. SendGrid Event Webhook
Settings → Mail Settings → Event Webhook:
- HTTP POST URL → `https://crm.solarmaintenanceguys.com/api/sendgrid/events`
- Events: Delivered, Opened, Clicked, Bounced, Dropped, Unsubscribe, Spam report
- **Test your integration** → should return 200.

---

## 7. Smoke test

Sign in at https://crm.solarmaintenanceguys.com as Titius. Then:
1. Place an inbound call to +12148172544 — Matthew's cell should ring; activity row should appear after hangup.
2. From a company profile, hit Call → text → email. Check the activity timeline + audit log + the contact's inbox.
3. Visit `/campaigns`, build a 1-step campaign with 2–3 recipients, launch, then run `curl https://crm.solarmaintenanceguys.com/api/campaigns/tick -H "X-Tick-Token: $CAMPAIGN_TICK_TOKEN"` (or wait 15 min for Vercel Cron to fire).

---

## 8. Rotate keys

Now that production is live, the keys you pasted in chat earlier are no longer needed:

- **Twilio**: Console → Account → API keys & tokens → "AUTH TOKEN" → **Create secondary token** → make primary → delete the old one. Update `TWILIO_AUTH_TOKEN` in Vercel → Redeploy (Vercel does this automatically when you change an env var).
- **SendGrid**: Settings → API Keys → delete the old key → create new one (Mail Send + Event Webhook scopes) → update `SENDGRID_API_KEY` in Vercel → Redeploy.

Once the new keys are in production and a smoke test passes, the originals are dead even if they're still in chat history.

---

## 9. Stop ngrok

It's no longer needed for anything. Close the terminal tab.

---

## Ongoing operations

- **`git push origin main`** → auto-deploys to production via Vercel.
- **Schema changes** → after running `prisma migrate dev` locally, push to GitHub. Vercel build runs `prisma generate` automatically; `migrate deploy` against Supabase you still need to do from your laptop with the production URL (or set up a Vercel build step — see `vercel.json`).
- **Vercel logs** → **Project → Logs** in the dashboard. Watch for runtime errors.
- **Supabase logs** → **Project → Logs**. Useful for slow queries, connection issues.
- **Cost ceiling** → set a Vercel spending limit + Supabase spending alerts. The free tiers cover small teams; Pro is reasonable as you grow.
