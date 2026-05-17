'use client';
import { useEffect, useState, useCallback } from 'react';
import { scraperApi } from '../../lib/api';

export default function ProxiesPage() {
  const [proxyData, setProxyData] = useState<any>(null);
  const [scrapers,  setScrapers]  = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    const s = await scraperApi.status();
    setScrapers(s.scrapers ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  // Simulate ban risk from scraper error rates
  const errorScrapers = scrapers.filter(s => s.last_run_status === 'error').length;
  const banRisk = Math.min(100, errorScrapers * 20);
  const banColor = banRisk > 70 ? '#F87171' : banRisk > 40 ? '#FCD34D' : '#4ADE80';

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Proxy Health</h1><p className="page-sub">Bright Data residential proxy status and ban risk</p></div>
        <button className="btn btn-ghost" onClick={load}>↻ Refresh</button>
      </div>

      {loading ? <div style={{ color: '#6B6888', fontFamily: 'JetBrains Mono', fontSize: 13 }}>Loading...</div> : <>

      {/* Ban risk meter */}
      <div className="card" style={{ marginBottom: 20, borderColor: banRisk > 70 ? '#991B1B' : '#1E1E2E' }}>
        <p className="section-title">Ban Risk Meter</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 48, fontWeight: 700, color: banColor, fontFamily: 'JetBrains Mono' }}>{banRisk}%</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: banColor }}>
              {banRisk > 70 ? '🔴 HIGH RISK — Check proxies immediately' : banRisk > 40 ? '🟡 MODERATE — Monitor closely' : '🟢 LOW RISK — All good'}
            </div>
            <div style={{ fontSize: 12, color: '#6B6888', marginTop: 4 }}>
              Based on scraper error rates. Bright Data auto-rotates IPs on each request.
            </div>
          </div>
        </div>
        <div style={{ height: 16, background: '#1E1E2E', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${banRisk}%`, background: banColor, borderRadius: 8, transition: 'width 0.5s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono' }}>
          <span>0% — Safe</span><span>50% — Warning</span><span>100% — Critical</span>
        </div>
      </div>

      {/* Proxy config info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card">
          <p className="section-title">Bright Data Config</p>
          {[
            { label: 'Host',       value: process.env.NEXT_PUBLIC_BD_HOST ?? 'brd.superproxy.io' },
            { label: 'Port',       value: '22225' },
            { label: 'Type',       value: 'Rotating Residential' },
            { label: 'Rotation',   value: 'Per request (new IP each call)' },
            { label: 'Session',    value: 'Random session ID per scraper run' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: '#6B6888', fontFamily: 'JetBrains Mono', fontSize: 11 }}>{row.label}</span>
              <span style={{ color: '#E8E6F0', fontFamily: 'JetBrains Mono', fontSize: 11 }}>{row.value}</span>
            </div>
          ))}
          <a href="https://brightdata.com/cp/zones" target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}>
            ↗ Open Bright Data Dashboard
          </a>
        </div>

        <div className="card">
          <p className="section-title">Rate Limits per Scraper</p>
          {[
            { name: 'indiamart',       rpm: 12,  delay: '3-7s' },
            { name: 'google_maps',     rpm: 20,  delay: '2-5s' },
            { name: 'justdial',        rpm: 10,  delay: '4-8s' },
            { name: 'linkedin',        rpm: 8,   delay: '5-10s' },
            { name: 'instagram',       rpm: 30,  delay: '1-3s' },
            { name: 'facebook_groups', rpm: 20,  delay: '2-5s' },
          ].map(s => (
            <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
              <span className="mono" style={{ color: '#9CA3AF' }}>{s.name}</span>
              <span className="mono" style={{ color: '#6B6888' }}>{s.rpm} req/min · {s.delay} delay</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scraper error log */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1E1E2E' }}>
          <p className="section-title" style={{ margin: 0 }}>Scraper Error Status</p>
        </div>
        <table className="hsm-table">
          <thead><tr><th>Scraper</th><th>Last Status</th><th>Error</th><th>Last Run</th></tr></thead>
          <tbody>
            {scrapers.map((s: any) => (
              <tr key={s.scraper_name}>
                <td className="mono" style={{ fontWeight: 500 }}>{s.scraper_name}</td>
                <td>
                  {s.last_run_status === 'error'
                    ? <span className="badge badge-red">Error</span>
                    : s.last_run_status === 'success'
                    ? <span className="badge badge-green">OK</span>
                    : <span className="badge badge-gray">{s.last_run_status ?? 'Never run'}</span>
                  }
                </td>
                <td style={{ fontSize: 11, color: '#F87171', fontFamily: 'JetBrains Mono' }}>{s.error_message ?? '—'}</td>
                <td style={{ fontSize: 11, color: '#6B6888' }}>
                  {s.last_run_at ? new Date(s.last_run_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : '—'}
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
