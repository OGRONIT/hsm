// ─────────────────────────────────────────────────────────────
// POST /api/bot — Pause / Resume / Kill bot globally or per lead
// GET  /api/bot — Bot status
// ─────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server';
import { supabase, requireAuth, ok, err, serverErr } from '../../../lib/utils';
import { z } from 'zod';

const BotActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pause'),  scope: z.enum(['global', 'lead']), lead_id: z.string().uuid().optional() }),
  z.object({ action: z.literal('resume'), scope: z.enum(['global', 'lead']), lead_id: z.string().uuid().optional() }),
  z.object({ action: z.literal('kill'),   scope: z.literal('lead'),          lead_id: z.string().uuid() }),
  z.object({ action: z.literal('status') }),
]);

// Bot pause state stored in Supabase system config (simple key-value via system_logs)
// In production you'd use a Redis flag — this is lightweight enough for MVP
const BOT_PAUSE_KEY = 'bot:global:paused';

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    // Check global pause state
    const { data: pauseLog } = await supabase
      .from('system_logs')
      .select('message, created_at')
      .eq('source', 'api')
      .ilike('message', 'BOT_%')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const isPaused = pauseLog?.message?.startsWith('BOT_PAUSED') ?? false;

    // Queue stats
    const queueStatsUrl = process.env.QUEUE_SERVICE_URL;
    let queueStats = null;
    if (queueStatsUrl) {
      const res = await fetch(`${queueStatsUrl}/stats`, {
        headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_SECRET}` },
      }).catch(() => null);
      if (res?.ok) queueStats = await res.json();
    }

    // Today's message count
    const today = new Date(); today.setHours(0,0,0,0);
    const { count: messagesToday } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .gte('created_at', today.toISOString());

    return ok({
      isPaused,
      pausedSince: isPaused ? pauseLog?.created_at : null,
      messagesToday: messagesToday ?? 0,
      dailyLimit: 500,
      queueStats,
    });
  } catch (e) {
    return serverErr(e);
  }
}

export async function POST(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    const body   = await req.json();
    const parsed = BotActionSchema.safeParse(body);
    if (!parsed.success) return err(parsed.error.message);

    const { action } = parsed.data;

    switch (action) {
      case 'pause': {
        const scope = parsed.data.scope;
        if (scope === 'global') {
          // Log global pause — workers check this flag
          await supabase.from('system_logs').insert({
            level: 'warn', source: 'api',
            message: `BOT_PAUSED — global pause triggered via admin panel`,
            metadata: { action: 'pause', scope: 'global', timestamp: new Date().toISOString() },
          });
          return ok({ message: 'Bot paused globally — no new messages will be sent' });
        }
        if (scope === 'lead' && parsed.data.lead_id) {
          await supabase.from('leads')
            .update({ whatsapp_opt_out: true })
            .eq('id', parsed.data.lead_id);
          return ok({ message: `Bot paused for lead ${parsed.data.lead_id}` });
        }
        return err('lead_id required for lead scope');
      }

      case 'resume': {
        await supabase.from('system_logs').insert({
          level: 'info', source: 'api',
          message: `BOT_RESUMED — global resume triggered via admin panel`,
          metadata: { action: 'resume', timestamp: new Date().toISOString() },
        });
        return ok({ message: 'Bot resumed — messages will flow normally' });
      }

      case 'kill': {
        // Mark lead as dead + opt out
        await supabase.from('leads').update({
          status: 'dead',
          whatsapp_opt_out: true,
          email_opt_out: true,
        }).eq('id', parsed.data.lead_id);

        await supabase.from('system_logs').insert({
          level: 'info', source: 'api',
          message: `Bot killed for lead ${parsed.data.lead_id} via admin panel`,
          metadata: { lead_id: parsed.data.lead_id },
        });
        return ok({ message: `Bot killed for lead — marked dead + opted out` });
      }

      default:
        return err('Unknown action');
    }
  } catch (e) {
    return serverErr(e);
  }
}
