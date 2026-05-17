'use client';
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { api } from '../../lib/api';

const COLORS = ['#C4622D', '#1D4E89', '#2A6049', '#92651A', '#6B3FA0', '#9B2335'];

export default function AnalyticsPage() {
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range,   setRange]   = useState('30d');

  useEffect(() => {
    setLoading(true);
    api.analytics(range).then(d => { setData(d); setLoading(false); });
  }, [range]);

  if (loading) return <div className="page" style={{ color: '#9E9890', fontSize: 14 }}>Loading analytics...</div>;

  const funnel   = data?.funnel ?? {};
  const revenue  = data?.revenue ?? {};
  const cr       = data?.conversionRates ?? {};
  const target   = data?.monthlyTarget ?? {};
  const costs    = data?.costs ?? {};

  // Funnel chart data
  const funnelData = [
    { stage: 'New',      count: funnel.new            ?? 0 },
    { stage: 'Contacted',count: funnel.contacted      ?? 0 },
    { stage: 'Replied',  count: funnel.replied        ?? 0 },
    { stage: 'Interested',count: funnel.interested    ?? 0 },
    { stage: 'Meeting',  count: funnel.meeting_booked ?? 0 },
    { stage: 'Converted',count: funnel.converted      ?? 0 },
  ];

  // Source pie data
  const sourceData = Object.entries(data?.sourceBreakdown ?? {}).map(([name, value]) => ({
    name: name.replace(/_/g, ' '), value: value as number,
  }));

  // Industry bar data
  const industryData = Object.entries(data?.industryBreakdown ?? {}).map(([name, value]) => ({
    name: name.replace(/_/g, ' ').slice(0, 12), value: value as number,
  }));

  // Language data
  const langData = Object.entries(data?.languageBreakdown ?? {}).map(([name, value]) => ({
    name, value: value as number,
  }));

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Analytics</h1>
            <p className="page-sub">Conversion funnel, revenue impact & source performance</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['7d','30d','90d'].map(r => (
              <button key={r} className={`btn btn-sm ${range === r ? 'btn-accent' : 'btn-outline'}`} onClick={() => setRange(r)}>
                {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 32 }}>
        {[
          { label: 'Reply Rate',    value: `${cr.replyRatePct ?? 0}%`,   sub: 'leads that reply',       accent: true },
          { label: 'Meeting Rate',  value: `${cr.meetingRatePct ?? 0}%`, sub: 'contacts → meetings',    accent: true },
          { label: 'Close Rate',    value: `${cr.closeRatePct ?? 0}%`,   sub: 'meetings → deals',       accent: false },
          { label: 'Pipeline (INR)',value: `₹${((revenue.pipeline ?? 0) / 100000).toFixed(1)}L`, sub: `${revenue.wonDeals ?? 0} deals won`, accent: false },
        ].map(m => (
          <div key={m.label} className="card">
            <div className="stat-val" style={{ color: m.accent ? '#C4622D' : '#1A1714', fontSize: 32 }}>{m.value}</div>
            <div className="stat-lbl">{m.label}</div>
            <div className="stat-sub">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Monthly target progress */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Monthly Target Progress</div>
          <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 20, color: '#C4622D' }}>
            {target.achieved ?? 0} / {target.target ?? 8} meetings
          </span>
        </div>
        <div className="progress-bar" style={{ height: 12 }}>
          <div className="progress-fill" style={{
            width: `${Math.min(target.progressPct ?? 0, 100)}%`,
            background: (target.progressPct ?? 0) >= 100 ? '#2A6049' : '#C4622D',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: '#9E9890' }}>
          <span>Goal: 7–8 meetings/month</span>
          <span>{target.progressPct ?? 0}% complete</span>
        </div>
      </div>

      {/* Charts row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 24, marginBottom: 24 }}>
        {/* Funnel bar chart */}
        <div className="card">
          <div className="section-title" style={{ marginBottom: 4 }}>Conversion Funnel</div>
          <div className="section-sub" style={{ marginBottom: 20 }}>Leads at each stage</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={funnelData} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E3DA" vertical={false} />
              <XAxis dataKey="stage" tick={{ fontSize: 11, fill: '#9E9890' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9E9890' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E8E3DA', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" radius={[4,4,0,0]}>
                {funnelData.map((_, i) => (
                  <Cell key={i} fill={['#D4CFC5','#1D4E89','#6B3FA0','#92651A','#C4622D','#2A6049'][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Source pie */}
        <div className="card">
          <div className="section-title" style={{ marginBottom: 4 }}>Lead Sources</div>
          <div className="section-sub" style={{ marginBottom: 16 }}>Where leads come from</div>
          {sourceData.length === 0 ? (
            <div style={{ color: '#9E9890', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>No data yet</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={sourceData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={3}>
                    {sourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E8E3DA', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sourceData.map((s, i) => (
                  <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#6B6560' }}>{s.name}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1714', fontFamily: 'JetBrains Mono, monospace' }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        {/* Industry breakdown */}
        <div className="card">
          <div className="section-title" style={{ marginBottom: 4 }}>By Industry</div>
          <div className="section-sub" style={{ marginBottom: 20 }}>Which industries respond most</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={industryData} layout="vertical" barSize={14}>
              <XAxis type="number" tick={{ fontSize: 11, fill: '#9E9890' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6B6560' }} axisLine={false} tickLine={false} width={100} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E8E3DA', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="value" fill="#C4622D" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Language breakdown */}
        <div className="card">
          <div className="section-title" style={{ marginBottom: 4 }}>Language Distribution</div>
          <div className="section-sub" style={{ marginBottom: 20 }}>How leads communicate</div>
          {langData.length === 0 ? (
            <div style={{ color: '#9E9890', fontSize: 13, textAlign: 'center', padding: '60px 0' }}>No language data yet</div>
          ) : langData.map((l, i) => {
            const total = langData.reduce((s, x) => s + x.value, 0);
            const pct   = total > 0 ? Math.round((l.value / total) * 100) : 0;
            return (
              <div key={l.name} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: '#6B6560', textTransform: 'capitalize' }}>{l.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1714', fontFamily: 'JetBrains Mono, monospace' }}>{l.value} ({pct}%)</span>
                </div>
                <div className="progress-bar" style={{ height: 6 }}>
                  <div className="progress-fill" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cost efficiency */}
      <div className="card" style={{ background: '#FBF5F0', borderColor: '#E8C4A8' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
          {[
            { label: 'Total AI Cost',    value: `$${(costs.totalUsd ?? 0).toFixed(2)}`,    sub: `last ${range}` },
            { label: 'Cost per Meeting', value: `$${costs.perMeeting ?? '0'}`,               sub: 'AI cost only' },
            { label: 'Claude (Sonnet)',  value: `$${(costs.byModel?.['claude-3-5-sonnet'] ?? 0).toFixed(3)}`, sub: 'closing convos' },
            { label: 'GPT-4o Mini',     value: `$${(costs.byModel?.['gpt-4o-mini'] ?? 0).toFixed(3)}`,        sub: 'outreach msgs' },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, color: '#C4622D' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#9E9890', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>{s.label}</div>
              <div style={{ fontSize: 12, color: '#6B6560', marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
