-- HSM: Hariii Sales Machine
-- Migration 002: Conversations Table
-- Run after 001_leads.sql

CREATE TABLE conversations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel        TEXT        NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  direction      TEXT        NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  message        TEXT        NOT NULL,
  language       TEXT        CHECK (language IN ('en', 'hi', 'gu', 'hinglish', 'gujlish')),
  ai_model_used  TEXT        CHECK (ai_model_used IN (
                               'claude-3-5-sonnet',
                               'gpt-4o-mini',
                               'human'           -- when Smit manually responds
                             )),
  tokens_used    INTEGER,
  cost_usd       NUMERIC(10, 6),                -- actual API cost for this message
  wa_message_id  TEXT,                          -- WhatsApp message ID (for tracking delivery)
  email_id       TEXT,                          -- Resend email ID
  status         TEXT DEFAULT 'sent' CHECK (status IN (
                   'queued', 'sent', 'delivered', 'read', 'failed'
                 )),
  error_detail   TEXT,                          -- if status = failed
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_conv_lead_id    ON conversations(lead_id);
CREATE INDEX idx_conv_channel    ON conversations(channel);
CREATE INDEX idx_conv_direction  ON conversations(direction);
CREATE INDEX idx_conv_created_at ON conversations(created_at DESC);
CREATE INDEX idx_conv_wa_msg_id  ON conversations(wa_message_id) WHERE wa_message_id IS NOT NULL;

-- RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON conversations
  USING (auth.role() = 'service_role');

-- Realtime for live conversation feed in Hariii Portal
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

COMMENT ON TABLE conversations IS 'Full message history - both outbound (bot/Smit) and inbound (leads)';
COMMENT ON COLUMN conversations.cost_usd IS 'Actual Claude/OpenAI API cost per message for cost tracking';
COMMENT ON COLUMN conversations.wa_message_id IS 'WhatsApp Business API message ID for delivery tracking';
