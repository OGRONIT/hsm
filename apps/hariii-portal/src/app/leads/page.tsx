'use client';
import { useEffect, useState, useCallback } from 'react';

const API_BASE   = process.env.NEXT_PUBLIC_API_URL ?? '/api';
const API_SECRET = process.env.NEXT_PUBLIC_ADMIN_API_SECRET ?? '';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_SECRET}`, ...opts?.headers },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error ?? 'API error');
  return data.data as T;
}

const STAGES = [
  { key: 'new',            label: 'New',            color: '#9E9890', bg: '#F0EDE8', border: '#D4CFC5' },
  { key: 'contacted',      label: 'Contacted',      color: '#1D4E89', bg: '#EBF2FB', border: '#BFCFE8' },
  { key: 'replied',        label: 'Replied',        color: '#6B3FA0', bg: '#F3EBF8', border: '#D4B8F0' },
  { key: 'interested',     label: 'Interested',     color: '#92651A', bg: '#FDF5E6', border: '#E8D4A0' },
  { key: 'meeting_booked', label: 'Meeting Booked', color: '#C4622D', bg: '#FBF0EB', border: '#E8BCA0' },
  { key: 'converted',      label: 'Converted ✓',   color: '#2A6049', bg: '#EBF5F0', border: '#A0D4BC' },
];

const ALL_STATUSES = ['new','contacted','replied','interested','meeting_booked','converted','dead'];

export default function LeadsPage() {
  const [allLeads,  setAllLeads]  = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [editing,   setEditing]   = useState<any | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [industry,  setIndustry]  = useState('');
  const [source,    setSource]    = useState('');
  const [search,    setSearch]    = useState('');
  const [editForm,  setEditForm]  = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string,string> = { limit: '300' };
    if (industry) params.industry = industry;
    if (source)   params.source   = source;
    if (search)   params.search   = search;
    const data = await apiFetch<any>(`/leads?${new URLSearchParams(params)}`);
    setAllLeads(data.leads ?? []);
    setLoading(false);
  }, [industry, source, search]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (lead: any) => {
    setEditing(lead);
    setEditForm({
      status:     lead.status,
      owner_name: lead.owner_name ?? '',
      notes:      lead.notes ?? '',
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    await apiFetch(`/leads/${editing.id}`, {
      method: 'PATCH',
      body: JSON.stringify(editForm),
    });
    setSaving(false);
    setEditing(null);
    await load();
  };

  const quickStatus = async (id: string, status: string) => {
    await apiFetch(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
  };

  const leadsByStage = STAGES.reduce((acc, s) => {
    acc[s.key] = allLeads.filter(l => l.status === s.key);
    return acc;
  }, {} as Record<string, any[]>);

  const deadLeads = allLeads.filter(l => l.status === 'dead');

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Lead Funnel</h1>
        <p className="page-sub">{allLeads.length} leads · {deadLeads.length} dead</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
        <input className="portal-input" placeholder="Search company..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ width: 180 }} />
        <select className="portal-input" value={industry} onChange={e => setIndustry(e.target.value)}>
          <option value="">All Industries</option>
          {['home_appliances','heavy_machinery','safes','auto_parts','submersible_pumps','peanut_sorting','other'].map(i =>
            <option key={i} value={i}>{i.replace(/_/g,' ')}</option>
          )}
        </select>
        <select className="portal-input" value={source} onChange={e => setSource(e.target.value)}>
          <option value="">All Sources</option>
          {['indiamart','google_maps','justdial','linkedin','instagram','facebook_groups'].map(s =>
            <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
          )}
        </select>
        {(industry || source || search) && (
          <button className="btn btn-outline btn-sm" onClick={() => { setIndustry(''); setSource(''); setSearch(''); }}>✕ Clear</button>
        )}
      </div>

      {/* Kanban */}
      {loading ? (
        <div style={{ color: '#9E9890', fontSize: 14 }}>Loading leads...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, overflowX: 'auto', minWidth: 900 }}>
          {STAGES.map(stage => {
            const leads = leadsByStage[stage.key] ?? [];
            return (
              <div key={stage.key} style={{ minWidth: 160 }}>
                {/* Column header */}
                <div style={{ padding: '8px 12px', background: stage.bg, borderRadius: 8, border: `1px solid ${stage.border}`, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: stage.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{stage.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: stage.color, background: `${stage.color}22`, padding: '2px 7px', borderRadius: 10 }}>{leads.length}</span>
                </div>

                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {leads.slice(0, 20).map((lead: any) => (
                    <div key={lead.id} className="card" style={{ padding: '12px 14px', borderColor: `${stage.color}33` }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1714', marginBottom: 4, lineHeight: 1.3 }}>{lead.company_name}</div>
                      {lead.owner_name && <div style={{ fontSize: 11, color: '#9E9890', marginBottom: 4 }}>{lead.owner_name}</div>}

                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span className="badge badge-gray" style={{ fontSize: 9 }}>{lead.source?.replace(/_/g,' ')}</span>
                        {lead.language_detected && lead.language_detected !== 'en' &&
                          <span className="badge badge-blue" style={{ fontSize: 9 }}>{lead.language_detected}</span>}
                      </div>

                      {lead.phone && <div className="mono" style={{ fontSize: 10, color: '#9E9890', marginBottom: 6 }}>{lead.phone}</div>}

                      {/* Quick status change */}
                      <select
                        value={lead.status}
                        onChange={e => quickStatus(lead.id, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        style={{ width: '100%', fontSize: 10, padding: '3px 6px', borderRadius: 4, border: `1px solid ${stage.border}`, background: stage.bg, color: stage.color, cursor: 'pointer', marginBottom: 6, fontFamily: 'inherit' }}>
                        {ALL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                      </select>

                      <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center', fontSize: 11 }}
                        onClick={() => openEdit(lead)}>
                        ✎ Edit
                      </button>
                    </div>
                  ))}
                  {leads.length > 20 && (
                    <div style={{ fontSize: 11, color: '#9E9890', textAlign: 'center', padding: '8px 0' }}>+{leads.length - 20} more — use filter</div>
                  )}
                  {leads.length === 0 && (
                    <div style={{ fontSize: 12, color: '#D4CFC5', textAlign: 'center', padding: '20px 0', fontStyle: 'italic' }}>Empty</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dead leads section */}
      {deadLeads.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9E9890', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12, fontFamily: 'JetBrains Mono, monospace' }}>
            Dead Leads ({deadLeads.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {deadLeads.slice(0,12).map((lead: any) => (
              <div key={lead.id} className="card" style={{ padding: '10px 14px', opacity: 0.6 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#6B6560', marginBottom: 2 }}>{lead.company_name}</div>
                <div style={{ fontSize: 11, color: '#9E9890' }}>{lead.source?.replace(/_/g,' ')}</div>
                <button className="btn btn-outline btn-sm" style={{ marginTop: 8, fontSize: 11 }}
                  onClick={() => quickStatus(lead.id, 'new')}>
                  ↩ Revive
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card" style={{ width: 480, maxWidth: '92vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 20 }}>Edit Lead</div>
              <button className="btn btn-outline btn-sm" onClick={() => setEditing(null)}>✕</button>
            </div>

            <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1714', marginBottom: 4 }}>{editing.company_name}</div>
            <div style={{ fontSize: 12, color: '#9E9890', marginBottom: 20 }}>
              {editing.phone} · {editing.source?.replace(/_/g,' ')} · {editing.industry?.replace(/_/g,' ')}
            </div>

            {/* Status */}
            <label style={{ fontSize: 11, color: '#9E9890', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Status</label>
            <select className="portal-input" style={{ width: '100%', marginBottom: 16 }}
              value={editForm.status} onChange={e => setEditForm((f: any) => ({ ...f, status: e.target.value }))}>
              {ALL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
            </select>

            {/* Owner name */}
            <label style={{ fontSize: 11, color: '#9E9890', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Contact Person</label>
            <input className="portal-input" style={{ width: '100%', marginBottom: 16 }}
              placeholder="Owner / contact name"
              value={editForm.owner_name}
              onChange={e => setEditForm((f: any) => ({ ...f, owner_name: e.target.value }))} />

            {/* Notes */}
            <label style={{ fontSize: 11, color: '#9E9890', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Your Notes</label>
            <textarea className="portal-input" style={{ width: '100%', height: 90, resize: 'vertical', marginBottom: 20 }}
              placeholder="Any notes about this lead..."
              value={editForm.notes}
              onChange={e => setEditForm((f: any) => ({ ...f, notes: e.target.value }))} />

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-accent" style={{ flex: 1, justifyContent: 'center' }}
                onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving...' : '✓ Save Changes'}
              </button>
              <button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
