'use client';
import { useEffect, useState, useCallback } from 'react';
import { logsApi } from '../../lib/api';

const LEVEL_COLORS: Record<string, string> = {
  info: 'badge-blue', warn: 'badge-amber', error: 'badge-red', critical: 'badge-red',
};

export default function LogsPage() {
  const [logs,    setLogs]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [level,   setLevel]   = useState('');
  const [source,  setSource]  = useState('');
  const [auto,    setAuto]    = useState(true);

  const load = useCallback(async () => {
    const params: Record<string, string> = { limit: '100' };
    if (level)  params.level  = level;
    if (source) params.source = source;
    const data = await logsApi.list(params);
    setLogs(data.logs ?? []);
    setLoading(false);
  }, [level, source]);

  useEffect(() => {
    load();
    if (auto) { const t = setInterval(load, 5000); return () => clearInterval(t); }
  }, [load, auto]);

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">System Logs</h1><p className="page-sub">Real-time event feed from all HSM components</p></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: '#6B6888', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />
            Auto-refresh
          </label>
          <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <select className="hsm-input" value={level} onChange={e => setLevel(e.target.value)}>
          <option value="">All Levels</option>
          {['info', 'warn', 'error', 'critical'].map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
        </select>
        <select className="hsm-input" value={source} onChange={e => setSource(e.target.value)}>
          <option value="">All Sources</option>
          {['scraper','bot','queue','api','messaging','alerts','auth','webhooks','cron'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(level || source) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setLevel(''); setSource(''); }}>✕ Clear</button>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6B6888', fontFamily: 'JetBrains Mono', alignSelf: 'center' }}>
          {logs.length} entries
        </div>
      </div>

      {/* Log feed */}
      <div className="card" style={{ padding: 0, fontFamily: 'JetBrains Mono', fontSize: 12 }}>
        {loading ? (
          <div style={{ padding: 20, color: '#6B6888' }}>Loading logs...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 20, color: '#6B6888' }}>No logs found</div>
        ) : logs.map((log: any) => (
          <div key={log.id} style={{
            display: 'grid', gridTemplateColumns: '140px 70px 80px 1fr',
            gap: 12, padding: '10px 16px', borderBottom: '1px solid #13131E',
            background: log.level === 'critical' ? '#1A0808' : log.level === 'error' ? '#150808' : 'transparent',
            alignItems: 'start',
          }}>
            <span style={{ color: '#3D3B52', fontSize: 11 }}>
              {new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'medium' })}
            </span>
            <span className={`badge ${LEVEL_COLORS[log.level] ?? 'badge-gray'}`}>{log.level}</span>
            <span style={{ color: '#6B6888' }}>{log.source}</span>
            <span style={{ color: log.level === 'error' || log.level === 'critical' ? '#F87171' : '#C8C6D4', wordBreak: 'break-word' }}>
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
