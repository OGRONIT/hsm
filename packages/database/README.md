# HSM Database — Setup Guide

## Stack
- **Database**: Supabase (PostgreSQL 15)
- **Auth**: Row Level Security (service role only)
- **Realtime**: Enabled on all main tables

---

## Run Order (IMPORTANT)

Run migrations in this exact order in **Supabase SQL Editor**:

```
1. 001_leads.sql          → Core leads table
2. 002_conversations.sql  → Message history
3. 003_meetings.sql       → Meeting tracker
4. 004_media.sql          → Product photos inbox
5. 005_logs.sql           → System logs + API key metadata + scraper status
```

After migrations:
```
6. seed/test_leads.sql    → DEV ONLY — sample data for testing
```

---

## Tables Overview

| Table | Purpose | Realtime |
|-------|---------|----------|
| `leads` | All scraped manufacturer contacts | ✅ |
| `conversations` | Full WhatsApp + Email chat history | ✅ |
| `meetings` | Calendly + Google Cal meetings | ✅ |
| `media` | Product photos from leads via WA | ✅ |
| `system_logs` | All system events (30-day rolling) | ✅ |
| `api_keys` | API key metadata for admin UI | ❌ |
| `scraper_status` | Live scraper state per source | ✅ |

---

## Important Notes

### API Keys Table
- **NEVER store actual keys in this table**
- Keys live in Railway / Vercel environment variables
- This table stores only: service name, label, preview (last 4 chars), health status
- Admin panel uses this metadata to show status and trigger tests

### Deduplication
Unique indexes on `leads`:
- `phone` (where not null) — same phone = same lead
- `email` (where not null) — same email = same lead
- Company name + city dedup happens in scraper code before insert

### Phone Format
Always store as `+91XXXXXXXXXX` (with country code).
The scraper normalizes this before insert.

### Row Level Security
All tables use service role only. Your env vars:
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — never has write access
- `SUPABASE_SERVICE_ROLE_KEY` — used by all backend services

---

## Supabase Storage Bucket

Create a bucket named `hsm-media` for product photos:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('hsm-media', 'hsm-media', false);

-- Allow service role to upload
CREATE POLICY "Service role uploads" ON storage.objects
  FOR ALL USING (auth.role() = 'service_role');
```

---

## Recommended Supabase Settings

1. **Connection pooling**: Enable PgBouncer (transaction mode) for Railway services
2. **Point-in-time recovery**: Enable for production
3. **Log retention**: Set to max (7 days on free, more on paid)
4. **pg_cron**: Enable for auto-purge of old logs (see 005_logs.sql comment)
