-- HSM: Hariii Sales Machine
-- Migration 004: Media Table
-- Run after 003_meetings.sql

CREATE TABLE media (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type             TEXT        NOT NULL CHECK (type IN (
                     'product_photo',
                     'reference_video',
                     'document',
                     'voice_note'
                   )),
  url              TEXT        NOT NULL,        -- Supabase Storage URL
  whatsapp_media_id TEXT,                       -- WA media ID (before downloading)
  mime_type        TEXT,                        -- e.g. image/jpeg, video/mp4
  file_size_bytes  INTEGER,
  description      TEXT,                        -- Auto-generated or manual tag
  storage_bucket   TEXT DEFAULT 'hsm-media',
  storage_path     TEXT,                        -- Path inside Supabase bucket
  uploaded_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_media_lead_id ON media(lead_id);
CREATE INDEX idx_media_type    ON media(type);
CREATE INDEX idx_media_uploaded ON media(uploaded_at DESC);

-- RLS
ALTER TABLE media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON media
  USING (auth.role() = 'service_role');

-- Realtime for photo inbox in Hariii Portal
ALTER PUBLICATION supabase_realtime ADD TABLE media;

COMMENT ON TABLE media IS 'Product photos, videos, and docs received from leads via WhatsApp';
COMMENT ON COLUMN media.whatsapp_media_id IS 'Temporary WA media ID — download to storage within 30 days';
