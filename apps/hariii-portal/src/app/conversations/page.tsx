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

const STATUS_COLORS: Record<string,string> = {
  new: '#9E9890', contacted: '#1D4E89', replied: '#6B3FA0',
  interested: '#92651A', meeting_booked: '#C4622D', converted: '#2A6049', dead: '#9B2335',
};

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [leadConvos,setLeadConvos]= useState<any[]>([]);
  const [search,    setSearch]    = useState('');
  const [channel,   setChannel]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [manualMsg, setManualMsg] = useState('');
  const [sending,   setSending]   = useState(false);

  // Group by lead
  const byLead: Record<string, { lead: any; msgs: any[]; last: any }> = {};
  conversations.forEach((c: any) => {
    const lid = c.lead?.id ?? c.lead_id;
    if (!byLead[lid]) byLead[lid] = { lead: c.lead, msgs: [], last: c };
    byLead[lid].msgs.push(c);
  });

  const uniqueLeads = Object.values(byLead).filter((l: any) =>
    (!search || l.lead?.company_name?.toLowerCase().includes(search.toLowerCase())) &&
    (!statusFilter || l.lead?.status === statusFilter)
  ).sort((a: any, b: any) => new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime());

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string,string> = { limit: '300' };
    if (channel) params.channel = channel;
    const data = await apiFetch<any>(`/conversations?${new URLSearchParams(params)}`);
    setConversations(data.conversations ?? []);
    setLoading(false);
  }, [channel]);

  useEffect(() => { load(); }, [load]);

  const selectLead = async (leadId: string) => {
    setSelected(leadId);
    const data = await apiFetch<any>(`/conversations?lead_id=${leadId}&limit=100`);
    setLeadConvos((data.conversations ?? []).slice().reverse());
  };

  const updateLeadStatus = async (leadId: string, status: string) => {
    await apiFetch(`/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
    if (selected === leadId) await selectLead(leadId);
  };

  // Smit sends a manual message (logged as human direction)
  const sendManual = async () => {
    if (!manualMsg.trim() || !selected) return;
    setSending(true);
    // Log it as a human outbound message in conversations
    // In real system this would also send via WA — here we just log
    await apiFetch(`/conversations`, {
      method: 'POST',
      body: JSON.stringify({
        lead_id:       selected,
        channel:       'whatsapp',
        direction:     'outbound',
        message:       manualMsg,
        ai_model_used: 'human',
      }),
    }).catch(() => {});
    setManualMsg('');
    setSending(false);
    if (selected) await selectLead(selected);
  };

  const selectedLeadData = uniqueLeads.find((l: any) => l.lead?.id === selected);

  return (
    <div className="page" style={{ padding: 0, display: 'flex', height: '100vh' }}>
      {/* Left panel — lead list */}
      <div style={{ width: 320, borderRight: '1px solid #E8E3DA', display: 'flex', flexDirection: 'column', background: '#FAFAF8', flexShrink: 0 }}>
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid #E8E3DA' }}>
          <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, color: '#1A1714', marginBottom: 12 }}>Conversations</h2>
          <input className="portal-input" placeholder="Search company..." value={search}
            onChange={e => setSearch(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="portal-input" value={channel} onChange={e => setChannel(e.target.value)} style={{ flex: 1, fontSize: 12 }}>
              <option value="">All channels</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </select>
            <select className="portal-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ flex: 1, fontSize: 12 }}>
              <option value="">All statuses</option>
              {['contacted','replied','interested','meeting_booked','converted'].map(s =>
                <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
            </select>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 20, color: '#9E9890', fontSize: 13 }}>Loading...</div>
          ) : uniqueLeads.length === 0 ? (
            <div style={{ padding: 20, color: '#9E9890', fontSize: 13 }}>No conversations yet</div>
          ) : uniqueLeads.map((l: any) => (
            <div key={l.lead?.id}
              onClick={() => selectLead(l.lead?.id)}
              style={{
                padding: '14px 20px', cursor: 'pointer', borderBottom: '1px solid #F0EDE8',
                background: selected === l.lead?.id ? '#FBF0EB' : 'transparent',
                borderLeft: selected === l.lead?.id ? '3px solid #C4622D' : '3px solid transparent',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1714' }}>{l.lead?.company_name}</div>
                <div style={{ fontSize: 10, color: '#9E9890' }}>
                  {new Date(l.last.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                {l.lead?.status && (
                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: STATUS_COLORS[l.lead.status] ?? '#9E9890', background: `${STATUS_COLORS[l.lead.status] ?? '#9E9890'}15`, padding: '2px 6px', borderRadius: 4 }}>
                    {l.lead.status.replace(/_/g,' ')}
                  </span>
                )}
                {l.lead?.language_detected && l.lead.language_detected !== 'en' && (
                  <span className="badge badge-blue" style={{ fontSize: 9 }}>{l.lead.language_detected}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#6B6560', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l.last.direction === 'outbound' ? '↑ ' : '↓ '}{l.last.message?.slice(0, 55)}...
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — chat thread */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9E9890' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>◉</div>
              <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 20 }}>Select a conversation</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Click any lead on the left</div>
            </div>
          </div>
        ) : (
          <>
            {/* Lead header with edit controls */}
            <div style={{ padding: '18px 28px', borderBottom: '1px solid #E8E3DA', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 20, color: '#1A1714' }}>
                    {selectedLeadData?.lead?.company_name}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {selectedLeadData?.lead?.phone && (
                      <span className="mono" style={{ fontSize: 12, color: '#9E9890' }}>{selectedLeadData.lead.phone}</span>
                    )}
                    <span className="badge badge-gray">{selectedLeadData?.lead?.industry?.replace(/_/g,' ')}</span>
                    <span className="badge badge-gray">{selectedLeadData?.lead?.source?.replace(/_/g,' ')}</span>
                  </div>
                </div>
                {/* Status editor inline */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select className="portal-input" style={{ fontSize: 12 }}
                    value={selectedLeadData?.lead?.status ?? 'new'}
                    onChange={e => updateLeadStatus(selected, e.target.value)}>
                    {['new','contacted','replied','interested','meeting_booked','converted','dead'].map(s =>
                      <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {leadConvos.map((msg: any) => {
                const isBot    = msg.direction === 'outbound';
                const isHuman  = msg.ai_model_used === 'human';
                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: isBot ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '70%', padding: '11px 15px',
                      borderRadius: isBot ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isHuman ? '#2A6049' : isBot ? '#C4622D' : '#FFFFFF',
                      border: isBot ? 'none' : '1px solid #E8E3DA',
                      color: isBot ? '#FFFFFF' : '#1A1714',
                    }}>
                      <div style={{ fontSize: 14, lineHeight: 1.55 }}>{msg.message}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 5, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, opacity: 0.65 }}>
                          {new Date(msg.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' })}
                        </span>
                        {isHuman && <span style={{ fontSize: 10, opacity: 0.8 }}>Smit</span>}
                        {isBot && !isHuman && msg.ai_model_used && (
                          <span style={{ fontSize: 9, opacity: 0.6, fontFamily: 'JetBrains Mono, monospace' }}>{msg.ai_model_used}</span>
                        )}
                        {isBot && msg.status && (
                          <span style={{ fontSize: 10, opacity: 0.7 }}>
                            {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓' : '·'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Manual message input — Smit can add a note/message */}
            <div style={{ padding: '14px 28px', borderTop: '1px solid #E8E3DA', background: '#FAFAF8' }}>
              <div style={{ fontSize: 11, color: '#9E9890', marginBottom: 8, fontFamily: 'JetBrains Mono, monospace' }}>
                ADD MANUAL NOTE / MESSAGE (logged as Smit)
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <textarea className="portal-input" style={{ flex: 1, height: 60, resize: 'none' }}
                  placeholder="Type a note or manual message to log..."
                  value={manualMsg} onChange={e => setManualMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendManual(); }}}
                />
                <button className="btn btn-accent" style={{ alignSelf: 'flex-end' }}
                  onClick={sendManual} disabled={!manualMsg.trim() || sending}>
                  {sending ? '...' : 'Log'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
