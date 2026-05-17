// ─────────────────────────────────────────────────────────────
// HSM Scrapers — Main Orchestrator + Cron Scheduler
// Runs all scrapers on schedule, manages concurrency
// ─────────────────────────────────────────────────────────────

import 'dotenv/config';
import cron from 'node-cron';
import { runIndiaMartScraper }       from './sources/indiamart';
import { runGoogleMapsScraper }      from './sources/google-maps';
import { runJustDialScraper }        from './sources/justdial';
import { runInstagramScraper }       from './sources/instagram';
import { runFacebookGroupsScraper }  from './sources/facebook-groups';
import { runLinkedInScraper }        from './sources/linkedin';
import { updateScraperStatus, logScraperEvent } from './utils/types';
import { alertBanRisk }              from '@hsm/alerts';
import { getBanRiskPercent }         from './proxy/manager';

export type ScraperName = 'indiamart' | 'google_maps' | 'justdial' | 'instagram' | 'facebook_groups' | 'linkedin';

const SCRAPERS: Record<ScraperName, () => Promise<any>> = {
  indiamart:       runIndiaMartScraper,
  google_maps:     runGoogleMapsScraper,
  justdial:        runJustDialScraper,
  instagram:       runInstagramScraper,
  facebook_groups: runFacebookGroupsScraper,
  linkedin:        runLinkedInScraper,
};

// ─────────────────────────────────────────────────────────────
// Run a single scraper safely (catches errors, updates status)
// ─────────────────────────────────────────────────────────────
export async function runScraper(name: ScraperName): Promise<void> {
  console.log(`[Orchestrator] Starting scraper: ${name}`);
  try {
    await SCRAPERS[name]();

    // Check ban risk after every scraper run
    const banRisk = getBanRiskPercent();
    if (banRisk > 50) {
      await alertBanRisk({
        scraperName: name,
        blockRate:   banRisk,
        action:      banRisk > 80
          ? 'CRITICAL — all scrapers paused, check proxy dashboard'
          : 'Rotating proxies, reducing request rate',
      });
    }
  } catch (err: any) {
    console.error(`[Orchestrator] Scraper ${name} crashed:`, err.message);
    await updateScraperStatus(name, {
      is_running:      false,
      last_run_status: 'error',
      error_message:   err.message,
    });
    await logScraperEvent('error', name, `Scraper ${name} crashed: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Start all cron jobs
// ─────────────────────────────────────────────────────────────
export function startScraperScheduler(): void {
  console.log('[ScraperScheduler] Starting all scraper crons...');

  // IndiaMart — every 6 hours (4x/day)
  cron.schedule('0 */6 * * *', () => runScraper('indiamart'));

  // Google Maps — every 12 hours (2x/day)
  cron.schedule('30 */12 * * *', () => runScraper('google_maps'));

  // JustDial — every 12 hours
  cron.schedule('0 6,18 * * *', () => runScraper('justdial'));

  // Instagram — every 6 hours
  cron.schedule('0 2,8,14,20 * * *', () => runScraper('instagram'));

  // Facebook Groups — every 8 hours
  cron.schedule('0 4,12,20 * * *', () => runScraper('facebook_groups'));

  // LinkedIn — once per day (most rate-limited)
  cron.schedule('0 9 * * *', () => runScraper('linkedin'));

  console.log('[ScraperScheduler] ✓ All scrapers scheduled:');
  console.log('  • IndiaMart:    Every 6h');
  console.log('  • Google Maps:  Every 12h');
  console.log('  • JustDial:     6am + 6pm');
  console.log('  • Instagram:    Every 6h');
  console.log('  • Facebook:     Every 8h');
  console.log('  • LinkedIn:     9am daily');
}

// ─────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('[HSM Scrapers] Starting scraper service...');

  // Run all scrapers once on startup (fill the pipeline immediately)
  console.log('[HSM Scrapers] Running initial scrape on all sources...');
  for (const name of Object.keys(SCRAPERS) as ScraperName[]) {
    await runScraper(name);
  }

  // Then schedule recurring runs
  startScraperScheduler();
  console.log('[HSM Scrapers] Scheduler running 24/7');

  process.on('SIGTERM', () => { console.log('[HSM Scrapers] Shutting down'); process.exit(0); });
  process.on('SIGINT',  () => { console.log('[HSM Scrapers] Shutting down'); process.exit(0); });
}

main().catch(err => { console.error('[HSM Scrapers] Fatal:', err); process.exit(1); });
