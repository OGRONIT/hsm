// ─────────────────────────────────────────────────────────────
// HSM Scrapers — Facebook Groups Scraper
// Uses Apify's Facebook Groups Scraper actor
// Targets Indian manufacturer Facebook groups
// ─────────────────────────────────────────────────────────────

import {
  ScrapedLead, ScraperRunResult, classifyIndustry,
  updateScraperStatus, logScraperEvent,
} from '../utils/types';
import { batchDeduplicateAndInsert } from '../dedup/deduplicator';

const SCRAPER_NAME  = 'facebook_groups';
const APIFY_TOKEN   = process.env.APIFY_API_TOKEN ?? '';
const APIFY_ACTOR   = 'apify/facebook-groups-scraper';
const APIFY_BASE    = 'https://api.apify.com/v2';

const GROUP_IDS = (process.env.FACEBOOK_GROUP_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);

// Keywords that indicate a genuine manufacturer post
const MANUFACTURER_KEYWORDS = [
  'manufacturer', 'manufacturing', 'factory', 'supplier', 'exporter',
  'bulk', 'wholesale', 'oem', 'b2b', 'pvt ltd', 'industries',
  'machine', 'machinery', 'equipment', 'pump', 'safe', 'appliance',
  'उद्योग', 'निर्माता', 'थोक', 'कारखाना',  // Hindi keywords
];

export async function runFacebookGroupsScraper(): Promise<ScraperRunResult> {
  const startTime = Date.now();

  if (!APIFY_TOKEN) {
    await logScraperEvent('error', SCRAPER_NAME, 'APIFY_API_TOKEN not set');
    return { source: SCRAPER_NAME, leadsFound: 0, leadsInserted: 0, leadsDuped: 0, errors: 1, durationMs: 0 };
  }

  if (!GROUP_IDS.length) {
    await logScraperEvent('warn', SCRAPER_NAME, 'No FACEBOOK_GROUP_IDS configured — skipping');
    await updateScraperStatus(SCRAPER_NAME, {
      last_run_status: 'skipped',
      error_message:   'No group IDs configured in FACEBOOK_GROUP_IDS env var',
    });
    return { source: SCRAPER_NAME, leadsFound: 0, leadsInserted: 0, leadsDuped: 0, errors: 0, durationMs: 0 };
  }

  console.log(`[Facebook] Starting Apify run — ${GROUP_IDS.length} groups`);
  await updateScraperStatus(SCRAPER_NAME, { is_running: true, error_message: null });

  try {
    const runId = await startFBApifyRun();
    const items = await waitForFBRun(runId);

    console.log(`[Facebook] Apify returned ${items.length} raw posts`);

    const leads = items
      .filter(isManufacturerPost)
      .map(transformFBPostToLead)
      .filter((l): l is ScrapedLead => l !== null);

    console.log(`[Facebook] ${leads.length} leads after filtering`);

    const { inserted, updated, skipped } = await batchDeduplicateAndInsert(leads);
    const durationMs = Date.now() - startTime;

    await updateScraperStatus(SCRAPER_NAME, {
      is_running:      false,
      last_run_at:     new Date().toISOString(),
      last_run_status: 'success',
      leads_today:     inserted,
      next_run_at:     new Date(Date.now() + 8 * 3600000).toISOString(),
    });

    console.log(`[Facebook] ✓ Done — ${inserted} new leads`);
    return { source: SCRAPER_NAME, leadsFound: leads.length, leadsInserted: inserted, leadsDuped: skipped, errors: 0, durationMs };

  } catch (err: any) {
    console.error('[Facebook] Scraper failed:', err.message);
    await updateScraperStatus(SCRAPER_NAME, {
      is_running: false, last_run_status: 'error', error_message: err.message,
    });
    return { source: SCRAPER_NAME, leadsFound: 0, leadsInserted: 0, leadsDuped: 0, errors: 1, durationMs: Date.now() - startTime };
  }
}

async function startFBApifyRun(): Promise<string> {
  const res = await fetch(`${APIFY_BASE}/acts/${APIFY_ACTOR}/runs`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${APIFY_TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      groupUrls:        GROUP_IDS.map(id => `https://www.facebook.com/groups/${id}`),
      maxPosts:         100,
      proxy:            { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Apify FB run failed: ${data.error?.message}`);
  return data.data?.id;
}

async function waitForFBRun(runId: string): Promise<any[]> {
  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 20000));
    const res  = await fetch(`${APIFY_BASE}/actor-runs/${runId}`, {
      headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` },
    });
    const data = await res.json();
    const status = data.data?.status;
    if (status === 'SUCCEEDED') {
      const res2 = await fetch(
        `${APIFY_BASE}/datasets/${data.data.defaultDatasetId}/items?format=json&limit=500`,
        { headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` } },
      );
      return res2.json();
    }
    if (status === 'FAILED' || status === 'ABORTED') throw new Error(`Apify FB run ${status}`);
  }
  throw new Error('Apify FB run timed out');
}

function isManufacturerPost(item: any): boolean {
  const text = `${item.text ?? ''} ${item.title ?? ''}`.toLowerCase();
  return MANUFACTURER_KEYWORDS.some(kw => text.includes(kw));
}

function transformFBPostToLead(item: any): ScrapedLead | null {
  const text      = item.text ?? item.postText ?? '';
  const authorName = item.authorName ?? item.author?.name ?? '';

  if (!authorName || !text) return null;

  const phoneMatch = text.match(/(?:\+91|0)?[6-9]\d{9}/);
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);

  return {
    company_name:     authorName,
    owner_name:       authorName,
    phone:            phoneMatch?.[0] ?? null,
    email:            emailMatch?.[0]?.toLowerCase() ?? null,
    city:             extractCityFromText(text),
    state:            null,
    industry:         classifyIndustry(text),
    source:           'facebook_groups',
    source_url:       item.url ?? item.postUrl ?? null,
    instagram_handle: null,
    facebook_profile: item.authorUrl ?? null,
    raw_data:         { post_text: text.slice(0, 500), scraped_at: new Date().toISOString() },
  };
}

function extractCityFromText(text: string): string | null {
  const cities = [
    'Ahmedabad', 'Surat', 'Rajkot', 'Vadodara', 'Mumbai', 'Pune',
    'Delhi', 'Noida', 'Ludhiana', 'Bengaluru', 'Chennai', 'Hyderabad',
  ];
  return cities.find(c => text.toLowerCase().includes(c.toLowerCase())) ?? null;
}

if (require.main === module) {
  runFacebookGroupsScraper().then(r => { console.log(r); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}
