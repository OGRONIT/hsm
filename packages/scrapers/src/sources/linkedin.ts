// ─────────────────────────────────────────────────────────────
// HSM Scrapers — LinkedIn Company Scraper
// Uses Apify's LinkedIn Company Scraper actor
// Lower volume but higher quality leads (verified company pages)
// ─────────────────────────────────────────────────────────────

import {
  ScrapedLead, ScraperRunResult, classifyIndustry,
  updateScraperStatus, logScraperEvent,
} from '../utils/types';
import { batchDeduplicateAndInsert } from '../dedup/deduplicator';

const SCRAPER_NAME = 'linkedin';
const APIFY_TOKEN  = process.env.APIFY_API_TOKEN ?? '';
const APIFY_ACTOR  = 'pratikdaigavane/linkedin-company-search-scraper';
const APIFY_BASE   = 'https://api.apify.com/v2';

const LI_SEARCH_QUERIES = [
  'home appliance manufacturer India',
  'industrial machinery manufacturer Gujarat',
  'safe locker manufacturer India',
  'submersible pump manufacturer India',
  'auto parts manufacturer India',
  'peanut sorting machine manufacturer',
];

export async function runLinkedInScraper(): Promise<ScraperRunResult> {
  const startTime = Date.now();

  if (!APIFY_TOKEN) {
    await logScraperEvent('error', SCRAPER_NAME, 'APIFY_API_TOKEN not set');
    return { source: SCRAPER_NAME, leadsFound: 0, leadsInserted: 0, leadsDuped: 0, errors: 1, durationMs: 0 };
  }

  await updateScraperStatus(SCRAPER_NAME, { is_running: true, error_message: null });
  console.log(`[LinkedIn] Starting Apify run — ${LI_SEARCH_QUERIES.length} queries`);

  try {
    const runId = await startLinkedInRun();
    const items = await waitForLinkedInRun(runId);

    console.log(`[LinkedIn] Apify returned ${items.length} companies`);

    const leads = items
      .map(transformLinkedInToLead)
      .filter((l): l is ScrapedLead => l !== null);

    const { inserted, updated, skipped } = await batchDeduplicateAndInsert(leads);
    const durationMs = Date.now() - startTime;

    await updateScraperStatus(SCRAPER_NAME, {
      is_running:      false,
      last_run_at:     new Date().toISOString(),
      last_run_status: 'success',
      leads_today:     inserted,
      next_run_at:     new Date(Date.now() + 24 * 3600000).toISOString(), // LinkedIn: once/day
    });

    console.log(`[LinkedIn] ✓ Done — ${inserted} new leads`);
    return { source: SCRAPER_NAME, leadsFound: leads.length, leadsInserted: inserted, leadsDuped: skipped, errors: 0, durationMs };

  } catch (err: any) {
    console.error('[LinkedIn] Scraper failed:', err.message);
    await updateScraperStatus(SCRAPER_NAME, {
      is_running: false, last_run_status: 'error', error_message: err.message,
    });
    return { source: SCRAPER_NAME, leadsFound: 0, leadsInserted: 0, leadsDuped: 0, errors: 1, durationMs: Date.now() - startTime };
  }
}

async function startLinkedInRun(): Promise<string> {
  const res = await fetch(`${APIFY_BASE}/acts/${APIFY_ACTOR}/runs`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${APIFY_TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      searchQueries: LI_SEARCH_QUERIES,
      resultsPerQuery: 25,
      proxy: { useApifyProxy: true },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`LinkedIn Apify run failed: ${data.error?.message}`);
  return data.data?.id;
}

async function waitForLinkedInRun(runId: string): Promise<any[]> {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 20000));
    const res  = await fetch(`${APIFY_BASE}/actor-runs/${runId}`, {
      headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` },
    });
    const data = await res.json();
    if (data.data?.status === 'SUCCEEDED') {
      const res2 = await fetch(
        `${APIFY_BASE}/datasets/${data.data.defaultDatasetId}/items?format=json&limit=500`,
        { headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` } },
      );
      return res2.json();
    }
    if (['FAILED', 'ABORTED'].includes(data.data?.status)) throw new Error(`LinkedIn Apify run ${data.data?.status}`);
  }
  throw new Error('LinkedIn Apify run timed out');
}

function transformLinkedInToLead(item: any): ScrapedLead | null {
  const name = item.name ?? item.companyName ?? '';
  if (!name) return null;

  const description = `${item.description ?? ''} ${item.industry ?? ''} ${item.specialties ?? ''}`;
  const location = item.headquartersAddress ?? item.location ?? '';
  const city = extractCity(location);

  return {
    company_name:     name,
    owner_name:       null,
    phone:            null,           // LinkedIn doesn't show phone publicly
    email:            null,
    city,
    state:            null,
    industry:         classifyIndustry(description),
    source:           'linkedin',
    source_url:       item.linkedInUrl ?? item.url ?? null,
    instagram_handle: null,
    facebook_profile: null,
    raw_data: {
      employees:       item.employeeCount,
      industry_raw:    item.industry,
      website:         item.websiteUrl,
      description:     description.slice(0, 300),
      scraped_at:      new Date().toISOString(),
    },
  };
}

function extractCity(location: string): string | null {
  const parts = location.split(',').map((s: string) => s.trim());
  return parts[0] || null;
}

if (require.main === module) {
  runLinkedInScraper().then(r => { console.log(r); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}
