// ─────────────────────────────────────────────────────────────
// HSM Scrapers — Instagram Hashtag Scraper
// Uses Apify's Instagram Hashtag Scraper actor
// Extracts manufacturer accounts from target hashtags
// ─────────────────────────────────────────────────────────────

import {
  ScrapedLead, ScraperRunResult, classifyIndustry,
  updateScraperStatus, logScraperEvent,
} from '../utils/types';
import { batchDeduplicateAndInsert } from '../dedup/deduplicator';

const SCRAPER_NAME = 'instagram';
const APIFY_TOKEN  = process.env.APIFY_API_TOKEN ?? '';
const APIFY_ACTOR  = 'apify/instagram-hashtag-scraper';
const APIFY_BASE   = 'https://api.apify.com/v2';

const TARGET_HASHTAGS = (process.env.INSTAGRAM_HASHTAGS ?? '')
  .split(',')
  .map(h => h.trim())
  .filter(Boolean)
  .concat([
    'manufacturer', 'machinery', 'homeappliances', 'industrialmachinery',
    'madeinindia', 'safes', 'submersiblepump', 'gujaratmanufacturer',
    'suratmanufacturer', 'ahmedabadmanufacturer', 'industrialequipment',
    'madeinIndia', 'indianmanufacturer', 'b2bindia',
  ]);

// Business keywords that must appear in bio/caption to qualify
const BUSINESS_KEYWORDS = [
  'manufacturer', 'manufacturing', 'supplier', 'exporter', 'wholesaler',
  'factory', 'industries', 'pvt ltd', 'limited', 'enterprise',
  'udyog', 'udhyog', 'vyapar', 'b2b', 'bulk order', 'oem',
];

// ─────────────────────────────────────────────────────────────
// Main scraper
// ─────────────────────────────────────────────────────────────
export async function runInstagramScraper(): Promise<ScraperRunResult> {
  const startTime = Date.now();

  if (!APIFY_TOKEN) {
    await logScraperEvent('error', SCRAPER_NAME, 'APIFY_API_TOKEN not set');
    return { source: SCRAPER_NAME, leadsFound: 0, leadsInserted: 0, leadsDuped: 0, errors: 1, durationMs: 0 };
  }

  console.log(`[Instagram] Starting Apify run — ${TARGET_HASHTAGS.length} hashtags`);
  await updateScraperStatus(SCRAPER_NAME, { is_running: true, error_message: null });

  try {
    // Run Apify actor
    const runId  = await startApifyRun();
    const items  = await waitForApifyRun(runId);

    console.log(`[Instagram] Apify returned ${items.length} raw items`);

    // Filter and transform
    const leads = items
      .filter(isBusinessAccount)
      .map(transformToLead)
      .filter((l): l is ScrapedLead => l !== null);

    console.log(`[Instagram] ${leads.length} leads after filtering`);

    const { inserted, updated, skipped } = await batchDeduplicateAndInsert(leads);
    const durationMs = Date.now() - startTime;

    await updateScraperStatus(SCRAPER_NAME, {
      is_running:      false,
      last_run_at:     new Date().toISOString(),
      last_run_status: 'success',
      leads_today:     inserted,
      next_run_at:     new Date(Date.now() + 6 * 3600000).toISOString(),
    });

    console.log(`[Instagram] ✓ Done — ${inserted} new leads`);
    return { source: SCRAPER_NAME, leadsFound: leads.length, leadsInserted: inserted, leadsDuped: skipped, errors: 0, durationMs };

  } catch (err: any) {
    console.error('[Instagram] Scraper failed:', err.message);
    await updateScraperStatus(SCRAPER_NAME, {
      is_running:      false,
      last_run_status: 'error',
      error_message:   err.message,
    });
    await logScraperEvent('error', SCRAPER_NAME, `Instagram scraper failed: ${err.message}`);
    return { source: SCRAPER_NAME, leadsFound: 0, leadsInserted: 0, leadsDuped: 0, errors: 1, durationMs: Date.now() - startTime };
  }
}

// ─────────────────────────────────────────────────────────────
// Apify API helpers
// ─────────────────────────────────────────────────────────────
async function startApifyRun(): Promise<string> {
  const res = await fetch(`${APIFY_BASE}/acts/${APIFY_ACTOR}/runs`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${APIFY_TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      hashtags:        TARGET_HASHTAGS.slice(0, 20),  // Apify limit
      resultsPerHashtag: 50,
      proxy:           { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Apify run failed: ${data.error?.message}`);

  const runId = data.data?.id;
  console.log(`[Instagram] Apify run started: ${runId}`);
  return runId;
}

async function waitForApifyRun(runId: string, maxWaitMs = 5 * 60 * 1000): Promise<any[]> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 15000));  // Poll every 15s

    const res  = await fetch(`${APIFY_BASE}/actor-runs/${runId}`, {
      headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` },
    });
    const data = await res.json();
    const status = data.data?.status;

    console.log(`[Instagram] Apify run status: ${status}`);

    if (status === 'SUCCEEDED') {
      const datasetId = data.data?.defaultDatasetId;
      return fetchApifyDataset(datasetId);
    }
    if (status === 'FAILED' || status === 'ABORTED') {
      throw new Error(`Apify run ${status}: ${data.data?.exitCode}`);
    }
  }

  throw new Error('Apify run timed out after 5 minutes');
}

async function fetchApifyDataset(datasetId: string): Promise<any[]> {
  const res  = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?format=json&limit=1000`,
    { headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` } },
  );
  const data = await res.json();
  return Array.isArray(data) ? data : (data.items ?? []);
}

// ─────────────────────────────────────────────────────────────
// Filter: must be a business account with manufacturer keywords
// ─────────────────────────────────────────────────────────────
function isBusinessAccount(item: any): boolean {
  const bio        = (item.biography ?? item.bio ?? '').toLowerCase();
  const username   = (item.username ?? '').toLowerCase();
  const followersCount = item.followersCount ?? item.followers ?? 0;

  // Must have 100+ followers
  if (followersCount < 100) return false;

  // Bio must contain at least one business keyword
  const hasBizKeyword = BUSINESS_KEYWORDS.some(kw => bio.includes(kw));
  if (!hasBizKeyword) return false;

  // Filter out personal/influencer accounts
  const personalSignals = ['blogger', 'influencer', 'model', 'actor', 'artist', 'personal'];
  if (personalSignals.some(s => bio.includes(s) || username.includes(s))) return false;

  return true;
}

// ─────────────────────────────────────────────────────────────
// Transform Apify Instagram item → ScrapedLead
// ─────────────────────────────────────────────────────────────
function transformToLead(item: any): ScrapedLead | null {
  const bio      = item.biography ?? item.bio ?? '';
  const username = item.username ?? '';
  const fullName = item.fullName ?? item.full_name ?? '';

  if (!username) return null;

  // Extract phone from bio
  const phoneMatch = bio.match(/(?:\+91|0)?[6-9]\d{9}/);
  const phone      = phoneMatch ? phoneMatch[0] : null;

  // Extract email from bio
  const emailMatch = bio.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  const email      = emailMatch ? emailMatch[0].toLowerCase() : null;

  // Extract website from bio
  const websiteMatch = bio.match(/(?:https?:\/\/)?(?:www\.)?[\w-]+\.[a-z]{2,}/i);

  // Company name: prefer full name, fallback to username
  const companyName = fullName || username.replace(/[._]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

  // Classify industry from bio + username
  const industryText = `${bio} ${username} ${fullName}`;

  return {
    company_name:     companyName,
    owner_name:       null,
    phone,
    email,
    city:             extractCity(bio),
    state:            null,
    industry:         classifyIndustry(industryText),
    source:           'instagram',
    source_url:       `https://www.instagram.com/${username}/`,
    instagram_handle: username,
    facebook_profile: null,
    raw_data: {
      username,
      bio:             bio.slice(0, 500),
      followers:       item.followersCount ?? 0,
      website:         item.externalUrl ?? websiteMatch?.[0],
      scraped_at:      new Date().toISOString(),
    },
  };
}

function extractCity(text: string): string | null {
  const cities = [
    'ahmedabad', 'surat', 'rajkot', 'vadodara', 'gandhinagar', 'morbi',
    'mumbai', 'pune', 'nashik', 'delhi', 'noida', 'gurgaon', 'faridabad',
    'ludhiana', 'chennai', 'bengaluru', 'hyderabad', 'coimbatore',
    'jaipur', 'indore', 'bhopal', 'nagpur',
  ];
  const lower = text.toLowerCase();
  const found = cities.find(c => lower.includes(c));
  return found ? found.charAt(0).toUpperCase() + found.slice(1) : null;
}

if (require.main === module) {
  runInstagramScraper().then(r => { console.log(r); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}
