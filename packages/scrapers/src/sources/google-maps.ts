// ─────────────────────────────────────────────────────────────
// HSM Scrapers — Google Maps Places API Scraper
// Uses Google Places API (Text Search + Place Details)
// Much more reliable than browser scraping for Maps
// ─────────────────────────────────────────────────────────────

import {
  ScrapedLead, ScraperRunResult, classifyIndustry,
  updateScraperStatus, logScraperEvent,
} from '../utils/types';
import { batchDeduplicateAndInsert } from '../dedup/deduplicator';
import { limiters } from '../utils/rate-limiter';

const SCRAPER_NAME = 'google_maps';
const PLACES_API   = 'https://maps.googleapis.com/maps/api/place';
const API_KEY      = process.env.GOOGLE_MAPS_API_KEY ?? '';

// Target cities for manufacturer search
const TARGET_CITIES = [
  'Ahmedabad', 'Surat', 'Rajkot', 'Vadodara', 'Gandhinagar',  // Gujarat
  'Pune', 'Mumbai', 'Nashik', 'Aurangabad',                    // Maharashtra
  'Ludhiana', 'Amritsar', 'Jalandhar',                         // Punjab
  'Delhi', 'Faridabad', 'Gurgaon', 'Noida',                   // NCR
  'Coimbatore', 'Chennai', 'Hyderabad', 'Bengaluru',           // South
];

const SEARCH_TERMS = [
  'home appliance manufacturer',
  'industrial machinery manufacturer',
  'safe locker manufacturer',
  'submersible pump manufacturer',
  'peanut sorting machine manufacturer',
  'auto parts manufacturer',
];

// ─────────────────────────────────────────────────────────────
// Main scraper
// ─────────────────────────────────────────────────────────────
export async function runGoogleMapsScraper(): Promise<ScraperRunResult> {
  const startTime  = Date.now();
  const allLeads:  ScrapedLead[] = [];
  let errors = 0;

  if (!API_KEY) {
    await logScraperEvent('error', SCRAPER_NAME, 'GOOGLE_MAPS_API_KEY not set');
    return { source: SCRAPER_NAME, leadsFound: 0, leadsInserted: 0, leadsDuped: 0, errors: 1, durationMs: 0 };
  }

  await updateScraperStatus(SCRAPER_NAME, { is_running: true, error_message: null });
  console.log(`[GoogleMaps] Starting — ${SEARCH_TERMS.length} terms × ${TARGET_CITIES.length} cities`);

  for (const city of TARGET_CITIES) {
    for (const term of SEARCH_TERMS) {
      try {
        await limiters.google_maps.throttle();
        const leads = await searchPlaces(`${term} in ${city} India`);
        allLeads.push(...leads);
        console.log(`[GoogleMaps] "${term}" in ${city} → ${leads.length} leads`);
      } catch (err: any) {
        errors++;
        await logScraperEvent('error', SCRAPER_NAME, `Search failed: ${term} in ${city}`, { error: err.message });
      }
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

  console.log(`[GoogleMaps] ✓ Done — ${inserted} new leads`);
  return { source: SCRAPER_NAME, leadsFound: allLeads.length, leadsInserted: inserted, leadsDuped: skipped, errors, durationMs };
}

// ─────────────────────────────────────────────────────────────
// Places Text Search → Place Details
// ─────────────────────────────────────────────────────────────
async function searchPlaces(query: string): Promise<ScrapedLead[]> {
  // Step 1: Text search for place IDs
  const searchUrl = new URL(`${PLACES_API}/textsearch/json`);
  searchUrl.searchParams.set('query', query);
  searchUrl.searchParams.set('type', 'establishment');
  searchUrl.searchParams.set('region', 'in');
  searchUrl.searchParams.set('key', API_KEY);

  const searchRes  = await fetch(searchUrl.toString());
  const searchData = await searchRes.json();

  if (searchData.status === 'REQUEST_DENIED') {
    throw new Error(`API key issue: ${searchData.error_message}`);
  }

  if (!searchData.results?.length) return [];

  const leads: ScrapedLead[] = [];

  // Step 2: Get details for each result (phone, website, etc.)
  for (const place of searchData.results.slice(0, 10)) {
    try {
      await limiters.google_maps.throttle();
      const detail = await getPlaceDetails(place.place_id);
      if (detail) leads.push(detail);
    } catch { /* skip */ }
  }

  return leads;
}

async function getPlaceDetails(placeId: string): Promise<ScrapedLead | null> {
  const detailUrl = new URL(`${PLACES_API}/details/json`);
  detailUrl.searchParams.set('place_id', placeId);
  detailUrl.searchParams.set('fields', 'name,formatted_phone_number,website,formatted_address,address_component,url,business_status,types,editorial_summary');
  detailUrl.searchParams.set('key', API_KEY);

  const res  = await fetch(detailUrl.toString());
  const data = await res.json();
  const p    = data.result;

  if (!p || p.business_status === 'CLOSED_PERMANENTLY') return null;

  const city  = p.address_component?.find((c: any) => c.types.includes('locality'))?.long_name ?? null;
  const state = p.address_component?.find((c: any) => c.types.includes('administrative_area_level_1'))?.long_name ?? null;

  const description = [p.name, p.editorial_summary?.overview ?? ''].join(' ');

  return {
    company_name:     p.name,
    owner_name:       null,
    phone:            p.formatted_phone_number ?? null,
    email:            null,           // Google Places API doesn't return email
    city,
    state,
    industry:         classifyIndustry(description),
    source:           'google_maps',
    source_url:       p.url ?? null,
    instagram_handle: null,
    facebook_profile: null,
    raw_data: {
      place_id:   placeId,
      website:    p.website,
      address:    p.formatted_address,
      types:      p.types,
      scraped_at: new Date().toISOString(),
    },
  };
}

if (require.main === module) {
  runGoogleMapsScraper().then(r => { console.log(r); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}
