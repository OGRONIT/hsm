# HSM — Hariii Sales Machine 🔥

Fully automated B2B lead generation and outreach system for **Hariii Design** — a 3D product animation studio.

**What it does:** Scrapes manufacturer leads → AI bot (as Smit) outreaches via WhatsApp + Email → Books meetings → Smit closes deals.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     DATA SOURCES                            │
│  IndiaMart · Google Maps · JustDial · Instagram · Facebook  │
│                  LinkedIn (6 scrapers)                      │
└───────────────────────┬─────────────────────────────────────┘
                        │ leads
                        ▼
┌───────────────────────────────────────────────────────────┐
│                  SUPABASE DATABASE                        │
│  leads · conversations · meetings · media · system_logs   │
└───────────┬───────────────────────────────────────────────┘
            │
     ┌──────┴───────┐
     │              │
     ▼              ▼
┌─────────┐   ┌──────────┐
│  QUEUE  │   │   BOT    │
│ BullMQ  │──▶│  (Smit)  │
│  Redis  │   │ Claude + │
└─────────┘   │  OpenAI  │
              └────┬─────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
┌──────────────┐      ┌──────────────┐
│  WHATSAPP    │      │    EMAIL     │
│ Business API │      │   (Resend)   │
└──────────────┘      └──────────────┘
        │
        ▼ (meeting booked)
┌──────────────┐      ┌──────────────┐
│   CALENDLY   │      │   ALERTS     │
│   Webhook    │─────▶│  Telegram    │
└──────────────┘      │  WhatsApp    │
                      └──────────────┘
        │
   ┌────┴────┐
   ▼         ▼
┌──────┐  ┌────────┐
│ADMIN │  │HARIII  │
│PANEL │  │PORTAL  │
└──────┘  └────────┘
```

---

## Quick Start (Local Dev)

### 1. Clone and setup

```bash
git clone <your-repo>
cd hsm
cp .env.example .env
# Fill in your .env values
```

### 2. Run database migrations

Go to your Supabase project → SQL Editor → run in order:
```
packages/database/migrations/001_leads.sql
packages/database/migrations/002_conversations.sql
packages/database/migrations/003_meetings.sql
packages/database/migrations/004_media.sql
packages/database/migrations/005_logs.sql
```

Optional (dev only):
```
packages/database/seed/test_leads.sql
```

### 3. Start everything with Docker

```bash
docker-compose up --build
```

| Service      | URL                   |
|--------------|-----------------------|
| Admin Panel  | http://localhost:3000 |
| API          | http://localhost:3001 |
| Hariii Portal| http://localhost:3002 |
| Redis        | localhost:6379        |

### 4. Without Docker (manual)

```bash
# Install all deps
npm install -g pnpm
pnpm install

# Terminal 1: Queue workers
cd packages/queue && npm run dev

# Terminal 2: Alerts scheduler
cd packages/alerts && npm run dev

# Terminal 3: Scrapers
cd packages/scrapers && npm run dev

# Terminal 4: API
cd packages/api && npm run dev

# Terminal 5: Admin Panel
cd apps/admin-panel && npm run dev

# Terminal 6: Hariii Portal
cd apps/hariii-portal && npm run dev
```

---

## Production Deployment

### Backend → Railway

Deploy each as a **separate Railway service** from the same repo:

| Service Name       | Root Directory          | Start Command       |
|--------------------|-------------------------|---------------------|
| `hsm-api`          | `packages/api`          | `npm start`         |
| `hsm-queue`        | `packages/queue`        | `npm start`         |
| `hsm-scrapers`     | `packages/scrapers`     | `npm start`         |
| `hsm-alerts`       | `packages/alerts`       | `npm start`         |
| `hsm-bot`          | `packages/bot`          | (imported by queue) |

### Frontend → Vercel

Deploy each as a separate Vercel project:

| Project          | Root Directory          | Framework  |
|------------------|-------------------------|------------|
| `hsm-admin`      | `apps/admin-panel`      | Next.js    |
| `hsm-portal`     | `apps/hariii-portal`    | Next.js    |

### Redis → Upstash

1. Create a Redis database at https://console.upstash.com
2. Copy the `REDIS_URL` (starts with `rediss://`)
3. Add to all Railway service env vars

---

## WhatsApp Webhook Setup

1. Go to Meta Developer Console → Your App → WhatsApp → Configuration
2. Set webhook URL: `https://api.hariii.design/api/webhooks/whatsapp`
3. Set verify token: your `WHATSAPP_WEBHOOK_VERIFY_TOKEN` value
4. Subscribe to: `messages`, `message_deliveries`, `message_reads`

## Calendly Webhook Setup

1. Go to https://calendly.com/integrations/api_webhooks
2. Add webhook URL: `https://api.hariii.design/api/webhooks/calendly`
3. Subscribe to: `invitee.created`, `invitee.canceled`
4. Copy signing key → `CALENDLY_WEBHOOK_SECRET`

---

## Build Order (for fresh setup)

```
1. Database      → Supabase migrations
2. Queue         → packages/queue
3. Bot           → packages/bot
4. Messaging     → packages/messaging
5. Alerts        → packages/alerts
6. Scrapers      → packages/scrapers
7. API           → packages/api
8. Admin Panel   → apps/admin-panel
9. Hariii Portal → apps/hariii-portal
10. Docker       → docker-compose.yml
```

---

## Key Features

- **6 scrapers** running 24/7: IndiaMart, Google Maps, JustDial, Instagram, Facebook, LinkedIn
- **Smit AI bot**: Claude Sonnet (closing) + GPT-4o Mini (outreach), full persona, 5 languages
- **Language detection**: EN / HI / GU / Hinglish / Gujlish — auto-switches mid-conversation
- **500 WA messages/day** rate limit with business hours scheduling (8am–8pm IST)
- **Dead lead cleanup**: auto-marks unresponsive leads after 8 days
- **Dual alerts**: Telegram (primary) + WhatsApp (backup) for all key events
- **Admin panel**: API key management, scraper control, bot pause/resume, cost tracker
- **Hariii Portal**: Conversations, meetings tracker, lead kanban, analytics, source breakdown

---

## Cost Estimate (Monthly)

| Service              | Cost      |
|----------------------|-----------|
| Railway (hosting)    | ~$20      |
| Supabase Pro         | $25       |
| Upstash Redis        | ~$10      |
| Bright Data (proxies)| ~$50      |
| Apify                | $49       |
| AiSensy/WATI (WA)    | $29       |
| Calendly Standard    | $10       |
| Claude API           | ~$5–15    |
| OpenAI API           | ~$2–5     |
| Resend               | $0 (free) |
| Vercel               | $0 (free) |
| Google Maps API      | $0 (free credit) |
| **Total**            | **~$200–215/mo** |

At ₹85,000 avg deal × 7–8 meetings/month → **₹6–7 lakh pipeline** from ~₹18,000/mo spend.

---

*Built for Hariii Design — Smit Barbhaya*
*smit@hariii.design · www.hariii.design · @hariii.design*
