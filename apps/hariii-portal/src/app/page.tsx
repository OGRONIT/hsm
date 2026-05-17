'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function OverviewPage() {
  const [data,     setData]     = useState<any>(null);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([
      api.analytics('30d'),
      api.meetings({ upcoming: 'true', limit: '5' }),
    ]).then(([a, m]) => {
      setData(a);
      setMeetings(m.meetings ?? []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 32, color: '#C4622D', marginBottom: 8 }}>Hariii Design</div>
        <div style={{ fontSize: 14, color: '#9E9890' }}>Loading your sales data...</div>
      </div>
    </div>
  );

  const funnel  = data?.funnel ?? {};
  const target  = data?.monthlyTarget ?? {};
  const revenue = data?.revenue ?? {};
  const cr      = data?.conversionRates ?? {};

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36 }}>
        <div>
          <div style={{ fontSize: 12, color: '#9E9890', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <h1 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 32, color: '#1A1714', marginBottom: 4 }}>
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, Smit
          </h1>
          <p style={{ fontSize: 14, color: '#9E9890' }}>Here's what's happening with your leads</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#9E9890', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Monthly Target</div>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 28, color: target.progressPct >= 100 ? '#2A6049' : '#C4622D' }}>
            {target.achieved ?? 0} / {target.target ?? 8}
          </div>
          <div style={{ fontSize: 12, color: '#9E9890' }}>meetings this month</div>
          <div style={{ marginTop: 8, width: 180 }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.min(target.progressPct ?? 0, 100)}%`, background: (target.progressPct ?? 0) >= 100 ? '#2A6049' : '#C4622D' }} />
            </div>
            <div style={{ fontSize: 11, color: '#9E9890', marginTop: 4, textAlign: 'right' }}>{target.progressPct ?? 0}% of goal</div>
          </div>
        </div>
      </div>

      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 32 }}>
        {[
          { label: 'Total Pipeline',   value: `₹${(revenue.pipeline / 100000).toFixed(1)}L`,    sub: `${revenue.wonDeals ?? 0} deals won`,       accent: false },
          { label: 'Reply Rate',       value: `${cr.replyRatePct ?? 0}%`,                        sub: 'leads that replied',                         accent: true },
          { label: 'Meeting Rate',     value: `${cr.meetingRatePct ?? 0}%`,                      sub: 'contacts → meetings',                        accent: true },
          { label: 'Close Rate',       value: `${cr.closeRatePct ?? 0}%`,                        sub: 'meetings → converted',                       accent: false },
        ].map(m => (
          <div key={m.label} className="card">
            <div className="stat-val" style={{ color: m.accent ? '#C4622D' : '#1A1714' }}>{m.value}</div>
            <div className="stat-lbl">{m.label}</div>
            <div className="stat-sub">{m.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Lead funnel */}
        <div className="card">
          <div className="section-title" style={{ marginBottom: 20 }}>Lead Funnel</div>
          {[
            { label: 'New',            value: funnel.new            ?? 0, color: '#D4CFC5', bg: '#F0EDE8' },
            { label: 'Contacted',      value: funnel.contacted      ?? 0, color: '#1D4E89', bg: '#EBF2FB' },
            { label: 'Replied',        value: funnel.replied        ?? 0, color: '#6B3FA0', bg: '#F3EBF8' },
            { label: 'Interested',     value: funnel.interested     ?? 0, color: '#92651A', bg: '#FDF5E6' },
            { label: 'Meeting Booked', value: funnel.meeting_booked ?? 0, color: '#C4622D', bg: '#FBF0EB' },
            { label: 'Converted',      value: funnel.converted      ?? 0, color: '#2A6049', bg: '#EBF5F0' },
          ].map(s => {
            const total = Object.values(funnel).reduce((a: number, b: any) => a + b, 0) as number;
            const pct   = total > 0 ? (s.value / total) * 100 : 0;
            return (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 110, fontSize: 13, color: '#6B6560' }}>{s.label}</div>
                <div style={{ flex: 1 }}>
                  <div className="progress-bar" style={{ height: 6 }}>
                    <div className="progress-fill" style={{ width: `${pct}%`, background: s.color }} />
                  </div>
                </div>
                <div style={{ width: 36, textAlign: 'right', fontSize: 14, fontWeight: 600, color: '#1A1714', fontFamily: 'JetBrains Mono, monospace' }}>{s.value}</div>
              </div>
            );
          })}
        </div>

        {/* Upcoming meetings */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Upcoming Meetings</div>
            <a href="/meetings" className="btn btn-outline btn-sm">View all →</a>
          </div>
          {meetings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#9E9890', fontSize: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>◷</div>
              No upcoming meetings
            </div>
          ) : meetings.map((m: any) => (
            <div key={m.id} style={{ padding: '14px 0', borderBottom: '1px solid #E8E3DA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#1A1714' }}>{m.lead?.company_name}</div>
                <div style={{ fontSize: 12, color: '#9E9890', marginTop: 2 }}>{m.lead?.owner_name ?? 'Unknown'} · {m.lead?.industry}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#C4622D' }}>
                  {new Date(m.scheduled_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}
                </div>
                <div style={{ fontSize: 12, color: '#9E9890' }}>
                  {new Date(m.scheduled_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' })}
                </div>
              </div>
            </div>
          ))}
          {meetings.length > 0 && (
            <div style={{ paddingTop: 14, textAlign: 'center' }}>
              <a href="/meetings" style={{ fontSize: 13, color: '#C4622D', fontWeight: 500 }}>See all meetings →</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
