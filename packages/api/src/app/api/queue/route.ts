// GET /api/queue — BullMQ queue stats + daily WA usage
import { NextRequest } from 'next/server';
import { supabase, requireAuth, ok, err, serverErr } from '../../lib/utils';

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    // Today's message counts
    const today = new Date(); today.setHours(0,0,0,0);

    const { count: sentToday } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .eq('channel', 'whatsapp')
      .gte('created_at', today.toISOString());

    const { count: failedToday } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .eq('status', 'failed')
      .gte('created_at', today.toISOString());

    // This week
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
    const { count: sentWeek } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .gte('created_at', weekStart.toISOString());

    // Failed jobs from system_logs
    const { data: failedJobs } = await supabase
      .from('system_logs')
      .select('message, metadata, created_at')
      .eq('level', 'error')
      .eq('source', 'queue')
      .order('created_at', { ascending: false })
      .limit(10);

    // Queue stats from queue service (if available)
    let bullmqStats = null;
    const queueUrl = process.env.QUEUE_SERVICE_URL;
    if (queueUrl) {
      const res = await fetch(`${queueUrl}/stats`, {
        headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_SECRET}` },
      }).catch(() => null);
      if (res?.ok) bullmqStats = await res.json().catch(() => null);
    }

    return ok({
      whatsapp: {
        sentToday:   sentToday ?? 0,
        dailyLimit:  500,
        remaining:   500 - (sentToday ?? 0),
        failedToday: failedToday ?? 0,
        sentThisWeek: sentWeek ?? 0,
        utilizationPct: Math.round(((sentToday ?? 0) / 500) * 100),
      },
      bullmq:     bullmqStats,
      failedJobs: failedJobs ?? [],
    });
  } catch (e) {
    return serverErr(e);
  }
}
