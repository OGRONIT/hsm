'use client';
import { useEffect, useState, useCallback } from 'react';
import { leadsApi } from '../../lib/api';

const STATUS_BADGE: Record<string, string> = {
  new: 'badge-gray', contacted: 'badge-blue', replied: 'badge-purple',
  interested: 'badge-amber', meeting_booked: 'badge-green', converted: 'badge-green', dead: 'badge-red',
};

export default function LeadsPage() {
  const [leads,   setLeads]   = useState<any[]>([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', source: '', industry: '', search: '' });
  const [page,    setPage]    = useState(1);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: '50' };
    if (filters.status)   params.status   = filters.status;
    if (filters.source)   params.source   = filters.source;
    if (filters.industry) params.industry = filters.industry;
    if (filters.search)   params.search   = filters.search;
    const data = await leadsApi.list(params);
    setLeads(data.leads ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id);
    await leadsApi.patch(id, { status });
    await load();
    setUpdating(null);
  };

  const f = (key: string, val: string) => { setFilters(p => ({ ...p, [key]: val })); setPage(1); };

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Leads</h1><p className="page-sub">{total.toLocaleString()} total leads in database</p></div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input className="hsm-input" placeholder="Search company..." value={filters.search} onChange={e => f('search', e.target.value)} style={{ width: 200 }} />
        <select className="hsm-input" value={filters.status} onChange={e => f('status', e.target.value)}>
          <option value="">All Statuses</option>
          {['new','contacted','replied','interested','meeting_booked','converted','dead'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="hsm-input" value={filters.source} onChange={e => f('source', e.target.value)}>
          <option value="">All Sources</option>
          {['indiamart','google_maps','justdial','linkedin','instagram','facebook_groups'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="hsm-input" value={filters.industry} onChange={e => f('industry', e.target.value)}>
          <option value="">All Industries</option>
          {['home_appliances','heavy_machinery','safes','auto_parts','submersible_pumps','peanut_sorting','other'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {Object.values(filters).some(Boolean) && (
          <button className="btn btn-ghost btn-sm" onClick={() => setFilters({ status:'', source:'', industry:'', search:'' })}>✕ Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <table className="hsm-table">
          <thead>
            <tr><th>Company</th><th>Owner</th><th>Phone</th><th>Industry</th><th>Source</th><th>Language</th><th>Status</th><th>Created</th><th>Change Status</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ color: '#6B6888', fontFamily: 'JetBrains Mono', textAlign: 'center' }}>Loading...</td></tr>
            ) : leads.map((lead: any) => (
              <tr key={lead.id}>
                <td style={{ fontWeight: 500, color: '#E8E6F0', maxWidth: 180 }}>{lead.company_name}</td>
                <td style={{ color: '#9CA3AF', fontSize: 12 }}>{lead.owner_name ?? '—'}</td>
                <td className="mono" style={{ fontSize: 11 }}>{lead.phone ?? '—'}</td>
                <td><span className="badge badge-blue" style={{ fontSize: 9 }}>{lead.industry}</span></td>
                <td><span className="badge badge-gray" style={{ fontSize: 9 }}>{lead.source}</span></td>
                <td className="mono" style={{ fontSize: 11, color: '#6B6888' }}>{lead.language_detected ?? '—'}</td>
                <td><span className={`badge ${STATUS_BADGE[lead.status] ?? 'badge-gray'}`}>{lead.status}</span></td>
                <td style={{ fontSize: 11, color: '#6B6888' }}>{new Date(lead.created_at).toLocaleDateString('en-IN')}</td>
                <td>
                  <select
                    className="hsm-input"
                    value={lead.status}
                    disabled={updating === lead.id}
                    onChange={e => updateStatus(lead.id, e.target.value)}
                    style={{ fontSize: 11, padding: '4px 8px' }}
                  >
                    {['new','contacted','replied','interested','meeting_booked','converted','dead'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <span style={{ fontSize: 12, color: '#6B6888', fontFamily: 'JetBrains Mono' }}>
          Showing {(page-1)*50+1}–{Math.min(page*50, total)} of {total}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p-1)}>← Prev</button>
          <span style={{ fontSize: 12, color: '#6B6888', alignSelf: 'center', fontFamily: 'JetBrains Mono' }}>Page {page}</span>
          <button className="btn btn-ghost btn-sm" disabled={page*50 >= total} onClick={() => setPage(p => p+1)}>Next →</button>
        </div>
      </div>
    </div>
  );
}
