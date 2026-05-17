// ─────────────────────────────────────────────────────────────
// HSM Scrapers — IndiaMart Scraper
// Uses Playwright + Bright Data rotating residential proxies
// Searches for manufacturer listings across all target industries
// ─────────────────────────────────────────────────────────────

import { chromium } from 'playwright';
import {
  ScrapedLead, ScraperRunResult, classifyIndustry,
  updateScraperStatus, logScraperEvent, randomDelay,
} from '../utils/types';
import { getRotatingProxy, recordRequest, recordBlock } from '../proxy/manager';
import { batchDeduplicateAndInsert } from '../dedup/deduplicator';
import { limiters } from '../utils/rate-limiter';

const SCRAPER_NAME = 'indiamart';

const SEARCH_QUERIES = [
  'home appliance manufacturer',
  'kitchen appliance manufacturer india',
  'heavy machinery manufacturer',
  'industrial machine manufacturer',
  'safe locker manufacturer',
  'steel safe manufacturer',
  'submersible pump manufacturer',
  'water pump motor manufacturer',
  'peanut sorting machine manufacturer',
  'groundnut grading machine',
  'auto parts manufacturer india',
  'automobile component manufacturer',
];

// ─────────────────────────────────────────────────────────────
// Main scraper run
// ─────────────────────────────────────────────────────────────
export async function runIndiaMartScraper(): Promise<ScraperRunResult> {
  const startTime = Date.now();
  const allLeads:  ScrapedLead[] = [];
  let errors = 0;

  console.log(`[IndiaMart] Starting scraper — ${SEARCH_QUERIES.length} queries`);
  await updateScraperStatus(SCRAPER_NAME, { is_running: true, error_message: null });

  for (const query of SEARCH_QUERIES) {
    try {
      await limiters.indiamart.throttle();
      const leads = await scrapeQuery(query);
      allLeads.push(...leads);
      console.log(`[IndiaMart] "${query}" → ${leads.length} leads`);
    } catch (err: any) {
      errors++;
      console.error(`[IndiaMart] Query failed: "${query}" — ${err.message}`);
      await logScraperEvent('error', SCRAPER_NAME, `Query failed: ${query}`, { error: err.message });
    }
  }

  // Dedup + insert
  const { inserted, updated, skipped } = await batchDeduplicateAndInsert(allLeads);
  const durationMs = Date.now() - startTime;

  await updateScraperStatus(SCRAPER_NAME, {
    is_running:      false,
    last_run_at:     new Date().toISOString(),
    last_run_status: errors > 0 ? (inserted > 0 ? 'partial' : 'error') : 'success',
    leads_today:     inserted,
    error_message:   errors > 0 ? `${errors} queries failed` : null,
    next_run_at:     new Date(Date.now() + 6 * 3600000).toISOString(),
  });

  await logScraperEvent('info', SCRAPER_NAME,
    `Run complete — ${inserted} inserted, ${updated} enriched, ${skipped} duped`,
    { inserted, updated, skipped, errors, durationMs },
  );

  console.log(`[IndiaMart] ✓ Done — ${inserted} new leads in ${Math.round(durationMs / 1000)}s`);
  return { source: SCRAPER_NAME, leadsFound: allLeads.length, leadsInserted: inserted, leadsDuped: skipped, errors, durationMs };
}

// ─────────────────────────────────────────────────────────────
// Scrape a single search query page
// ─────────────────────────────────────────────────────────────
async function scrapeQuery(query: string): Promise<ScrapedLead[]> {
  const proxy   = getRotatingProxy();
  const browser = await chromium.launch({
    headless: true,
    proxy,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent:  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale:     'en-IN',
    timezoneId: 'Asia/Kolkata',
    viewport:   { width: 1366, height: 768 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
    },
  });

  const leads: ScrapedLead[] = [];

  try {
    const page = await context.newPage();
    recordRequest(SCRAPER_NAME);

    const url = `https://www.indiamart.com/search.mp?ss=${encodeURIComponent(query)}&pos=1&pla=n`;
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (response?.status() === 403 || response?.status() === 429) {
      await recordBlock(SCRAPER_NAME);
      throw new Error(`Blocked: HTTP ${response.status()}`);
    }

    // Wait for results to load
    await page.waitForSelector('.p-right-part, .producttitle, [class*="product"]', { timeout: 15000 })
      .catch(() => {}); // Don't throw if selector not found — page structure may vary

    await randomDelay(1500, 3000);

    // Extract supplier cards
    const cards = await page.$$('[class*="unit"], .p-right-part, [data-company]');

    for (const card of cards.slice(0, 30)) {  // Max 30 per query
      try {
        const lead = await extractIndiaMartCard(card, query);
        if (lead) leads.push(lead);
      } catch {
        // Skip malformed cards
      }
    }

    // Try page 2 for high-value queries
    if (leads.length < 10) {
      const page2Url = url.replace('pos=1', 'pos=2');
      await page.goto(page2Url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await randomDelay(2000, 4000);

      const cards2 = await page.$$('[class*="unit"], .p-right-part, [data-company]');
      for (const card of cards2.slice(0, 20)) {
        try {
          const lead = await extractIndiaMartCard(card, query);
          if (lead) leads.push(lead);
        } catch { /* skip */ }
      }
    }

  } finally {
    await browser.close();
  }

  return leads;
}

// ─────────────────────────────────────────────────────────────
// Extract lead data from a single IndiaMart card
// ─────────────────────────────────────────────────────────────
async function extractIndiaMartCard(card: any, query: string): Promise<ScrapedLead | null> {
  const companyName  = await card.$eval('[class*="company"], [class*="seller"], h3, .lcname', (el: Element) => el.textContent?.trim()).catch(() => null);
  const ownerName    = await card.$eval('[class*="person"], [class*="contact"], .pnm', (el: Element) => el.textContent?.trim()).catch(() => null);
  const phoneRaw     = await card.$eval('[class*="phone"], [class*="mobile"], .mp', (el: Element) => el.textContent?.trim()).catch(() => null);
  const cityRaw      = await card.$eval('[class*="location"], [class*="city"], .citydet', (el: Element) => el.textContent?.trim()).catch(() => null);
  const profileUrl   = await card.$eval('a', (el: Element) => (el as HTMLAnchorElement).href).catch(() => null);
  const productText  = await card.$eval('[class*="product"], [class*="item"]', (el: Element) => el.textContent?.trim()).catch(() => query);

  if (!companyName || companyName.length < 3) return null;

  const [city, state] = parseLocation(cityRaw);

  return {
    company_name:     companyName,
    owner_name:       ownerName,
    phone:            phoneRaw,
    email:            null,
    city,
    state,
    industry:         classifyIndustry(`${query} ${productText ?? ''}`),
    source:           'indiamart',
    source_url:       profileUrl,
    instagram_handle: null,
    facebook_profile: null,
    raw_data: {
      query,
      product_text: productText,
      scraped_at:   new Date().toISOString(),
    },
  };
}

function parseLocation(raw: string | null): [string | null, string | null] {
  if (!raw) return [null, null];
  const parts = raw.split(',').map(s => s.trim());
  return [parts[0] ?? null, parts[1] ?? null];
}

// Run directly: npx tsx src/sources/indiamart.ts
if (require.main === module) {
  runIndiaMartScraper().then(r => {
    console.log('[IndiaMart] Result:', r);
    process.exit(0);
  }).catch(err => {
    console.error('[IndiaMart] Fatal:', err);
    process.exit(1);
  });
}
