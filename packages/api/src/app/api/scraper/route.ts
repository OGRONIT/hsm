// ─────────────────────────────────────────────────────────────
// POST /api/scraper — Start / Stop / Force-run scrapers
// GET  /api/scraper — Status of all scrapers
// ─────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server';
import { supabase, requireAuth, ok, err, serverErr } from '../../lib/utils';
import { z } from 'zod';

const ActionSchema = z.object({
  action:  z.enum(['start', 'stop', 'force_run', 'enable', 'disable']),
  scraper: z.enum(['indiamart', 'google_maps', 'justdial', 'linkedin', 'instagram', 'facebook_groups', 'all']),
});

// ─── GET — all scraper statuses ───────────────────────────────
export async function GET(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    const { data, error } = await supabase
      .from('scraper_status')
      .select('*')
      .order('scraper_name');

    if (error) return err(error.message);

    // Add today's lead counts
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: todayCounts } = await supabase
      .from('leads')
      .select('source')
      .gte('created_at', today.toISOString());

    const countMap: Record<string, number> = {};
    (todayCounts ?? []).forEach(r => {
      countMap[r.source] = (countMap[r.source] ?? 0) + 1;
    });

    const scrapers = (data ?? []).map(s => ({
      ...s,
      leads_today_actual: countMap[s.scraper_name] ?? 0,
    }));

    return ok({ scrapers });
  } catch (e) {
    return serverErr(e);
  }
}

// ─── POST — control scrapers ──────────────────────────────────
export async function POST(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    const body   = await req.json();
    const parsed = ActionSchema.safeParse(body);
    if (!parsed.success) return err(parsed.error.message);

    const { action, scraper } = parsed.data;
    const targetScrapers = scraper === 'all'
      ? ['indiamart', 'google_maps', 'justdial', 'linkedin', 'instagram', 'facebook_groups']
      : [scraper];

    switch (action) {
      case 'enable':
      case 'disable':
        await supabase
          .from('scraper_status')
          .update({ is_enabled: action === 'enable' })
          .in('scraper_name', targetScrapers);

        await supabase.from('system_logs').insert({
          level:    'info',
          source:   'api',
          message:  `Scrapers ${action}d via admin panel: ${targetScrapers.join(', ')}`,
          metadata: { action, scrapers: targetScrapers },
        });
        return ok({ message: `Scrapers ${action}d: ${targetScrapers.join(', ')}` });

      case 'stop':
        await supabase
          .from('scraper_status')
          .update({ is_running: false, is_enabled: false })
          .in('scraper_name', targetScrapers);
        return ok({ message: `Scrapers stopped: ${targetScrapers.join(', ')}` });

      case 'force_run':
      case 'start':
        // Fire scraper run via internal API call to Railway scraper service
        // In production this calls the Railway scraper service endpoint
        const scraperServiceUrl = process.env.SCRAPER_SERVICE_URL;
        if (!scraperServiceUrl) {
          return err('SCRAPER_SERVICE_URL not configured — cannot trigger remote run');
        }

        const triggerRes = await fetch(`${scraperServiceUrl}/run`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_SECRET}`,
          },
          body: JSON.stringify({ scrapers: targetScrapers }),
        });

        if (!triggerRes.ok) {
          const errData = await triggerRes.json().catch(() => ({}));
          return err(`Scraper service error: ${errData.error ?? triggerRes.statusText}`);
        }

        await supabase.from('system_logs').insert({
          level:    'info',
          source:   'api',
          message:  `Manual scraper run triggered: ${targetScrapers.join(', ')}`,
          metadata: { action, scrapers: targetScrapers },
        });

        return ok({ message: `Scraper run triggered: ${targetScrapers.join(', ')}` });

      default:
        return err('Unknown action');
    }
  } catch (e) {
    return serverErr(e);
  }
}
