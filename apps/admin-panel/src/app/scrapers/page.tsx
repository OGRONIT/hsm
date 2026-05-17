'use client';
import { useEffect, useState, useCallback } from 'react';
import { scraperApi } from '../../lib/api';

export default function ScrapersPage() {
  const [scrapers, setScrapers] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [acting,   setActing]   = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const data = await scraperApi.status();
    setScrapers(data.scrapers ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const act = async (scraper: string, action: string) => {
    setActing(a => ({ ...a, [scraper]: true }));
    try { await scraperApi.action(action, scraper); await load(); }
    finally { setActing(a => ({ ...a, [scraper]: false })); }
  };

  const SCRAPER_INFO: Record<string, { icon: string; freq: string; source: string }> = {
    indiamart:       { icon: '🏪', freq: 'Every 6h',    source: 'Playwright + Bright Data' },
    google_maps:     { icon: '📍', freq: 'Every 12h',   source: 'Google Places API' },
    justdial:        { icon: '📞', freq: '6am + 6pm',   source: 'Playwright + Bright Data' },
    linkedin:        { icon: '💼', freq: 'Daily 9am',   source: 'Apify Actor' },
    instagram:       { icon: '📸', freq: 'Every 6h',    source: 'Apify Actor' },
    facebook_groups: { icon: '👥', freq: 'Every 8h',    source: 'Apify Actor' },
  };

  const totalToday = scrapers.reduce((sum, s) => sum + (s.leads_today_actual ?? 0), 0);
  const running    = scrapers.filter(s => s.is_running).length;
  const errors     = scrapers.filter(s => s.last_run_status === 'error').length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Scrapers</h1>
          <p className="page-sub">Control and monitor all 6 data sources</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-success" onClick={() => act('all', 'enable')}>▶ Enable All</button>
          <button className="btn btn-danger"  onClick={() => act('all', 'stop')}>■ Stop All</button>
          <button className="btn btn-primary" onClick={() => act('all', 'force_run')}>⚡ Force Run All</button>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="stat-card"><div className="stat-value">{totalToday}</div><div className="stat-label">Leads Scraped Today</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: running > 0 ? '#4ADE80' : '#6B6888' }}>{running}</div><div className="stat-label">Currently Running</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: errors > 0 ? '#F87171' : '#4ADE80' }}>{errors}</div><div className="stat-label">Scrapers with Errors</div></div>
      </div>

      {/* Scraper cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {loading
          ? <div style={{ color: '#6B6888', fontFamily: 'JetBrains Mono', fontSize: 13 }}>Loading...</div>
          : scrapers.map((s: any) => {
          const info   = SCRAPER_INFO[s.scraper_name] ?? { icon: '🤖', freq: '?', source: '?' };
          const isAct  = acting[s.scraper_name];

          return (
            <div key={s.scraper_name} className="card" style={{ borderColor: s.is_running ? '#1E3A5F' : s.last_run_status === 'error' ? '#3A1010' : '#1E1E2E' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>{info.icon}</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#E8E6F0' }}>{s.scraper_name}</div>
                    <div style={{ fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono' }}>{info.source}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  {s.is_running
                    ? <span className="badge badge-blue">● Running</span>
                    : s.is_enabled === false
                    ? <span className="badge badge-red">Disabled</span>
                    : s.last_run_status === 'error'
                    ? <span className="badge badge-red">Error</span>
                    : s.last_run_status === 'success'
                    ? <span className="badge badge-green">OK</span>
                    : <span className="badge badge-gray">Idle</span>
                  }
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono', marginBottom: 2 }}>TODAY</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#E8E6F0' }}>{s.leads_today_actual ?? 0}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono', marginBottom: 2 }}>TOTAL</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#E8E6F0' }}>{(s.leads_total ?? 0).toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono', marginBottom: 2 }}>SCHEDULE</div>
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>{info.freq}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono', marginBottom: 2 }}>NEXT RUN</div>
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {s.next_run_at ? new Date(s.next_run_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' }) : '—'}
                  </div>
                </div>
              </div>

              {s.error_message && (
                <div style={{ background: '#2A0D0D', border: '1px solid #991B1B', borderRadius: 6, padding: '8px 10px', marginBottom: 12, fontSize: 11, color: '#F87171', fontFamily: 'JetBrains Mono' }}>
                  ✗ {s.error_message}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" disabled={isAct || s.is_running} onClick={() => act(s.scraper_name, 'force_run')}>
                  {isAct ? '...' : '⚡ Force Run'}
                </button>
                {s.is_enabled !== false ? (
                  <button className="btn btn-danger btn-sm" disabled={isAct} onClick={() => act(s.scraper_name, 'disable')}>
                    ■ Disable
                  </button>
                ) : (
                  <button className="btn btn-success btn-sm" disabled={isAct} onClick={() => act(s.scraper_name, 'enable')}>
                    ▶ Enable
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
