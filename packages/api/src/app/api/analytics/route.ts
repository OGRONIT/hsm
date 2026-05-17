// GET /api/analytics — Full analytics for Hariii Portal dashboard
import { NextRequest } from 'next/server';
import { supabase, requireAuth, ok, err, serverErr } from '../../lib/utils';

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    const url   = new URL(req.url);
    const range = url.searchParams.get('range') ?? '30d'; // 7d | 30d | 90d

    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);

    // ── Funnel counts ─────────────────────────────────────────
    const statuses = ['new','contacted','replied','interested','meeting_booked','converted','dead'];
    const funnelPromises = statuses.map(status =>
      supabase.from('leads').select('*', { count: 'exact', head: true })
        .eq('status', status).then(({ count }) => ({ status, count: count ?? 0 }))
    );
    const funnelResults = await Promise.all(funnelPromises);
    const funnel = Object.fromEntries(funnelResults.map(r => [r.status, r.count]));

    // ── Source breakdown ──────────────────────────────────────
    const { data: sourceData } = await supabase
      .from('leads').select('source').gte('created_at', since);
    const sourceMap: Record<string, number> = {};
    (sourceData ?? []).forEach(r => { sourceMap[r.source] = (sourceMap[r.source] ?? 0) + 1; });

    // ── Industry breakdown ────────────────────────────────────
    const { data: industryData } = await supabase
      .from('leads').select('industry').gte('created_at', since);
    const industryMap: Record<string, number> = {};
    (industryData ?? []).forEach(r => { industryMap[r.industry] = (industryMap[r.industry] ?? 0) + 1; });

    // ── Language breakdown ────────────────────────────────────
    const { data: langData } = await supabase
      .from('leads').select('language_detected').not('language_detected', 'is', null);
    const langMap: Record<string, number> = {};
    (langData ?? []).forEach(r => { langMap[r.language_detected] = (langMap[r.language_detected] ?? 0) + 1; });

    // ── Revenue metrics ───────────────────────────────────────
    const { data: dealsData } = await supabase
      .from('meetings')
      .select('deal_value, outcome, scheduled_at')
      .not('deal_value', 'is', null);

    const wonDeals = (dealsData ?? []).filter(d => d.outcome === 'deal_won');
    const pipeline = (dealsData ?? []).filter(d => d.outcome === null || d.outcome === 'follow_up');

    const revenueWon      = wonDeals.reduce((sum, d) => sum + (d.deal_value ?? 0), 0);
    const revenuePipeline = pipeline.reduce((sum, d) => sum + (d.deal_value ?? 0), 0);

    // ── Monthly meetings target (goal: 7-8 deals/month) ──────
    const { count: meetingsThisMonth } = await supabase
      .from('meetings').select('*', { count: 'exact', head: true })
      .gte('created_at', monthStart.toISOString())
      .in('status', ['confirmed', 'completed']);

    const MONTHLY_MEETING_TARGET = 8;
    const targetProgress = Math.round(((meetingsThisMonth ?? 0) / MONTHLY_MEETING_TARGET) * 100);

    // ── API cost breakdown ────────────────────────────────────
    const { data: costData } = await supabase
      .from('conversations')
      .select('ai_model_used, cost_usd')
      .gte('created_at', since)
      .not('cost_usd', 'is', null);

    const costByModel: Record<string, number> = {};
    (costData ?? []).forEach(r => {
      if (r.ai_model_used) {
        costByModel[r.ai_model_used] = (costByModel[r.ai_model_used] ?? 0) + (r.cost_usd ?? 0);
      }
    });
    const totalApiCost = Object.values(costByModel).reduce((a, b) => a + b, 0);

    // ── Conversion rates ──────────────────────────────────────
    const totalContacted = funnel.contacted + funnel.replied + funnel.interested + funnel.meeting_booked + funnel.converted;
    const replyRate      = totalContacted > 0 ? ((funnel.replied + funnel.interested + funnel.meeting_booked + funnel.converted) / totalContacted * 100).toFixed(1) : '0';
    const meetingRate    = totalContacted > 0 ? (((funnel.meeting_booked + funnel.converted) / totalContacted) * 100).toFixed(1) : '0';
    const closeRate      = (funnel.meeting_booked + funnel.converted) > 0 ? ((funnel.converted / (funnel.meeting_booked + funnel.converted)) * 100).toFixed(1) : '0';

    return ok({
      range,
      funnel,
      sourceBreakdown:   sourceMap,
      industryBreakdown: industryMap,
      languageBreakdown: langMap,
      revenue: {
        won:       revenueWon,
        pipeline:  revenuePipeline,
        total:     revenueWon + revenuePipeline,
        wonDeals:  wonDeals.length,
        currency:  'INR',
      },
      monthlyTarget: {
        target:           MONTHLY_MEETING_TARGET,
        achieved:         meetingsThisMonth ?? 0,
        progressPct:      Math.min(targetProgress, 100),
      },
      conversionRates: {
        replyRatePct:   replyRate,
        meetingRatePct: meetingRate,
        closeRatePct:   closeRate,
      },
      costs: {
        byModel:    costByModel,
        totalUsd:   totalApiCost,
        perMeeting: (funnel.meeting_booked + funnel.converted) > 0
          ? (totalApiCost / (funnel.meeting_booked + funnel.converted)).toFixed(4)
          : '0',
      },
    });
  } catch (e) {
    return serverErr(e);
  }
}
