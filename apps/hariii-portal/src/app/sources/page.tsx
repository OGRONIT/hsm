'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const SOURCE_META: Record<string, { icon: string; label: string; color: string; description: string }> = {
  indiamart:       { icon: '🏪', label: 'IndiaMart',      color: '#C4622D', description: 'B2B manufacturer directory — highest quality leads' },
  google_maps:     { icon: '📍', label: 'Google Maps',    color: '#1D4E89', description: 'Local business listings with phone numbers' },
  justdial:        { icon: '📞', label: 'JustDial',       color: '#2A6049', description: 'Indian business directory — good for local manufacturers' },
  instagram:       { icon: '📸', label: 'Instagram',      color: '#6B3FA0', description: 'Hashtag-based discovery of manufacturer accounts' },
  facebook_groups: { icon: '👥', label: 'Facebook Groups',color: '#92651A', description: 'Manufacturer communities and B2B trade groups' },
  linkedin:        { icon: '💼', label: 'LinkedIn',       color: '#1D4E89', description: 'Professional company pages — highest quality but lower volume' },
};

export default function SourcesPage() {
  const [data,    setData]    = useState<any>(null);
  const [leads,   setLeads]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.analytics('30d'),
      api.leads({ limit: '500' }),
    ]).then(([a, l]) => {
      setData(a);
      setLeads(l.leads ?? []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="page" style={{ color: '#9E9890', fontSize: 14 }}>Loading sources...</div>;

  const sourceBreakdown = data?.sourceBreakdown ?? {};
  const total = Object.values(sourceBreakdown).reduce((a: number, b: any) => a + b, 0) as number;

  // Per-source conversion stats
  const sourceStats = Object.entries(SOURCE_META).map(([key, meta]) => {
    const sourceLeads  = leads.filter(l => l.source === key);
    const contacted    = sourceLeads.filter(l => l.status !== 'new').length;
    const replied      = sourceLeads.filter(l => ['replied','interested','meeting_booked','converted'].includes(l.status)).length;
    const meetings     = sourceLeads.filter(l => ['meeting_booked','converted'].includes(l.status)).length;
    const converted    = sourceLeads.filter(l => l.status === 'converted').length;
    const total_src    = sourceLeads.length;
    const replyRate    = contacted > 0 ? Math.round((replied / contacted) * 100) : 0;
    const meetingRate  = total_src > 0 ? Math.round((meetings / total_src) * 100) : 0;

    return { key, meta, total: total_src, contacted, replied, meetings, converted, replyRate, meetingRate };
  }).sort((a, b) => b.meetings - a.meetings);

  // Best source
  const best = sourceStats[0];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Source Breakdown</h1>
        <p className="page-sub">Which platforms give the best manufacturer leads</p>
      </div>

      {/* Best source callout */}
      {best && best.meetings > 0 && (
        <div className="card" style={{ background: '#FBF5F0', borderColor: '#E8C4A8', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 48 }}>{best.meta.icon}</div>
            <div>
              <div style={{ fontSize: 11, color: '#9E9890', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>Best Performing Source</div>
              <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, color: '#1A1714' }}>{best.meta.label}</div>
              <div style={{ fontSize: 14, color: '#6B6560', marginTop: 4 }}>
                {best.meetings} meetings booked · {best.meetingRate}% meeting rate · {best.total} total leads
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Source cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sourceStats.map(s => {
          const sharePct = total > 0 ? Math.round((s.total / total) * 100) : 0;
          return (
            <div key={s.key} className="card">
              <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24, alignItems: 'center' }}>
                {/* Left: source info */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 28 }}>{s.meta.icon}</span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#1A1714' }}>{s.meta.label}</div>
                      <div style={{ fontSize: 11, color: '#9E9890' }}>{sharePct}% of total leads</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#9E9890', lineHeight: 1.5 }}>{s.meta.description}</div>
                </div>

                {/* Right: stats */}
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
                    {[
                      { label: 'Total',     value: s.total,      color: '#1A1714' },
                      { label: 'Contacted', value: s.contacted,  color: '#1D4E89' },
                      { label: 'Replied',   value: s.replied,    color: '#6B3FA0' },
                      { label: 'Meetings',  value: s.meetings,   color: '#C4622D' },
                      { label: 'Converted', value: s.converted,  color: '#2A6049' },
                    ].map(stat => (
                      <div key={stat.label} style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, color: stat.color }}>{stat.value}</div>
                        <div style={{ fontSize: 10, color: '#9E9890', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{stat.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Mini funnel bar */}
                  <div style={{ display: 'flex', gap: 4, height: 8 }}>
                    {[
                      { w: s.total,      c: '#E8E3DA' },
                      { w: s.contacted,  c: '#1D4E89' },
                      { w: s.replied,    c: '#6B3FA0' },
                      { w: s.meetings,   c: '#C4622D' },
                      { w: s.converted,  c: '#2A6049' },
                    ].map((bar, i) => (
                      <div key={i} style={{
                        height: '100%', borderRadius: 4,
                        width: s.total > 0 ? `${(bar.w / s.total) * 100}%` : '0%',
                        background: bar.c, minWidth: bar.w > 0 ? 4 : 0,
                      }} />
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: '#9E9890' }}>
                      Reply rate: <strong style={{ color: s.replyRate > 20 ? '#2A6049' : '#9E9890' }}>{s.replyRate}%</strong>
                    </div>
                    <div style={{ fontSize: 12, color: '#9E9890' }}>
                      Meeting rate: <strong style={{ color: s.meetingRate > 5 ? '#C4622D' : '#9E9890' }}>{s.meetingRate}%</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
