// ─────────────────────────────────────────────────────────────
// HSM Alerts — Cron Scheduler
// Daily summary: 9pm IST every day
// Weekly report: Monday 9am IST
// Dead lead cleanup: 2am IST every day
// ─────────────────────────────────────────────────────────────

import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import { alertDailySummary, alertWeeklyReport, alertSystemError } from './telegram';
import { waAlertDailySummary } from './whatsapp';
import { format, startOfWeek, endOfWeek, subDays } from 'date-fns';
import { getBankStats, runMidnightBankRollover } from '../../queue/src/lib/message-bank';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─────────────────────────────────────────────────────────────
// Start all alert cron jobs
// ─────────────────────────────────────────────────────────────
export function startAlertScheduler(): void {
  console.log('[AlertScheduler] Starting cron jobs...');

  // Daily summary — 9pm IST = 3:30pm UTC
  cron.schedule('30 15 * * *', async () => {
    console.log('[AlertScheduler] Running daily summary...');
    await runDailySummary();
  }, { timezone: 'UTC' });

  // Weekly report — Monday 9am IST = Monday 3:30am UTC
  cron.schedule('30 3 * * 1', async () => {
    console.log('[AlertScheduler] Running weekly report...');
    await runWeeklyReport();
  }, { timezone: 'UTC' });

  // Dead lead cleanup — 2am IST = 8:30pm UTC previous day
  cron.schedule('30 20 * * *', async () => {
    console.log('[AlertScheduler] Running dead lead cleanup...');
    await runDeadLeadCleanup();
  }, { timezone: 'UTC' });

  // Message bank rollover — 00:01 IST = 18:31 UTC previous day
  cron.schedule('31 18 * * *', async () => {
    console.log('[AlertScheduler] Running message bank rollover...');
    await runMessageBankRollover();
  }, { timezone: 'UTC' });

  // System health check — every hour
  cron.schedule('0 * * * *', async () => {
    await runHealthCheck();
  });

  console.log('[AlertScheduler] ✓ All cron jobs scheduled');
  console.log('  • Daily summary:   9:00pm IST');
  console.log('  • Weekly report:   Monday 9:00am IST');
  console.log('  • Dead cleanup:    2:00am IST');
  console.log('  • Message bank:    12:01am IST');
  console.log('  • Health check:    Every hour');
}

async function runMessageBankRollover(): Promise<void> {
  try {
    const bank = await runMidnightBankRollover();
    const stats = await getBankStats();

    await supabase.from('system_logs').insert({
      level: 'info',
      source: 'cron',
      message: 'Message bank rollover completed',
      metadata: {
        bankDate: bank.date,
        todayUsed: stats.todayUsed,
        todayAvailable: stats.todayAvailable,
        bankedCarriedIn: stats.bankedCarriedIn,
        bankedCarriedOut: stats.bankedCarriedOut,
        newOutreachToday: stats.newOutreachToday,
      },
    });

    console.log(`[AlertScheduler] ✓ Message bank rollover complete for ${bank.date}`);
  } catch (err: any) {
    console.error('[AlertScheduler] Message bank rollover failed:', err.message);
    await alertSystemError({
      type: 'Scheduler Error',
      source: 'alerts',
      message: `Message bank rollover failed: ${err.message}`,
      timestamp: new Date().toISOString(),
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Daily summary — pulls today's stats from Supabase
// ─────────────────────────────────────────────────────────────
async function runDailySummary(): Promise<void> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    // Leads scraped today
    const { count: leadsScraped } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO);

    // Messages sent today (outbound)
    const { count: messagesSent } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .gte('created_at', todayISO);

    // Replies received today (inbound)
    const { count: repliesReceived } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'inbound')
      .gte('created_at', todayISO);

    // Meetings booked today
    const { count: meetingsBooked } = await supabase
      .from('meetings')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO);

    // Hot leads today (status = interested)
    const { count: hotLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'interested')
      .gte('updated_at', todayISO);

    // Month totals
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count: monthMeetings } = await supabase
      .from('meetings')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', monthStart.toISOString());

    const { count: monthContacted } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'new')
      .gte('updated_at', monthStart.toISOString());

    const conversionRate = monthContacted && monthMeetings
      ? ((monthMeetings / monthContacted) * 100).toFixed(1)
      : '0.0';

    const summaryData = {
      date:            format(new Date(), 'dd MMM yyyy'),
      leadsScraped:    leadsScraped    ?? 0,
      messagesSent:    messagesSent    ?? 0,
      repliesReceived: repliesReceived ?? 0,
      meetingsBooked:  meetingsBooked  ?? 0,
      hotLeads:        hotLeads        ?? 0,
      monthTotal:      monthMeetings   ?? 0,
      conversionRate,
    };

    // Send both Telegram + WhatsApp
    await Promise.allSettled([
      alertDailySummary(summaryData),
      waAlertDailySummary(summaryData),
    ]);

    console.log('[AlertScheduler] ✓ Daily summary sent');
  } catch (err: any) {
    console.error('[AlertScheduler] Daily summary failed:', err.message);
    await alertSystemError({
      type:      'Scheduler Error',
      source:    'alerts',
      message:   `Daily summary failed: ${err.message}`,
      timestamp: new Date().toISOString(),
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Weekly report
// ─────────────────────────────────────────────────────────────
async function runWeeklyReport(): Promise<void> {
  try {
    const now       = new Date();
    const weekStart = startOfWeek(subDays(now, 1), { weekStartsOn: 1 }); // Last Monday
    const weekEnd   = endOfWeek(weekStart, { weekStartsOn: 1 });
    const weekISO   = weekStart.toISOString();
    const weekLabel = `${format(weekStart, 'dd MMM')} – ${format(weekEnd, 'dd MMM yyyy')}`;

    // Funnel counts
    const statuses = ['new', 'contacted', 'replied', 'interested', 'meeting_booked', 'converted'];
    const funnelCounts: Record<string, number> = {};
    for (const status of statuses) {
      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', status)
        .gte('updated_at', weekISO);
      funnelCounts[status] = count ?? 0;
    }

    // Top source
    const { data: sourceCounts } = await supabase
      .from('leads')
      .select('source')
      .gte('created_at', weekISO);

    const sourceMap: Record<string, number> = {};
    (sourceCounts ?? []).forEach(r => { sourceMap[r.source] = (sourceMap[r.source] ?? 0) + 1; });
    const topSource = Object.entries(sourceMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';

    // Top industry
    const { data: industryCounts } = await supabase
      .from('leads')
      .select('industry')
      .gte('created_at', weekISO)
      .not('industry', 'is', null);

    const industryMap: Record<string, number> = {};
    (industryCounts ?? []).forEach(r => { industryMap[r.industry] = (industryMap[r.industry] ?? 0) + 1; });
    const topIndustry = Object.entries(industryMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';

    // Total API cost this week
    const { data: costData } = await supabase
      .from('conversations')
      .select('cost_usd')
      .gte('created_at', weekISO)
      .not('cost_usd', 'is', null);

    const totalCostUsd  = (costData ?? []).reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
    const meetingCount  = funnelCounts['meeting_booked'] ?? 0;
    const costPerMeeting = meetingCount > 0 ? totalCostUsd / meetingCount : 0;

    await alertWeeklyReport({
      weekLabel,
      totalLeads:     (sourceCounts ?? []).length,
      contacted:      funnelCounts['contacted']      ?? 0,
      replied:        funnelCounts['replied']         ?? 0,
      interested:     funnelCounts['interested']      ?? 0,
      meetingsBooked: meetingCount,
      converted:      funnelCounts['converted']       ?? 0,
      topSource,
      topIndustry,
      totalCostUsd,
      costPerMeeting,
    });

    console.log('[AlertScheduler] ✓ Weekly report sent');
  } catch (err: any) {
    console.error('[AlertScheduler] Weekly report failed:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Dead lead cleanup — marks stale leads as dead
// Leads with no reply after 2 followups, 3+ days ago
// ─────────────────────────────────────────────────────────────
async function runDeadLeadCleanup(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(); // 8 days ago

    // Find leads still in 'contacted' status older than 8 days (2 followups done, no reply)
    const { data: staleLeads, error } = await supabase
      .from('leads')
      .select('id, company_name')
      .eq('status', 'contacted')
      .lt('updated_at', cutoff);

    if (error) throw error;
    if (!staleLeads?.length) {
      console.log('[AlertScheduler] No stale leads to clean up');
      return;
    }

    const ids = staleLeads.map(l => l.id);
    await supabase.from('leads').update({ status: 'dead' }).in('id', ids);

    console.log(`[AlertScheduler] ✓ Marked ${ids.length} stale leads as dead`);

    await supabase.from('system_logs').insert({
      level:    'info',
      source:   'cron',
      message:  `Dead lead cleanup: ${ids.length} leads marked dead`,
      metadata: { leadIds: ids.slice(0, 20) },  // Log first 20 only
    });
  } catch (err: any) {
    console.error('[AlertScheduler] Dead lead cleanup failed:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Hourly health check — checks for critical log entries
// and fires alerts if any appeared in the last hour
// ─────────────────────────────────────────────────────────────
async function runHealthCheck(): Promise<void> {
  try {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

    const { data: criticalLogs } = await supabase
      .from('system_logs')
      .select('source, message')
      .eq('level', 'critical')
      .gte('created_at', oneHourAgo)
      .limit(5);

    if (!criticalLogs?.length) return;

    for (const log of criticalLogs) {
      await alertSystemError({
        type:      'Critical Log Entry',
        source:    log.source,
        message:   log.message,
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`[AlertScheduler] ⚠️ ${criticalLogs.length} critical logs found — alerts fired`);
  } catch {
    // Health check failure shouldn't throw
  }
}
