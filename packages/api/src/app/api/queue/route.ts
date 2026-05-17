// GET /api/queue — BullMQ queue stats + daily WA usage
import { NextRequest } from 'next/server';
import { supabase, requireAuth, ok, err, serverErr } from '../../../lib/utils';
import { getBankStats } from '../../../../../queue/src/lib/message-bank';

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

    const bankStats = await getBankStats();

    return ok({
      whatsapp: {
        sentToday:   sentToday ?? 0,
        dailyLimit:  bankStats.today.fresh_allocated,
        remaining:   bankStats.remaining,
        failedToday: failedToday ?? 0,
        sentThisWeek: sentWeek ?? 0,
        utilizationPct: Math.round(((bankStats.todayUsed) / Math.max(bankStats.todayAvailable, 1)) * 100),
      },
      messageBank: {
        today_used: bankStats.todayUsed,
        today_available: bankStats.todayAvailable,
        banked: bankStats.bankedCarriedIn,
        banked_carry_out: bankStats.bankedCarriedOut,
        new_outreach_today: bankStats.newOutreachToday,
        new_outreach_limit: bankStats.newOutreachLimit,
        remaining: bankStats.remaining,
        fresh_today: bankStats.today.fresh_allocated,
      },
      bullmq:     bullmqStats,
      failedJobs: failedJobs ?? [],
    });
  } catch (e) {
    return serverErr(e);
  }
}
