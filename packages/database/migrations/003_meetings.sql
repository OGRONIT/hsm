-- HSM: Hariii Sales Machine
-- Migration 003: Meetings Table
-- Run after 002_conversations.sql

CREATE TABLE meetings (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id              UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status               TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN (
                          'pending',
                          'confirmed',
                          'cancelled',
                          'completed',
                          'no_show'
                        )),
  scheduled_at         TIMESTAMPTZ,
  duration_minutes     INTEGER DEFAULT 20,
  calendly_event_id    TEXT,
  calendly_event_url   TEXT,
  google_cal_event_id  TEXT,
  meet_link            TEXT,                    -- Google Meet / Zoom link
  notes                TEXT,                    -- Smit's pre-meeting notes
  post_meeting_notes   TEXT,                    -- After the call
  outcome              TEXT CHECK (outcome IN (
                          'deal_won',
                          'deal_lost',
                          'follow_up',
                          'not_qualified'
                        )),
  deal_value           NUMERIC(12, 2),          -- Estimated project value in INR
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_meetings_lead_id      ON meetings(lead_id);
CREATE INDEX idx_meetings_status       ON meetings(status);
CREATE INDEX idx_meetings_scheduled_at ON meetings(scheduled_at DESC);
CREATE INDEX idx_meetings_outcome      ON meetings(outcome) WHERE outcome IS NOT NULL;

-- Auto-update trigger
CREATE TRIGGER meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON meetings
  USING (auth.role() = 'service_role');

-- Realtime for meeting confirmations on Hariii Portal
ALTER PUBLICATION supabase_realtime ADD TABLE meetings;

-- View: upcoming meetings (used in portal dashboard)
CREATE VIEW upcoming_meetings AS
  SELECT
    m.*,
    l.company_name,
    l.owner_name,
    l.phone,
    l.industry,
    l.source
  FROM meetings m
  JOIN leads l ON l.id = m.lead_id
  WHERE m.scheduled_at > NOW()
    AND m.status IN ('pending', 'confirmed')
  ORDER BY m.scheduled_at ASC;

COMMENT ON TABLE meetings IS 'All meetings booked by the bot or manually by Smit';
COMMENT ON COLUMN meetings.deal_value IS 'Estimated project value in INR — filled after meeting';
