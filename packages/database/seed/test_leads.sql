-- HSM: Hariii Sales Machine
-- Seed: Test Leads for Development
-- Run ONLY in local/dev environment — NOT in production

-- ─────────────────────────────────────────
-- Sample leads across all sources + industries
-- ─────────────────────────────────────────
INSERT INTO leads (company_name, owner_name, phone, email, city, state, industry, source, status, language_detected) VALUES
  ('Rajesh Appliances Pvt Ltd',   'Rajesh Shah',    '+917985412365', 'rajesh@rajeshappliances.com', 'Surat',      'Gujarat',      'home_appliances',    'indiamart',       'new',          'en'),
  ('Bhavesh Machinery Works',     'Bhavesh Patel',  '+919876543210', NULL,                           'Ahmedabad',  'Gujarat',      'heavy_machinery',    'google_maps',     'contacted',    'gu'),
  ('Suresh Safe Industries',      'Suresh Kumar',   '+918765432109', 'info@sureshsafe.in',           'Rajkot',     'Gujarat',      'safes',              'indiamart',       'replied',      'hinglish'),
  ('Mehta Pump House',            'Vivek Mehta',    '+917654321098', NULL,                           'Vadodara',   'Gujarat',      'submersible_pumps',  'instagram',       'interested',   'gujlish'),
  ('Agarwal Auto Components',     'Ravi Agarwal',   '+916543210987', 'ravi@agarwalauto.com',         'Pune',       'Maharashtra',  'auto_parts',         'linkedin',        'meeting_booked','en'),
  ('Gujarat Peanut Sorters',      'Kiran Desai',    '+915432109876', NULL,                           'Gondal',     'Gujarat',      'peanut_sorting',     'facebook_groups', 'new',          'gu'),
  ('Sharma Heavy Equipment',      'Amit Sharma',    '+914321098765', 'amit@sharmaheavy.com',         'Ludhiana',   'Punjab',       'heavy_machinery',    'justdial',        'dead',         'hi'),
  ('Modi Appliances Ltd',         'Nitin Modi',     '+913210987654', NULL,                           'Morbi',      'Gujarat',      'home_appliances',    'indiamart',       'new',          'gujlish'),
  ('Patel Safe & Locker Co',      'Dinesh Patel',   '+912109876543', 'dpatel@patelsafe.in',          'Surat',      'Gujarat',      'safes',              'instagram',       'contacted',    'gu'),
  ('Jain Submersible Mfg',        'Mahesh Jain',    '+911098765432', NULL,                           'Ahmedabad',  'Gujarat',      'submersible_pumps',  'google_maps',     'replied',      'hinglish');

-- Sample conversations for lead 5 (Agarwal Auto - meeting booked)
WITH target_lead AS (
  SELECT id FROM leads WHERE company_name = 'Agarwal Auto Components' LIMIT 1
)
INSERT INTO conversations (lead_id, channel, direction, message, language, ai_model_used, tokens_used, cost_usd) VALUES
  ((SELECT id FROM target_lead), 'whatsapp', 'outbound',
   'Hi Ravi ji! I am Smit from Hariii Design. Saw your auto components line — impressive range. Have you considered 3D animations to showcase your parts catalog? Helps buyers understand specs better than photos.',
   'en', 'gpt-4o-mini', 180, 0.000027),

  ((SELECT id FROM target_lead), 'whatsapp', 'inbound',
   'Hello Smit. Yes we have been thinking about this. What do you offer exactly?',
   'en', NULL, NULL, NULL),

  ((SELECT id FROM target_lead), 'whatsapp', 'outbound',
   'Great question! We create photorealistic 3D product animations — exploded views, assembly sequences, feature highlights. One-time investment, use forever across website, catalog, exhibitions. Much cheaper than studio shoots.',
   'en', 'claude-3-5-sonnet', 210, 0.000315),

  ((SELECT id FROM target_lead), 'whatsapp', 'inbound',
   'Sounds interesting. Can we schedule a call?',
   'en', NULL, NULL, NULL),

  ((SELECT id FROM target_lead), 'whatsapp', 'outbound',
   'Absolutely! Here is my Calendly link to pick a time: calendly.com/smit-hariii — 20 minutes is all we need. Looking forward to it!',
   'en', 'claude-3-5-sonnet', 95, 0.000143);

-- Sample meeting for Agarwal Auto
WITH target_lead AS (
  SELECT id FROM leads WHERE company_name = 'Agarwal Auto Components' LIMIT 1
)
INSERT INTO meetings (lead_id, status, scheduled_at, duration_minutes, notes, deal_value) VALUES
  ((SELECT id FROM target_lead), 'confirmed', NOW() + INTERVAL '2 days 10 hours', 20,
   'Ravi wants exploded view animations for 3 product lines. Budget seems good.', 85000);

-- Sample media for Mehta Pump House
WITH target_lead AS (
  SELECT id FROM leads WHERE company_name = 'Mehta Pump House' LIMIT 1
)
INSERT INTO media (lead_id, type, url, description, mime_type) VALUES
  ((SELECT id FROM target_lead), 'product_photo',
   'https://placeholder.example.com/pump-front.jpg',
   'Front view of 3HP submersible pump - sent by Vivek Mehta', 'image/jpeg'),
  ((SELECT id FROM target_lead), 'product_photo',
   'https://placeholder.example.com/pump-side.jpg',
   'Side profile shot', 'image/jpeg');

-- Log some sample events
INSERT INTO system_logs (level, source, message, metadata) VALUES
  ('info',     'scraper',   'IndiaMart scraper completed run — 47 leads scraped', '{"leads_new": 47, "leads_duped": 12, "duration_ms": 34200}'::jsonb),
  ('info',     'bot',       'Outreach sent to Rajesh Appliances', '{"lead_id": "seed-test", "channel": "whatsapp"}'::jsonb),
  ('warn',     'scraper',   'JustDial rate limit hit — backing off 60s', '{"retry_after": 60}'::jsonb),
  ('error',    'messaging', 'WhatsApp delivery failed for +918765432109', '{"wa_error_code": 131026, "message": "Message undeliverable"}'::jsonb),
  ('critical', 'api',       'OpenAI API returned 429 — rate limit exhausted', '{"retry_after": 3600, "queue_depth": 145}'::jsonb);
