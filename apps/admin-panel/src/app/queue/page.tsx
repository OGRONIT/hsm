'use client';
import { useEffect, useState, useCallback } from 'react';
import { queueApi } from '../../lib/api';

export default function QueuePage() {
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const d = await queueApi.stats();
    setData(d);
    setLoading(false);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  const wa = data?.whatsapp ?? {};
  const bq = data?.bullmq ?? {};

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Queue</h1><p className="page-sub">BullMQ jobs + WhatsApp rate limit tracker</p></div>
        <button className="btn btn-ghost" onClick={load}>↻ Refresh</button>
      </div>

      {loading ? <div style={{ color: '#6B6888', fontFamily: 'JetBrains Mono', fontSize: 13 }}>Loading...</div> : <>

      {/* WA daily limit */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p className="section-title">WhatsApp Daily Limit (500/day)</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
          {[
            { label: 'Sent Today',    value: wa.sentToday ?? 0,       color: '#E8E6F0' },
            { label: 'Failed Today',  value: wa.failedToday ?? 0,     color: '#F87171' },
            { label: 'Remaining',     value: wa.remaining ?? 500,     color: '#4ADE80' },
            { label: 'This Week',     value: wa.sentThisWeek ?? 0,    color: '#60A5FA' },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: 'JetBrains Mono' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ height: 12, background: '#1E1E2E', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 6, transition: 'width 0.5s',
            width: `${wa.utilizationPct ?? 0}%`,
            background: (wa.utilizationPct ?? 0) > 80 ? '#F87171' : (wa.utilizationPct ?? 0) > 60 ? '#FCD34D' : '#4ADE80',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono' }}>
          <span>0</span><span>{wa.utilizationPct ?? 0}% used</span><span>500</span>
        </div>
      </div>

      {/* BullMQ queues */}
      {bq && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
          {['outreach', 'followup', 'booking'].map(qname => {
            const q = bq[qname] ?? {};
            return (
              <div key={qname} className="card">
                <p className="section-title">{qname} queue</p>
                {[
                  { label: 'Waiting',   value: q.waiting   ?? 0, color: '#60A5FA' },
                  { label: 'Active',    value: q.active    ?? 0, color: '#FCD34D' },
                  { label: 'Delayed',   value: q.delayed   ?? 0, color: '#C084FC' },
                  { label: 'Completed', value: q.completed ?? 0, color: '#4ADE80' },
                  { label: 'Failed',    value: q.failed    ?? 0, color: '#F87171' },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: '#9CA3AF' }}>{s.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: s.color, fontFamily: 'JetBrains Mono' }}>{s.value}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Failed jobs */}
      {(data?.failedJobs ?? []).length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1E1E2E' }}>
            <p className="section-title" style={{ margin: 0 }}>Recent Failed Jobs</p>
          </div>
          <table className="hsm-table">
            <thead><tr><th>Error</th><th>Source</th><th>Time</th></tr></thead>
            <tbody>
              {data.failedJobs.map((j: any, i: number) => (
                <tr key={i}>
                  <td style={{ color: '#F87171', fontSize: 12, fontFamily: 'JetBrains Mono' }}>{j.message}</td>
                  <td><span className="badge badge-gray">{j.metadata?.source ?? 'queue'}</span></td>
                  <td style={{ fontSize: 11, color: '#6B6888' }}>{new Date(j.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>}
    </div>
  );
}
