'use client';
import { useEffect, useState } from 'react';
import { analyticsApi, scraperApi, queueApi, botApi } from '../lib/api';

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [scrapers,  setScrapers]  = useState<any[]>([]);
  const [queue,     setQueue]     = useState<any>(null);
  const [bot,       setBot]       = useState<any>(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      analyticsApi.get('7d'),
      scraperApi.status(),
      queueApi.stats(),
      botApi.status(),
    ]).then(([a, s, q, b]) => {
      setAnalytics(a);
      setScrapers(s.scrapers ?? []);
      setQueue(q);
      setBot(b);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page" style={{ color: '#6B6888', fontFamily: 'JetBrains Mono', fontSize: 13 }}>Loading dashboard...</div>;

  const funnel: Record<string, number> = analytics?.funnel ?? {};
  const totalLeads = Object.values(funnel).reduce((sum, value) => sum + Number(value), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">HSM Dashboard</h1>
          <p className="page-sub">Hariii Sales Machine — Real-time overview</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#6B6888', fontFamily: 'JetBrains Mono' }}>
            {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST
          </span>
          {bot?.isPaused
            ? <span className="badge badge-red">● Bot Paused</span>
            : <span className="badge badge-green">● Bot Active</span>
          }
        </div>
      </div>

      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Leads', value: totalLeads, delta: `+${funnel.new ?? 0} new`, up: true },
          { label: 'Meetings Booked', value: funnel.meeting_booked ?? 0, delta: `${analytics?.monthlyTarget?.achieved ?? 0}/${analytics?.monthlyTarget?.target ?? 8} this month`, up: true },
          { label: 'WA Sent Today', value: queue?.whatsapp?.sentToday ?? 0, delta: `${queue?.whatsapp?.remaining ?? 500} remaining`, up: false },
          { label: 'Conversion Rate', value: `${analytics?.conversionRates?.meetingRatePct ?? 0}%`, delta: 'lead → meeting', up: true },
        ].map(stat => (
          <div key={stat.label} className="stat-card">
            <div className="stat-value">{stat.value}</div>
            <div className="stat-label">{stat.label}</div>
            <div className={`stat-delta ${stat.up ? 'up' : ''}`}>{stat.delta}</div>
          </div>
        ))}
      </div>

      {/* Funnel + Scraper status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Lead Funnel */}
        <div className="card">
          <p className="section-title">Lead Funnel</p>
          {[
            { label: 'New',            value: funnel.new           ?? 0, color: '#6B6888' },
            { label: 'Contacted',      value: funnel.contacted     ?? 0, color: '#60A5FA' },
            { label: 'Replied',        value: funnel.replied       ?? 0, color: '#C084FC' },
            { label: 'Interested',     value: funnel.interested    ?? 0, color: '#FCD34D' },
            { label: 'Meeting Booked', value: funnel.meeting_booked?? 0, color: '#FF6B35' },
            { label: 'Converted',      value: funnel.converted     ?? 0, color: '#4ADE80' },
          ].map(stage => (
            <div key={stage.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ width: 100, fontSize: 12, color: '#6B6888', fontFamily: 'JetBrains Mono' }}>{stage.label}</div>
              <div style={{ flex: 1, height: 6, background: '#1E1E2E', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: stage.color, borderRadius: 3, width: `${Math.min(100, (stage.value / Math.max(totalLeads, 1)) * 100)}%`, transition: 'width 0.5s' }} />
              </div>
              <div style={{ width: 40, textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#E8E6F0', fontFamily: 'JetBrains Mono' }}>{stage.value}</div>
            </div>
          ))}
        </div>

        {/* Scraper Status */}
        <div className="card">
          <p className="section-title">Scraper Status</p>
          <table className="hsm-table">
            <thead><tr><th>Source</th><th>Status</th><th>Today</th><th>Last Run</th></tr></thead>
            <tbody>
              {scrapers.map((s: any) => (
                <tr key={s.scraper_name}>
                  <td className="mono" style={{ fontSize: 12 }}>{s.scraper_name}</td>
                  <td>
                    {s.is_running
                      ? <span className="badge badge-blue">Running</span>
                      : s.last_run_status === 'error'
                      ? <span className="badge badge-red">Error</span>
                      : s.last_run_status === 'success'
                      ? <span className="badge badge-green">OK</span>
                      : <span className="badge badge-gray">Idle</span>
                    }
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{s.leads_today_actual ?? 0}</td>
                  <td style={{ fontSize: 11, color: '#6B6888' }}>
                    {s.last_run_at ? new Date(s.last_run_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Queue + Monthly target */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* WA Rate Limit */}
        <div className="card">
          <p className="section-title">WhatsApp Daily Limit</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#9CA3AF' }}>{queue?.whatsapp?.sentToday ?? 0} / 500 sent</span>
            <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono', color: '#E8E6F0' }}>{queue?.whatsapp?.utilizationPct ?? 0}%</span>
          </div>
          <div style={{ height: 10, background: '#1E1E2E', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 5, transition: 'width 0.5s',
              width: `${queue?.whatsapp?.utilizationPct ?? 0}%`,
              background: (queue?.whatsapp?.utilizationPct ?? 0) > 80 ? '#F87171' : (queue?.whatsapp?.utilizationPct ?? 0) > 60 ? '#FCD34D' : '#4ADE80',
            }} />
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: '#6B6888', fontFamily: 'JetBrains Mono' }}>
            {queue?.whatsapp?.remaining ?? 500} messages remaining today
          </div>
        </div>

        {/* Monthly Target */}
        <div className="card">
          <p className="section-title">Monthly Target</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#9CA3AF' }}>
              {analytics?.monthlyTarget?.achieved ?? 0} / {analytics?.monthlyTarget?.target ?? 8} meetings
            </span>
            <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono', color: '#FF6B35' }}>
              {analytics?.monthlyTarget?.progressPct ?? 0}%
            </span>
          </div>
          <div style={{ height: 10, background: '#1E1E2E', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: '#FF6B35', borderRadius: 5,
              width: `${analytics?.monthlyTarget?.progressPct ?? 0}%`, transition: 'width 0.5s',
            }} />
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: '#6B6888', fontFamily: 'JetBrains Mono' }}>
            Goal: 7–8 meetings/month → ₹{((analytics?.monthlyTarget?.achieved ?? 0) * 85000).toLocaleString('en-IN')} est. pipeline
          </div>
        </div>
      </div>
    </div>
  );
}
