# Phase 1C — Twilio + SendGrid + Campaigns Setup

This guide walks you through wiring the communications phase end-to-end. Before starting, make sure your dev server is running (`pnpm dev` on port 3001) and you've followed the main `SETUP.md`.

---

## 1. Start the ngrok tunnel

Twilio and SendGrid need a public URL to hit for webhooks. The easiest local-dev solution is **ngrok**:

```bash
# one-time install (Mac)
brew install ngrok/ngrok/ngrok

# one-time auth (grab your token at https://dashboard.ngrok.com/get-started/your-authtoken)
ngrok config add-authtoken YOUR_NGROK_TOKEN

# start tunnel
ngrok http 3001
```

Copy the HTTPS forwarding URL (e.g. `https://3f1b-203-0-113-0.ngrok-free.app`) and put it in `.env`:

```
PUBLIC_WEBHOOK_URL="https://3f1b-203-0-113-0.ngrok-free.app"
```

**Restart the dev server** after changing `.env`.

> The ngrok URL changes every time you restart ngrok on the free plan. Either keep the tunnel running, upgrade to a reserved domain, or deploy to Vercel once you're ready.

---

## 2. Twilio console — configure each rep's number

For **each** Twilio phone number you've assigned to a rep:

1. Open the Twilio Console → **Phone Numbers** → **Active numbers** → click the number.
2. Scroll to **Voice Configuration**.
   - **A call comes in**: `Webhook`
     - URL: `https://<your-ngrok>/api/twilio/voice/incoming`
     - HTTP: `POST`
   - **Call status changes**: `Webhook`
     - URL: `https://<your-ngrok>/api/twilio/voice/status`
     - HTTP: `POST`
3. Scroll to **Messaging Configuration**.
   - **A message comes in**: `Webhook`
     - URL: `https://<your-ngrok>/api/twilio/sms/incoming`
     - HTTP: `POST`
   - **Status callback URL**: `https://<your-ngrok>/api/twilio/sms/status`
4. **Save**.

Repeat for each rep's number.

### Two-party consent states (optional)

If you expand to California, Florida, Illinois, Maryland, etc., open the CRM → **Settings** → toggle **Two-party consent state**. The forwarding TwiML will announce "This call may be recorded for quality and training purposes." before connecting.

---

## 3. SendGrid console — verify sender + add event webhook

1. Verify the single-sender address or domain that matches `SENDGRID_FROM_EMAIL` in `.env`.
2. Go to **Settings** → **Mail Settings** → **Event Webhook**.
   - **HTTP POST URL**: `https://<your-ngrok>/api/sendgrid/events`
   - Enable events: **Delivered, Opened, Clicked, Bounced, Dropped, Unsubscribe, Spam Report**.
   - Click **Test your integration** to confirm it reaches your server (look at ngrok's request log).
3. Optional: enable **Signed Event Webhook** and paste the verification key into `.env` as `SENDGRID_WEBHOOK_VERIFY_KEY` (the current webhook handler accepts any payload; add signature verification in a future tightening pass).

---

## 4. `.env` reference

```env
# Twilio
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="..."

# SendGrid
SENDGRID_API_KEY="SG..."
SENDGRID_FROM_EMAIL="titius@solarmaintenanceguys.com"
SENDGRID_FROM_NAME="The Solar Maintenance Guys"     # optional

# Webhooks
PUBLIC_WEBHOOK_URL="https://<ngrok>.ngrok-free.app"

# Campaign drip runner — optional shared secret for the /api/campaigns/tick endpoint
# when called from Vercel Cron or an external scheduler.
CAMPAIGN_TICK_TOKEN=""
```

Per-rep:
- **Twilio business number** → stored on the User row as `twilioPhoneNumber` (E.164, e.g. `+12148172544`)
- **Personal cell for forwarding** → stored as `phone` on the same User row

Owner/admin can set both by editing the user in the UI once we surface that editor — for now they're set via Prisma/psql. Example:

```sql
UPDATE "User" SET "twilioPhoneNumber" = '+12148172544', phone = '+19726897120'
 WHERE email = 'matthew@somaguys.com';
```

---

## 5. Smoke tests

### 5a. Inbound call
1. Dial Matthew's Twilio business number from any phone.
2. ngrok's request log should show `POST /api/twilio/voice/incoming`.
3. The call should forward to Matthew's personal cell (+19726897120) and ring.
4. After hangup, open **/companies** and find the calling company — a new `CALL · INBOUND` activity should appear with the duration. Once the recording finalizes (usually a few seconds after hangup), the activity will gain a playable MP3 URL.

### 5b. Outbound call
1. Open any company profile (sign in as Matthew).
2. Click **Call**. Twilio calls Matthew's cell first.
3. When he picks up, Twilio bridges to the contact's phone number.
4. After the call, status + duration + recording land on the same activity row.

### 5c. Inbound SMS
1. Text Peter's business number from any phone: `hi there`
2. You should see a new `TEXT · INBOUND` activity on the sender company's profile.
3. Now text `STOP` — the contact's `doNotText` flag flips to `true` (check the contact card + `/audit-log`).

### 5d. Outbound SMS
1. From a company profile, click **Text** → type a message → send.
2. ngrok shows `POST /api/twilio/sms/status` as Twilio updates delivery status.
3. The activity's `countsAsActivity` flips to true once Twilio reports `delivered`.

### 5e. Individual email
1. On a company profile with an email contact, click **Email** → fill subject + body (supports `{{company_name}}` / `{{contact_first_name}}` / `{{rep_name}}` merge fields).
2. SendGrid should deliver the email. When the recipient opens or clicks, the activity's status updates via `/api/sendgrid/events`.

### 5f. Unsubscribe
1. The email footer includes a "Unsubscribe" link that points to `/unsubscribe?token=...`.
2. Click it — the contact's `doNotEmail` flag flips immediately. Subsequent campaign sends to that contact are skipped.

### 5g. Campaign
1. Go to **/campaigns** → **New campaign** → name it → pick a type → Create.
2. On the campaign detail page, add 1–3 emails with delays (e.g., day 0, day 3, day 7).
3. Pick an audience filter (status + tier), click **Launch**. Recipients are enqueued into `CampaignRecipientTracking`.
4. Run the drip:
   ```bash
   curl -X POST http://localhost:3001/api/campaigns/tick
   ```
   (must be signed in OR pass `X-Tick-Token: $CAMPAIGN_TICK_TOKEN`)
5. Queued messages are sent up to `daily_campaign_sending_limit` per day (Settings). Delivered / opened / clicked flow back via the SendGrid webhook.

In production, schedule the tick endpoint on Vercel Cron every 15 min or via any cron-like tool.

---

## 6. Domain warm-up reminder

When you first turn on SendGrid, start with a low `daily_campaign_sending_limit` (50–100) and ramp up over 2–4 weeks to build sender reputation. Adjust in **Settings**.
