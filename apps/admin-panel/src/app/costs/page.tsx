'use client';
import { useEffect, useState } from 'react';
import { analyticsApi } from '../../lib/api';

// Monthly fixed/estimated costs in USD
const FIXED_COSTS = [
  { service: 'Railway (Scrapers + Queue)',   usd: 20,  icon: '🚂', type: 'infra' },
  { service: 'Vercel (Frontend)',            usd: 0,   icon: '▲',  type: 'infra', note: 'Free tier' },
  { service: 'Upstash Redis',               usd: 10,  icon: '⚡', type: 'infra' },
  { service: 'Bright Data Proxies',         usd: 50,  icon: '🌐', type: 'scraping' },
  { service: 'Apify (Instagram + FB)',      usd: 49,  icon: '🕷', type: 'scraping' },
  { service: 'Resend Email',                usd: 0,   icon: '📧', type: 'messaging', note: 'Free 3k/mo' },
  { service: 'Calendly',                    usd: 10,  icon: '📅', type: 'messaging' },
  { service: 'AiSensy / WATI (WhatsApp)',   usd: 29,  icon: '📱', type: 'messaging' },
  { service: 'Supabase',                    usd: 25,  icon: '🗄', type: 'infra', note: 'Pro plan' },
];

const TYPE_COLORS: Record<string, string> = {
  infra: '#60A5FA', scraping: '#C084FC', messaging: '#4ADE80', ai: '#FF6B35',
};

export default function CostsPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    analyticsApi.get('30d').then(d => { setAnalytics(d); setLoading(false); });
  }, []);

  const apiCosts = analytics?.costs?.byModel ?? {};
  const totalApiUsd = analytics?.costs?.totalUsd ?? 0;
  const meetings = (analytics?.funnel?.meeting_booked ?? 0) + (analytics?.funnel?.converted ?? 0);

  const fixedTotal = FIXED_COSTS.reduce((sum, c) => sum + c.usd, 0);
  const grandTotal = fixedTotal + totalApiUsd;
  const costPerMeeting = meetings > 0 ? (grandTotal / meetings).toFixed(2) : '—';

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Cost Tracker</h1><p className="page-sub">Monthly spend breakdown — last 30 days</p></div>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Fixed Costs / mo',  value: `$${fixedTotal}`,              color: '#60A5FA' },
          { label: 'AI API Costs',      value: `$${totalApiUsd.toFixed(2)}`,  color: '#FF6B35' },
          { label: 'Total Spend / mo',  value: `$${grandTotal.toFixed(2)}`,   color: '#E8E6F0' },
          { label: 'Cost per Meeting',  value: `$${costPerMeeting}`,          color: '#4ADE80' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-value" style={{ color: s.color, fontSize: 28 }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Fixed costs table */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1E1E2E' }}>
            <p className="section-title" style={{ margin: 0 }}>Fixed / Infrastructure Costs</p>
          </div>
          <table className="hsm-table">
            <thead><tr><th>Service</th><th>Type</th><th>$/mo</th></tr></thead>
            <tbody>
              {FIXED_COSTS.map(c => (
                <tr key={c.service}>
                  <td>
                    <span style={{ marginRight: 6 }}>{c.icon}</span>
                    {c.service}
                    {c.note && <span style={{ fontSize: 10, color: '#6B6888', fontFamily: 'JetBrains Mono', marginLeft: 6 }}>{c.note}</span>}
                  </td>
                  <td><span className="badge" style={{ background: `${TYPE_COLORS[c.type]}22`, color: TYPE_COLORS[c.type], border: `1px solid ${TYPE_COLORS[c.type]}44` }}>{c.type}</span></td>
                  <td className="mono" style={{ color: c.usd === 0 ? '#4ADE80' : '#E8E6F0' }}>${c.usd}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #2A2A3E' }}>
                <td colSpan={2} style={{ fontWeight: 600, color: '#E8E6F0' }}>Total Fixed</td>
                <td className="mono" style={{ fontWeight: 700, color: '#60A5FA', fontSize: 15 }}>${fixedTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* AI API costs */}
        <div>
          <div className="card" style={{ padding: 0, marginBottom: 16 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1E1E2E' }}>
              <p className="section-title" style={{ margin: 0 }}>AI API Costs (Variable)</p>
            </div>
            <table className="hsm-table">
              <thead><tr><th>Model</th><th>Spend</th><th>% of AI</th></tr></thead>
              <tbody>
                {Object.entries(apiCosts).length === 0 ? (
                  <tr><td colSpan={3} style={{ color: '#6B6888', fontSize: 12 }}>No data yet — conversations will populate this</td></tr>
                ) : Object.entries(apiCosts).map(([model, cost]: [string, any]) => (
                  <tr key={model}>
                    <td className="mono" style={{ fontSize: 12 }}>{model}</td>
                    <td className="mono" style={{ color: '#FF6B35' }}>${Number(cost).toFixed(4)}</td>
                    <td style={{ fontSize: 12, color: '#9CA3AF' }}>
                      {totalApiUsd > 0 ? `${((cost / totalApiUsd) * 100).toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #2A2A3E' }}>
                  <td style={{ fontWeight: 600, color: '#E8E6F0' }}>Total AI</td>
                  <td className="mono" style={{ fontWeight: 700, color: '#FF6B35' }}>${totalApiUsd.toFixed(4)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ROI box */}
          <div className="card" style={{ background: '#0D2A1A', borderColor: '#166534' }}>
            <p className="section-title" style={{ color: '#4ADE80' }}>ROI Estimate</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono', marginBottom: 4 }}>AVG DEAL VALUE</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#4ADE80' }}>₹85,000</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono', marginBottom: 4 }}>MEETINGS / MONTH</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#4ADE80' }}>{meetings}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono', marginBottom: 4 }}>EST. PIPELINE</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#4ADE80' }}>₹{(meetings * 85000).toLocaleString('en-IN')}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono', marginBottom: 4 }}>HSM TOTAL COST</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#FCD34D' }}>${grandTotal.toFixed(0)} ≈ ₹{(grandTotal * 84).toFixed(0)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
