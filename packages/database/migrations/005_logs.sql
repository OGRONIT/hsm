-- HSM: Hariii Sales Machine
-- Migration 005: System Logs + API Keys Management Table
-- Run after 004_media.sql

-- ─────────────────────────────────────────
-- SYSTEM LOGS
-- ─────────────────────────────────────────
CREATE TABLE system_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  level      TEXT        NOT NULL CHECK (level IN ('info', 'warn', 'error', 'critical')),
  source     TEXT        NOT NULL CHECK (source IN (
               'scraper', 'bot', 'queue', 'api', 'messaging',
               'alerts', 'auth', 'webhooks', 'cron'
             )),
  message    TEXT        NOT NULL,
  metadata   JSONB,                             -- any extra context (lead_id, job_id, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_logs_level      ON system_logs(level);
CREATE INDEX idx_logs_source     ON system_logs(source);
CREATE INDEX idx_logs_created_at ON system_logs(created_at DESC);

-- Auto-purge logs older than 30 days (keep DB light)
-- Run this as a Supabase cron job (pg_cron extension)
-- SELECT cron.schedule('purge-old-logs', '0 2 * * *', $$
--   DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '30 days';
-- $$);

-- RLS
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON system_logs
  USING (auth.role() = 'service_role');

-- Realtime for live log feed in admin panel
ALTER PUBLICATION supabase_realtime ADD TABLE system_logs;


-- ─────────────────────────────────────────
-- API KEYS MANAGEMENT (for Admin Panel 1-click key management)
-- ─────────────────────────────────────────
CREATE TABLE api_keys (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service       TEXT        NOT NULL UNIQUE CHECK (service IN (
                  'anthropic',
                  'openai',
                  'whatsapp',
                  'telegram',
                  'calendly',
                  'resend',
                  'redis',
                  'brightdata',
                  'apify',
                  'google_calendar',
                  'supabase_service'
                )),
  label         TEXT        NOT NULL,           -- Human-readable: "Claude API Key"
  key_preview   TEXT,                           -- Last 4 chars: "...sk9X"
  is_active     BOOLEAN DEFAULT TRUE,
  last_tested_at TIMESTAMPTZ,
  last_test_ok  BOOLEAN,
  last_error    TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
-- NOTE: Actual key values are NEVER stored in DB.
-- They live in Railway/Vercel environment variables.
-- This table only stores metadata for the admin UI.

CREATE TRIGGER api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON api_keys
  USING (auth.role() = 'service_role');

-- Seed initial API key metadata rows
INSERT INTO api_keys (service, label, notes) VALUES
  ('anthropic',       'Claude API Key',              'Used for closing conversations (claude-3-5-sonnet)'),
  ('openai',          'OpenAI API Key',               'Used for initial outreach (gpt-4o-mini)'),
  ('whatsapp',        'WhatsApp Business API Token',  'AiSensy or WATI token — revoke here if banned'),
  ('telegram',        'Telegram Bot Token',            'Smit alert bot token'),
  ('calendly',        'Calendly API Key',              'Meeting booking integration'),
  ('resend',          'Resend API Key',                'Email sending'),
  ('redis',           'Upstash Redis URL',             'BullMQ queue connection'),
  ('brightdata',      'Bright Data Credentials',       'Proxy rotation for scrapers'),
  ('apify',           'Apify API Token',               'Instagram + Facebook scraping'),
  ('google_calendar', 'Google Calendar OAuth',         'Fallback calendar integration'),
  ('supabase_service','Supabase Service Role Key',     'Admin-level DB access — handle with care');


-- ─────────────────────────────────────────
-- SCRAPER STATUS TABLE (for admin panel)
-- ─────────────────────────────────────────
CREATE TABLE scraper_status (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scraper_name    TEXT        NOT NULL UNIQUE CHECK (scraper_name IN (
                    'indiamart',
                    'google_maps',
                    'justdial',
                    'linkedin',
                    'instagram',
                    'facebook_groups'
                  )),
  is_running      BOOLEAN DEFAULT FALSE,
  is_enabled      BOOLEAN DEFAULT TRUE,
  last_run_at     TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IN ('success', 'partial', 'error', 'skipped')),
  leads_today     INTEGER DEFAULT 0,
  leads_total     INTEGER DEFAULT 0,
  error_message   TEXT,
  next_run_at     TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER scraper_status_updated_at
  BEFORE UPDATE ON scraper_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE scraper_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON scraper_status
  USING (auth.role() = 'service_role');

ALTER PUBLICATION supabase_realtime ADD TABLE scraper_status;

-- Seed all scrapers
INSERT INTO scraper_status (scraper_name) VALUES
  ('indiamart'), ('google_maps'), ('justdial'),
  ('linkedin'), ('instagram'), ('facebook_groups');


COMMENT ON TABLE system_logs   IS '30-day rolling log of all HSM system events';
COMMENT ON TABLE api_keys      IS 'Metadata only — actual keys in env vars. For admin UI health checks.';
COMMENT ON TABLE scraper_status IS 'Live scraper state — updated by scraper workers, read by admin panel';
