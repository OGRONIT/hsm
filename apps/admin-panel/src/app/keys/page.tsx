'use client';
import { useEffect, useState, useCallback } from 'react';
import { keysApi } from '../../lib/api';

const SERVICE_META: Record<string, { label: string; icon: string; envVar: string; docsUrl: string }> = {
  anthropic:       { label: 'Claude API (Anthropic)',     icon: '🤖', envVar: 'ANTHROPIC_API_KEY',         docsUrl: 'https://console.anthropic.com/keys' },
  openai:          { label: 'OpenAI API',                 icon: '🧠', envVar: 'OPENAI_API_KEY',             docsUrl: 'https://platform.openai.com/api-keys' },
  whatsapp:        { label: 'WhatsApp Business API',      icon: '📱', envVar: 'WHATSAPP_API_TOKEN',         docsUrl: 'https://developers.facebook.com/apps' },
  telegram:        { label: 'Telegram Bot',               icon: '✈️', envVar: 'TELEGRAM_BOT_TOKEN',         docsUrl: 'https://t.me/BotFather' },
  calendly:        { label: 'Calendly API',               icon: '📅', envVar: 'CALENDLY_API_KEY',           docsUrl: 'https://calendly.com/integrations/api_webhooks' },
  resend:          { label: 'Resend Email',               icon: '📧', envVar: 'RESEND_API_KEY',             docsUrl: 'https://resend.com/api-keys' },
  redis:           { label: 'Upstash Redis',              icon: '⚡', envVar: 'REDIS_URL',                  docsUrl: 'https://console.upstash.com' },
  brightdata:      { label: 'Bright Data Proxies',        icon: '🌐', envVar: 'BRIGHTDATA_PASSWORD',        docsUrl: 'https://brightdata.com/cp/zones' },
  apify:           { label: 'Apify (Scrapers)',           icon: '🕷', envVar: 'APIFY_API_TOKEN',            docsUrl: 'https://console.apify.com/account/integrations' },
  google_calendar: { label: 'Google Calendar OAuth',      icon: '📆', envVar: 'GOOGLE_CALENDAR_CLIENT_SECRET', docsUrl: 'https://console.cloud.google.com/apis' },
  supabase_service:{ label: 'Supabase Service Role',      icon: '🗄', envVar: 'SUPABASE_SERVICE_ROLE_KEY',  docsUrl: 'https://supabase.com/dashboard/project/_/settings/api' },
};

export default function KeysPage() {
  const [keys,      setKeys]      = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [testing,   setTesting]   = useState<Record<string, boolean>>({});
  const [results,   setResults]   = useState<Record<string, { ok: boolean; detail?: string; error?: string }>>({});
  const [showAdd,   setShowAdd]   = useState(false);
  const [addForm,   setAddForm]   = useState({ service: '', key_preview: '', notes: '' });
  const [saving,    setSaving]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await keysApi.list();
      setKeys(data.keys ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const testKey = async (service: string) => {
    setTesting(t => ({ ...t, [service]: true }));
    try {
      const result = await keysApi.action({ action: 'test', service });
      setResults(r => ({ ...r, [service]: { ok: result.ok, detail: result.detail, error: result.error } }));
      await load(); // refresh last_tested_at
    } catch (e: any) {
      setResults(r => ({ ...r, [service]: { ok: false, error: e.message } }));
    } finally {
      setTesting(t => ({ ...t, [service]: false }));
    }
  };

  const revokeKey = async (service: string) => {
    if (!confirm(`Mark ${service} as revoked? The key in Railway env vars is NOT deleted — only the status in the admin panel changes.`)) return;
    await keysApi.action({ action: 'mark_revoked', service });
    await load();
  };

  const activateKey = async (service: string) => {
    await keysApi.action({ action: 'mark_active', service });
    await load();
  };

  const testAll = async () => {
    for (const key of keys) {
      await testKey(key.service);
      await new Promise(r => setTimeout(r, 600));
    }
  };

  const saveAdd = async () => {
    setSaving(true);
    try {
      await keysApi.action({ action: 'update_preview', service: addForm.service, key_preview: addForm.key_preview, notes: addForm.notes });
      setShowAdd(false);
      setAddForm({ service: '', key_preview: '', notes: '' });
      await load();
    } finally { setSaving(false); }
  };

  const statusBadge = (key: any) => {
    if (!key.is_active) return <span className="badge badge-red">Revoked</span>;
    if (key.last_test_ok === true)  return <span className="badge badge-green">● Active</span>;
    if (key.last_test_ok === false) return <span className="badge badge-red">● Failed</span>;
    return <span className="badge badge-gray">Untested</span>;
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">API Keys</h1>
          <p className="page-sub">Manage, test and revoke all service keys from one place</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={testAll}>⚡ Test All</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Update Key</button>
        </div>
      </div>

      {/* Add / Update key form */}
      {showAdd && (
        <div style={{ background: '#0F0F1A', border: '1px solid #FF6B35', borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <p className="section-title">Update Key Preview (after rotating in Railway)</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono', display: 'block', marginBottom: 6 }}>SERVICE</label>
              <select className="hsm-input" style={{ width: '100%' }} value={addForm.service} onChange={e => setAddForm(f => ({ ...f, service: e.target.value }))}>
                <option value="">Select service...</option>
                {Object.entries(SERVICE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono', display: 'block', marginBottom: 6 }}>KEY PREVIEW (last 4 chars)</label>
              <input className="hsm-input" style={{ width: '100%' }} placeholder="...xk9Z" value={addForm.key_preview} onChange={e => setAddForm(f => ({ ...f, key_preview: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono', display: 'block', marginBottom: 6 }}>NOTES</label>
              <input className="hsm-input" style={{ width: '100%' }} placeholder="Rotated on DD/MM/YYYY, reason..." value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={saveAdd} disabled={!addForm.service || saving}>{saving ? 'Saving...' : 'Save'}</button>
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
          <p style={{ fontSize: 11, color: '#6B6888', marginTop: 12, fontFamily: 'JetBrains Mono' }}>
            ⚠️ Actual keys are stored in Railway / Vercel env vars. This panel only tracks metadata and health status.
            To rotate a key: update it in Railway → update preview here → click Test.
          </p>
        </div>
      )}

      {/* Keys table */}
      {loading ? (
        <div style={{ color: '#6B6888', fontFamily: 'JetBrains Mono', fontSize: 13 }}>Loading keys...</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="hsm-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Env Var</th>
                <th>Preview</th>
                <th>Status</th>
                <th>Last Tested</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key: any) => {
                const meta    = SERVICE_META[key.service] ?? {};
                const testRes = results[key.service];
                const isTesting = testing[key.service];

                return (
                  <tr key={key.service}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{meta.icon ?? '🔑'}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#E8E6F0' }}>{meta.label ?? key.service}</div>
                          <div style={{ fontSize: 11, color: '#6B6888' }}>{key.service}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: 11, color: '#6B6888', background: '#13131E', padding: '2px 6px', borderRadius: 4 }}>
                        {meta.envVar ?? '—'}
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: 12, color: '#9CA3AF' }}>
                        {key.key_preview ? `...${key.key_preview}` : '—'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {statusBadge(key)}
                        {testRes && (
                          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: testRes.ok ? '#4ADE80' : '#F87171' }}>
                            {testRes.ok ? `✓ ${testRes.detail ?? 'Connected'}` : `✗ ${testRes.error}`}
                          </div>
                        )}
                        {key.last_error && !testRes && (
                          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#F87171' }}>{key.last_error.slice(0, 40)}</div>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono' }}>
                      {key.last_tested_at
                        ? new Date(key.last_tested_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })
                        : 'Never'}
                    </td>
                    <td style={{ fontSize: 11, color: '#6B6888', maxWidth: 200 }}>
                      {key.notes ?? '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {/* Test button */}
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => testKey(key.service)}
                          disabled={isTesting}
                          style={{ minWidth: 60 }}
                        >
                          {isTesting ? '...' : '⚡ Test'}
                        </button>

                        {/* Docs link */}
                        {meta.docsUrl && (
                          <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                            ↗ Docs
                          </a>
                        )}

                        {/* Revoke / Activate */}
                        {key.is_active ? (
                          <button className="btn btn-danger btn-sm" onClick={() => revokeKey(key.service)}>
                            ✕ Revoke
                          </button>
                        ) : (
                          <button className="btn btn-success btn-sm" onClick={() => activateKey(key.service)}>
                            ✓ Activate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Info box */}
      <div style={{ marginTop: 20, background: '#0F0F1A', border: '1px solid #1E1E2E', borderRadius: 10, padding: 16 }}>
        <p className="section-title" style={{ marginBottom: 10 }}>How Key Management Works</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            { title: 'Rotate a Key', steps: ['Generate new key on service dashboard (↗ Docs button)', 'Update the env var in Railway or Vercel', 'Click "Update Key" → enter last 4 chars', 'Click "⚡ Test" to verify it works'] },
            { title: 'Revoke a Key', steps: ['Click "✕ Revoke" to flag it as inactive', 'Go to service dashboard to invalidate the actual key', 'Add new key to Railway/Vercel env vars', 'Click "✓ Activate" + "⚡ Test" to confirm'] },
          ].map(guide => (
            <div key={guide.title}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#E8E6F0', marginBottom: 8 }}>{guide.title}</div>
              {guide.steps.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#FF6B35', fontFamily: 'JetBrains Mono', minWidth: 16 }}>{i + 1}.</span>
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>{step}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
