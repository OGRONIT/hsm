# HSM Queue — BullMQ + Upstash Redis

## What this package does

Manages all async message sending for HSM:
- **Outreach queue** — first message to new leads (500/day WA limit, business hours only)
- **Followup queue** — auto-followup after 2 days and 5 days if no reply
- **Booking queue** — instant calendar link push when hot lead detected

## Architecture

```
Scraper → addOutreachJob() → [hsm:outreach] → OutreachWorker
                                                    ↓ (after 2 days, no reply)
                                              [hsm:followup] → FollowupWorker
                                                    ↓ (if replied: "theek hai")
                                              [hsm:booking]  → BookingWorker → Smit Alert
```

## Setup

### 1. Install dependencies
```bash
cd packages/queue
npm install
```

### 2. Environment variables (in Railway)
```env
REDIS_URL=redis://default:xxx@xxx.upstash.io:6379
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx
CALENDLY_BOOKING_URL=https://calendly.com/smit-hariii/20min
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=xxx
ADMIN_PANEL_URL=https://admin.hariii.design
```

### 3. Run workers
```bash
# All workers together
npm run dev

# Individual workers (for Railway separate services)
npm run worker:outreach
npm run worker:followup
npm run worker:booking
```

## Railway Deployment

Deploy each worker as a **separate Railway service**:

| Service Name | Start Command |
|---|---|
| `hsm-worker-outreach` | `npm run worker:outreach` |
| `hsm-worker-followup` | `npm run worker:followup` |
| `hsm-worker-booking`  | `npm run worker:booking` |

All share the same Redis (Upstash) and same env vars.

## Rate Limiting

- **WhatsApp**: 500 messages/day, tracked in Redis with auto-expiring key
- **Business hours**: Jobs sent only 8am–8pm IST, others delayed to next morning
- **Concurrency**: Outreach=3, Followup=5, Booking=10 concurrent jobs

## Queue Stats API

The `/api/queue/stats` endpoint (built in Step 7) calls `getAllQueueStats()` to get:
```json
{
  "outreach": { "waiting": 12, "active": 2, "completed": 847, "failed": 3, "delayed": 156 },
  "followup": { "waiting": 34, "active": 1, "completed": 412, "failed": 1, "delayed": 89 },
  "booking":  { "waiting": 0,  "active": 0, "completed": 23,  "failed": 0, "delayed": 0 }
}
```

## Important Notes

- **Stubs**: `sendWhatsAppMessage()`, `sendEmail()`, `generateOutreachMessage()` are stubs — wired up in Step 3 (bot) and Step 4 (messaging)
- **Dedup**: Each lead can only have 1 outreach job (`jobId: outreach:${leadId}`) — BullMQ dedupes automatically
- **Dead leads**: After 2 followups with no reply, a Redis TTL key is set. Cron (Step 6) checks and marks them dead.
