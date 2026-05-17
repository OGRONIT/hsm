-- HSM: Hariii Sales Machine
-- Migration 001: Leads Table
-- Run this first in Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE leads (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name      TEXT        NOT NULL,
  owner_name        TEXT,
  phone             TEXT,                          -- stored as +91XXXXXXXXXX
  email             TEXT,
  city              TEXT,
  state             TEXT,
  industry          TEXT CHECK (industry IN (
                      'home_appliances',
                      'heavy_machinery',
                      'safes',
                      'auto_parts',
                      'submersible_pumps',
                      'peanut_sorting',
                      'other'
                    )),
  source            TEXT NOT NULL CHECK (source IN (
                      'indiamart',
                      'google_maps',
                      'justdial',
                      'linkedin',
                      'instagram',
                      'facebook_groups'
                    )),
  source_url        TEXT,
  instagram_handle  TEXT,
  facebook_profile  TEXT,
  raw_data          JSONB,
  status            TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
                      'new',
                      'contacted',
                      'replied',
                      'interested',
                      'meeting_booked',
                      'converted',
                      'dead'
                    )),
  language_detected TEXT CHECK (language_detected IN (
                      'en', 'hi', 'gu', 'hinglish', 'gujlish'
                    )),
  whatsapp_opt_out  BOOLEAN DEFAULT FALSE,
  email_opt_out     BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_leads_status       ON leads(status);
CREATE INDEX idx_leads_source       ON leads(source);
CREATE INDEX idx_leads_industry     ON leads(industry);
CREATE INDEX idx_leads_phone        ON leads(phone);
CREATE INDEX idx_leads_email        ON leads(email);
CREATE INDEX idx_leads_created_at   ON leads(created_at DESC);

-- Unique constraints for deduplication
CREATE UNIQUE INDEX idx_leads_phone_unique ON leads(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX idx_leads_email_unique ON leads(email) WHERE email IS NOT NULL;

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable Row Level Security (Supabase best practice)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Only service role can access (admin panel uses service role key)
CREATE POLICY "Service role full access" ON leads
  USING (auth.role() = 'service_role');

-- Enable Realtime for admin panel live updates
ALTER PUBLICATION supabase_realtime ADD TABLE leads;

COMMENT ON TABLE leads IS 'All scraped manufacturer leads for Hariii Sales Machine';
COMMENT ON COLUMN leads.raw_data IS 'Full scraped payload from source (JSON) for audit trail';
COMMENT ON COLUMN leads.phone IS 'Always stored with country code: +91XXXXXXXXXX';
