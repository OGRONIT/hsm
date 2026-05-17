'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api';

const STATUS_CONFIG: Record<string, { label: string; badge: string; color: string }> = {
  pending:   { label: 'Pending',   badge: 'badge-amber', color: '#92651A' },
  confirmed: { label: 'Confirmed', badge: 'badge-green', color: '#2A6049' },
  completed: { label: 'Completed', badge: 'badge-blue',  color: '#1D4E89' },
  cancelled: { label: 'Cancelled', badge: 'badge-red',   color: '#9B2335' },
  no_show:   { label: 'No Show',   badge: 'badge-red',   color: '#9B2335' },
};

const OUTCOME_CONFIG: Record<string, { label: string; color: string }> = {
  deal_won:      { label: '🎉 Deal Won',      color: '#2A6049' },
  deal_lost:     { label: '✗ Deal Lost',     color: '#9B2335' },
  follow_up:     { label: '↻ Follow Up',     color: '#92651A' },
  not_qualified: { label: '— Not Qualified', color: '#9E9890' },
};

export default function MeetingsPage() {
  const [meetings,  setMeetings]  = useState<any[]>([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState<'upcoming' | 'all'>('upcoming');
  const [selected,  setSelected]  = useState<any | null>(null);
  const [dealValue, setDealValue] = useState('');
  const [notes,     setNotes]     = useState('');
  const [saving,    setSaving]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { limit: '50' };
    if (tab === 'upcoming') params.upcoming = 'true';
    const data = await api.meetings(params);
    setMeetings(data.meetings ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const openMeeting = (m: any) => {
    setSelected(m);
    setDealValue(m.deal_value ? String(m.deal_value) : '');
    setNotes(m.post_meeting_notes ?? '');
  };

  const saveOutcome = async (outcome: string) => {
    if (!selected) return;
    setSaving(true);
    await api.patchMeeting(selected.id, {
      outcome,
      status:              'completed',
      deal_value:          dealValue ? parseFloat(dealValue) : undefined,
      post_meeting_notes:  notes,
    });
    setSaving(false);
    setSelected(null);
    await load();
  };

  // Group by month
  const byMonth: Record<string, any[]> = {};
  meetings.forEach(m => {
    const month = new Date(m.scheduled_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(m);
  });

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="page-title">Meetings</h1>
            <p className="page-sub">{total} meetings tracked</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['upcoming', 'all'] as const).map(t => (
              <button key={t} className={`btn btn-sm ${tab === t ? 'btn-accent' : 'btn-outline'}`} onClick={() => setTab(t)}>
                {t === 'upcoming' ? '↑ Upcoming' : 'All meetings'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#9E9890', fontSize: 14 }}>Loading meetings...</div>
      ) : meetings.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 40px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>◷</div>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, color: '#1A1714', marginBottom: 8 }}>No meetings yet</div>
          <div style={{ fontSize: 14, color: '#9E9890' }}>Meetings booked via Calendly will appear here automatically</div>
        </div>
      ) : (
        Object.entries(byMonth).map(([month, mts]) => (
          <div key={month} style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9E9890', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16, fontFamily: 'JetBrains Mono, monospace' }}>{month}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {mts.map((m: any) => {
                const cfg    = STATUS_CONFIG[m.status] ?? STATUS_CONFIG.pending;
                const isPast = new Date(m.scheduled_at) < new Date();
                return (
                  <div key={m.id} className="card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20, cursor: 'pointer', borderColor: m.status === 'confirmed' ? '#D4B896' : '#E8E3DA' }}
                    onClick={() => openMeeting(m)}>
                    {/* Date block */}
                    <div style={{ textAlign: 'center', minWidth: 56, background: '#F7F5F0', borderRadius: 8, padding: '10px 8px' }}>
                      <div style={{ fontSize: 22, fontFamily: 'DM Serif Display, serif', color: '#C4622D', lineHeight: 1 }}>
                        {new Date(m.scheduled_at).toLocaleDateString('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' })}
                      </div>
                      <div style={{ fontSize: 10, color: '#9E9890', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>
                        {new Date(m.scheduled_at).toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' })}
                      </div>
                    </div>

                    {/* Details */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <div style={{ fontSize: 16, fontWeight: 500, color: '#1A1714' }}>{m.lead?.company_name}</div>
                        <span className={`badge ${cfg.badge}`}>{cfg.label}</span>
                        {m.outcome && <span className="badge badge-green">{OUTCOME_CONFIG[m.outcome]?.label ?? m.outcome}</span>}
                      </div>
                      <div style={{ fontSize: 13, color: '#9E9890' }}>
                        {m.lead?.owner_name ?? 'Unknown'} · {m.lead?.industry} · {m.lead?.source}
                      </div>
                      {m.notes && <div style={{ fontSize: 12, color: '#6B6560', marginTop: 4, fontStyle: 'italic' }}>"{m.notes}"</div>}
                    </div>

                    {/* Time + links */}
                    <div style={{ textAlign: 'right', minWidth: 120 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#C4622D' }}>
                        {new Date(m.scheduled_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' })} IST
                      </div>
                      <div style={{ fontSize: 12, color: '#9E9890', marginTop: 2 }}>{m.duration_minutes ?? 20} min</div>
                      {m.meet_link && (
                        <a href={m.meet_link} target="_blank" rel="noopener noreferrer"
                          className="btn btn-accent btn-sm" style={{ marginTop: 8 }}
                          onClick={e => e.stopPropagation()}>
                          Join ↗
                        </a>
                      )}
                      {m.deal_value && (
                        <div style={{ fontSize: 12, color: '#2A6049', fontWeight: 600, marginTop: 4 }}>
                          ₹{Number(m.deal_value).toLocaleString('en-IN')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Outcome modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card" style={{ width: 480, maxWidth: '90vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 20, color: '#1A1714' }}>Record Outcome</div>
              <button className="btn btn-outline btn-sm" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div style={{ fontSize: 14, color: '#6B6560', marginBottom: 20 }}>
              <strong>{selected.lead?.company_name}</strong> · {new Date(selected.scheduled_at).toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' })}
            </div>

            <label style={{ fontSize: 11, color: '#9E9890', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Deal Value (INR)</label>
            <input className="portal-input" style={{ width: '100%', marginBottom: 16 }}
              placeholder="e.g. 85000" value={dealValue} onChange={e => setDealValue(e.target.value)} />

            <label style={{ fontSize: 11, color: '#9E9890', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Post-meeting Notes</label>
            <textarea className="portal-input" style={{ width: '100%', height: 80, resize: 'vertical', marginBottom: 20 }}
              placeholder="What happened in the call? Next steps?" value={notes} onChange={e => setNotes(e.target.value)} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {Object.entries(OUTCOME_CONFIG).map(([key, cfg]) => (
                <button key={key} className="btn btn-outline" disabled={saving}
                  onClick={() => saveOutcome(key)}
                  style={{ justifyContent: 'center', color: cfg.color, borderColor: cfg.color + '40', padding: '12px' }}>
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
