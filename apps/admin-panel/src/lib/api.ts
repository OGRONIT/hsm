// ─────────────────────────────────────────────────────────────
// HSM Admin Panel — API Client
// All fetch calls to the backend API routes
// ─────────────────────────────────────────────────────────────

const API_BASE   = process.env.NEXT_PUBLIC_API_URL ?? '/api';
const API_SECRET = process.env.NEXT_PUBLIC_ADMIN_API_SECRET ?? '';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${API_SECRET}`,
      ...opts?.headers,
    },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error ?? 'API error');
  return data.data as T;
}

// ─── Leads ────────────────────────────────────────────────────
export const leadsApi = {
  list:   (params?: Record<string, string>) => apiFetch<any>(`/leads?${new URLSearchParams(params)}`),
  get:    (id: string)                       => apiFetch<any>(`/leads/${id}`),
  patch:  (id: string, body: object)         => apiFetch<any>(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
};

// ─── Scrapers ─────────────────────────────────────────────────
export const scraperApi = {
  status:   ()                            => apiFetch<any>('/scraper'),
  action:   (action: string, scraper: string) => apiFetch<any>('/scraper', { method: 'POST', body: JSON.stringify({ action, scraper }) }),
};

// ─── Bot ──────────────────────────────────────────────────────
export const botApi = {
  status:   ()                      => apiFetch<any>('/bot'),
  action:   (body: object)          => apiFetch<any>('/bot', { method: 'POST', body: JSON.stringify(body) }),
};

// ─── Queue ────────────────────────────────────────────────────
export const queueApi = {
  stats: () => apiFetch<any>('/queue'),
};

// ─── API Keys ─────────────────────────────────────────────────
export const keysApi = {
  list:   ()           => apiFetch<any>('/keys'),
  action: (body: object) => apiFetch<any>('/keys', { method: 'POST', body: JSON.stringify(body) }),
};

// ─── Analytics ────────────────────────────────────────────────
export const analyticsApi = {
  get: (range = '30d') => apiFetch<any>(`/analytics?range=${range}`),
};

// ─── Logs ─────────────────────────────────────────────────────
export const logsApi = {
  list: (params?: Record<string, string>) => apiFetch<any>(`/logs?${new URLSearchParams(params)}`),
};

// ─── Conversations ────────────────────────────────────────────
export const conversationsApi = {
  list: (params?: Record<string, string>) => apiFetch<any>(`/conversations?${new URLSearchParams(params)}`),
};

// ─── Meetings ─────────────────────────────────────────────────
export const meetingsApi = {
  list:  (params?: Record<string, string>) => apiFetch<any>(`/meetings?${new URLSearchParams(params)}`),
  patch: (id: string, body: object)        => apiFetch<any>(`/meetings/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
};
