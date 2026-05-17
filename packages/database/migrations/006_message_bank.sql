-- HSM: Hariii Sales Machine
-- Migration 006: Message Bank + Meeting Slots
-- Run after 005_logs.sql

CREATE TABLE message_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  fresh_allocated INTEGER DEFAULT 500,
  used INTEGER DEFAULT 0,
  banked_carried_in INTEGER DEFAULT 0,
  banked_carried_out INTEGER DEFAULT 0,
  total_available INTEGER DEFAULT 500,
  new_outreach_count INTEGER DEFAULT 0,
  new_outreach_limit INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE meeting_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_date DATE NOT NULL,
  slot_time TIME NOT NULL,
  slot_datetime TIMESTAMPTZ NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(slot_date, slot_time)
);

ALTER PUBLICATION supabase_realtime ADD TABLE message_bank;
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_slots;
