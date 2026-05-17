// ─────────────────────────────────────────────────────────────
// HSM Scrapers — JustDial Scraper
// Playwright + Bright Data proxies
// ─────────────────────────────────────────────────────────────

import { chromium } from 'playwright';
import {
  ScrapedLead, ScraperRunResult, classifyIndustry,
  updateScraperStatus, logScraperEvent, randomDelay,
} from '../utils/types';
import { getRotatingProxy, recordRequest, recordBlock } from '../proxy/manager';
import { batchDeduplicateAndInsert } from '../dedup/deduplicator';
import { limiters } from '../utils/rate-limiter';

const SCRAPER_NAME = 'justdial';

const SEARCH_COMBOS: Array<{ category: string; city: string }> = [
  { category: 'home-appliances-manufacturers', city: 'ahmedabad' },
  { category: 'home-appliances-manufacturers', city: 'surat' },
  { category: 'home-appliances-manufacturers', city: 'rajkot' },
  { category: 'machinery-manufacturers',       city: 'ahmedabad' },
  { category: 'machinery-manufacturers',       city: 'pune' },
  { category: 'safe-manufacturers',            city: 'ahmedabad' },
  { category: 'safe-manufacturers',            city: 'surat' },
  { category: 'pump-manufacturers',            city: 'ahmedabad' },
  { category: 'pump-manufacturers',            city: 'vadodara' },
  { category: 'auto-parts-manufacturers',      city: 'pune' },
  { category: 'auto-parts-manufacturers',      city: 'delhi' },
];

export async function runJustDialScraper(): Promise<ScraperRunResult> {
  const startTime = Date.now();
  const allLeads: ScrapedLead[] = [];
  let errors = 0;

  await updateScraperStatus(SCRAPER_NAME, { is_running: true, error_message: null });
  console.log(`[JustDial] Starting — ${SEARCH_COMBOS.length} category+city combos`);

  for (const combo of SEARCH_COMBOS) {
    try {
      await limiters.justdial.throttle();
      const leads = await scrapeJustDialPage(combo.category, combo.city);
      allLeads.push(...leads);
      console.log(`[JustDial] ${combo.category} in ${combo.city} → ${leads.length} leads`);
    } catch (err: any) {
      errors++;
      console.error(`[JustDial] Failed: ${combo.category}/${combo.city} — ${err.message}`);
      await logScraperEvent('error', SCRAPER_NAME, `JD scrape failed: ${combo.category}/${combo.city}`, { error: err.message });
    }
  }

  const { inserted, updated, skipped } = await batchDeduplicateAndInsert(allLeads);
  const durationMs = Date.now() - startTime;

  await updateScraperStatus(SCRAPER_NAME, {
    is_running:      false,
    last_run_at:     new Date().toISOString(),
    last_run_status: errors > 0 ? 'partial' : 'success',
    leads_today:     inserted,
    next_run_at:     new Date(Date.now() + 12 * 3600000).toISOString(),
  });

  console.log(`[JustDial] ✓ Done — ${inserted} new leads`);
  return { source: SCRAPER_NAME, leadsFound: allLeads.length, leadsInserted: inserted, leadsDuped: skipped, errors, durationMs };
}

async function scrapeJustDialPage(category: string, city: string): Promise<ScrapedLead[]> {
  const proxy   = getRotatingProxy();
  const browser = await chromium.launch({
    headless: true,
    proxy,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    locale:    'en-IN',
  });

  const leads: ScrapedLead[] = [];

  try {
    const page = await context.newPage();
    recordRequest(SCRAPER_NAME);

    const url = `https://www.justdial.com/${city}/${category}/nct-10215852`;
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

    if (response?.status() === 403) {
      await recordBlock(SCRAPER_NAME);
      throw new Error('Blocked by JustDial (403)');
    }

    await randomDelay(2000, 4000);

    // JustDial loads results in a list
    const listings = await page.$$('[class*="resultbox"], [class*="store-details"], .cntanr');

    for (const listing of listings.slice(0, 20)) {
      try {
        const name    = await listing.$eval('[class*="store-name"], .fn, h2', (el: Element) => el.textContent?.trim()).catch(() => null);
        const phone   = await listing.$eval('[class*="contact-info"] a[href^="tel"], .callcontent', (el: Element) => el.textContent?.trim()).catch(() => null);
        const address = await listing.$eval('[class*="address"], .addr', (el: Element) => el.textContent?.trim()).catch(() => null);
        const url2    = await listing.$eval('a.store-name, a[class*="title"]', (el: Element) => (el as HTMLAnchorElement).href).catch(() => null);

        if (!name) continue;

        leads.push({
          company_name:     name,
          owner_name:       null,
          phone:            phone ?? null,
          email:            null,
          city:             city.charAt(0).toUpperCase() + city.slice(1),
          state:            null,
          industry:         classifyIndustry(`${category} ${name}`),
          source:           'justdial',
          source_url:       url2 ?? url,
          instagram_handle: null,
          facebook_profile: null,
          raw_data:         { category, city, address, scraped_at: new Date().toISOString() },
        });
      } catch { /* skip malformed */ }
    }
  } finally {
    await browser.close();
  }

  return leads;
}

if (require.main === module) {
  runJustDialScraper().then(r => { console.log(r); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}
