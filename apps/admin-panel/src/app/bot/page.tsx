'use client';
import { useEffect, useState, useCallback } from 'react';
import { botApi, leadsApi } from '../../lib/api';

export default function BotPage() {
  const [status,  setStatus]  = useState<any>(null);
  const [leads,   setLeads]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState(false);
  const [killId,  setKillId]  = useState('');

  const load = useCallback(async () => {
    const [s, l] = await Promise.all([
      botApi.status(),
      leadsApi.list({ status: 'contacted', limit: '20' }),
    ]);
    setStatus(s);
    setLeads(l.leads ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (action: string, scope = 'global', lead_id?: string) => {
    setActing(true);
    try { await botApi.action({ action, scope, lead_id }); await load(); }
    finally { setActing(false); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bot Control</h1>
          <p className="page-sub">Pause, resume, or kill the Smit AI bot</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {status?.isPaused
            ? <button className="btn btn-success" disabled={acting} onClick={() => act('resume')}>▶ Resume Bot</button>
            : <button className="btn btn-danger"  disabled={acting} onClick={() => act('pause')}>⏸ Pause Bot Globally</button>
          }
        </div>
      </div>

      {loading ? <div style={{ color: '#6B6888', fontFamily: 'JetBrains Mono', fontSize: 13 }}>Loading...</div> : <>

      {/* Status card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="stat-card" style={{ borderColor: status?.isPaused ? '#991B1B' : '#166534' }}>
          <div className="stat-value" style={{ color: status?.isPaused ? '#F87171' : '#4ADE80' }}>
            {status?.isPaused ? 'PAUSED' : 'ACTIVE'}
          </div>
          <div className="stat-label">Bot Status</div>
          {status?.isPaused && status?.pausedSince && (
            <div style={{ fontSize: 11, color: '#F87171', fontFamily: 'JetBrains Mono', marginTop: 6 }}>
              Since {new Date(status.pausedSince).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-value">{status?.messagesToday ?? 0}</div>
          <div className="stat-label">Messages Today</div>
          <div style={{ fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono', marginTop: 6 }}>{status?.dailyLimit ?? 500} daily limit</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{leads.length}</div>
          <div className="stat-label">Active Leads in Bot</div>
          <div style={{ fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono', marginTop: 6 }}>contacted status</div>
        </div>
      </div>

      {/* Kill per lead */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p className="section-title">Kill Bot for Specific Lead</p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input className="hsm-input" placeholder="Paste Lead UUID..." value={killId} onChange={e => setKillId(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-danger" disabled={!killId || acting} onClick={() => { act('kill', 'lead', killId); setKillId(''); }}>
            ✕ Kill for this Lead
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono', margin: 0 }}>
          Killing bot for a lead marks them as dead + opts out from WA + email. Cannot be undone.
        </p>
      </div>

      {/* Active leads table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1E1E2E' }}>
          <p className="section-title" style={{ margin: 0 }}>Leads Currently in Bot Flow</p>
        </div>
        <table className="hsm-table">
          <thead><tr><th>Company</th><th>Phone</th><th>Industry</th><th>Source</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {leads.map((lead: any) => (
              <tr key={lead.id}>
                <td style={{ fontWeight: 500, color: '#E8E6F0' }}>{lead.company_name}</td>
                <td className="mono" style={{ fontSize: 12 }}>{lead.phone ?? '—'}</td>
                <td><span className="badge badge-blue">{lead.industry}</span></td>
                <td><span className="badge badge-gray">{lead.source}</span></td>
                <td><span className="badge badge-amber">{lead.status}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => act('pause', 'lead', lead.id)}>⏸ Pause</button>
                    <button className="btn btn-danger btn-sm" onClick={() => act('kill', 'lead', lead.id)}>✕ Kill</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>}
    </div>
  );
}
