// ─────────────────────────────────────────────────────────────
// HSM Scrapers — Shared Types & Base Scraper Class
// ─────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─────────────────────────────────────────────────────────────
// Scraped lead schema — validated before DB insert
// ─────────────────────────────────────────────────────────────
export const ScrapedLeadSchema = z.object({
  company_name:      z.string().min(1),
  owner_name:        z.string().nullable().default(null),
  phone:             z.string().nullable().default(null),
  email:             z.string().email().nullable().default(null),
  city:              z.string().nullable().default(null),
  state:             z.string().nullable().default(null),
  industry:          z.enum([
    'home_appliances', 'heavy_machinery', 'safes',
    'auto_parts', 'submersible_pumps', 'peanut_sorting', 'other',
  ]).default('other'),
  source:            z.enum([
    'indiamart', 'google_maps', 'justdial',
    'linkedin', 'instagram', 'facebook_groups',
  ]),
  source_url:        z.string().url().nullable().default(null),
  instagram_handle:  z.string().nullable().default(null),
  facebook_profile:  z.string().nullable().default(null),
  raw_data:          z.record(z.any()).default({}),
});

export type ScrapedLead = z.infer<typeof ScrapedLeadSchema>;

// ─────────────────────────────────────────────────────────────
// Run result — returned by each scraper after completion
// ─────────────────────────────────────────────────────────────
export interface ScraperRunResult {
  source:        string;
  leadsFound:    number;
  leadsInserted: number;
  leadsDuped:    number;
  errors:        number;
  durationMs:    number;
}

// ─────────────────────────────────────────────────────────────
// Industry keyword → enum mapping
// ─────────────────────────────────────────────────────────────
export function classifyIndustry(text: string): ScrapedLead['industry'] {
  const lower = text.toLowerCase();
  if (/home\s*appliance|kitchen\s*appliance|mixer|grinder|washing\s*machine|refrigerator|fan|cooler|air\s*condition/.test(lower)) return 'home_appliances';
  if (/heavy\s*machine|industrial\s*machine|press\s*machine|cnc|lathe|milling|crane|forklift|hydraulic/.test(lower))              return 'heavy_machinery';
  if (/safe|locker|vault|steel\s*almirah|fire\s*proof/.test(lower))                                                                return 'safes';
  if (/auto\s*part|automobile|car\s*part|bike\s*part|vehicle|clutch|brake|gear|axle/.test(lower))                                  return 'auto_parts';
  if (/submersible|pump|motor|borewell|water\s*pump|centrifugal/.test(lower))                                                      return 'submersible_pumps';
  if (/peanut|groundnut|sorting|grading|cleaning\s*machine|seed\s*processing/.test(lower))                                         return 'peanut_sorting';
  return 'other';
}

// ─────────────────────────────────────────────────────────────
// Phone normalizer — always +91XXXXXXXXXX
// ─────────────────────────────────────────────────────────────
export function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10)                          return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length > 10)                            return `+${digits}`;
  return null; // Too short to be valid
}

// ─────────────────────────────────────────────────────────────
// Update scraper_status table (admin panel reads this live)
// ─────────────────────────────────────────────────────────────
export async function updateScraperStatus(
  scraperName: string,
  patch: Partial<{
    is_running:      boolean;
    last_run_at:     string;
    last_run_status: 'success' | 'partial' | 'error' | 'skipped';
    leads_today:     number;
    leads_total:     number;
    error_message:   string | null;
    next_run_at:     string;
  }>,
): Promise<void> {
  await supabase
    .from('scraper_status')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('scraper_name', scraperName);
}

// ─────────────────────────────────────────────────────────────
// Log scraper event to system_logs
// ─────────────────────────────────────────────────────────────
export async function logScraperEvent(
  level:   'info' | 'warn' | 'error' | 'critical',
  source:  string,
  message: string,
  meta?:   object,
): Promise<void> {
  await supabase.from('system_logs').insert({
    level, source: 'scraper', message,
    metadata: { scraper: source, ...meta },
  });
}

// ─────────────────────────────────────────────────────────────
// Random delay helper (avoids bot detection)
// ─────────────────────────────────────────────────────────────
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  return new Promise(resolve => setTimeout(resolve, ms));
}
