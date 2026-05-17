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

export default function PhotosPage() {
  const [photos,  setPhotos]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');
  const [selected, setSelected] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all media (product photos from leads)
      const res = await fetch(`${API_BASE}/media?type=product_photo&limit=100`, {
        headers: { 'Authorization': `Bearer ${API_SECRET}` },
      });
      const data = await res.json();
      setPhotos(data.data?.media ?? []);
    } catch {
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateDescription = async (id: string, description: string) => {
    await fetch(`${API_BASE}/media/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_SECRET}` },
      body: JSON.stringify({ description }),
    });
    await load();
  };

  const filtered = filter === 'all' ? photos : photos.filter(p => p.type === filter);

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Product Photos</h1>
            <p className="page-sub">{photos.length} files received from leads via WhatsApp</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['all', 'product_photo', 'reference_video', 'document'].map(t => (
              <button key={t} className={`btn btn-sm ${filter === t ? 'btn-accent' : 'btn-outline'}`}
                onClick={() => setFilter(t)}>
                {t === 'all' ? 'All' : t === 'product_photo' ? '📸 Photos' : t === 'reference_video' ? '🎥 Videos' : '📄 Docs'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#9E9890', fontSize: 14 }}>Loading photos...</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 40px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📸</div>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, color: '#1A1714', marginBottom: 8 }}>
            No photos yet
          </div>
          <div style={{ fontSize: 14, color: '#9E9890' }}>
            When leads send product photos via WhatsApp, they'll appear here automatically
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
          {filtered.map((photo: any) => (
            <div key={photo.id} className="card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}
              onClick={() => setSelected(photo)}>
              {/* Thumbnail */}
              <div style={{ height: 200, background: '#F7F5F0', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #E8E3DA', position: 'relative', overflow: 'hidden' }}>
                {photo.type === 'product_photo' ? (
                  <img src={photo.url} alt={photo.description ?? 'Product photo'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : photo.type === 'reference_video' ? (
                  <div style={{ textAlign: 'center', color: '#9E9890' }}>
                    <div style={{ fontSize: 48 }}>🎥</div>
                    <div style={{ fontSize: 12, marginTop: 8 }}>Video</div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: '#9E9890' }}>
                    <div style={{ fontSize: 48 }}>📄</div>
                    <div style={{ fontSize: 12, marginTop: 8 }}>Document</div>
                  </div>
                )}
                <div style={{ position: 'absolute', top: 8, right: 8 }}>
                  <span className="badge badge-gray" style={{ fontSize: 9 }}>{photo.type?.replace('_', ' ')}</span>
                </div>
              </div>

              {/* Info */}
              <div style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#1A1714', marginBottom: 2 }}>
                  {photo.lead?.company_name ?? 'Unknown Lead'}
                </div>
                <div style={{ fontSize: 12, color: '#9E9890', marginBottom: 8 }}>
                  {new Date(photo.uploaded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                {photo.description && (
                  <div style={{ fontSize: 12, color: '#6B6560', fontStyle: 'italic', marginBottom: 8 }}>
                    "{photo.description}"
                  </div>
                )}
                <a href={photo.url} download target="_blank" rel="noopener noreferrer"
                  className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center' }}
                  onClick={e => e.stopPropagation()}>
                  ↓ Download
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}
          onClick={() => setSelected(null)}>
          <div className="card" style={{ width: 600, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 20 }}>{selected.lead?.company_name}</div>
              <button className="btn btn-outline btn-sm" onClick={() => setSelected(null)}>✕</button>
            </div>
            {selected.type === 'product_photo' && (
              <img src={selected.url} alt="Product" style={{ width: '100%', borderRadius: 8, marginBottom: 16 }} />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: '#9E9890', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Lead</div>
                <div style={{ fontSize: 14, color: '#1A1714' }}>{selected.lead?.company_name}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#9E9890', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Received</div>
                <div style={{ fontSize: 14, color: '#1A1714' }}>{new Date(selected.uploaded_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</div>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#9E9890', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Your Notes</div>
              <textarea className="portal-input" style={{ width: '100%', height: 80, resize: 'vertical' }}
                defaultValue={selected.description ?? ''}
                onBlur={e => updateDescription(selected.id, e.target.value)}
                placeholder="Add notes about this product/media..."
              />
            </div>
            <a href={selected.url} download target="_blank" rel="noopener noreferrer" className="btn btn-accent" style={{ width: '100%', justifyContent: 'center' }}>
              ↓ Download Full Resolution
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
