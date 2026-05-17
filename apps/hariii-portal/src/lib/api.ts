// HSM Hariii Portal — API Client
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

export const api = {
  analytics:     (range = '30d') => apiFetch<any>(`/analytics?range=${range}`),
  leads:         (p?: Record<string, string>) => apiFetch<any>(`/leads?${new URLSearchParams(p)}`),
  conversations: (p?: Record<string, string>) => apiFetch<any>(`/conversations?${new URLSearchParams(p)}`),
  meetings:      (p?: Record<string, string>) => apiFetch<any>(`/meetings?${new URLSearchParams(p)}`),
  patchMeeting:  (id: string, body: object)   => apiFetch<any>(`/meetings/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
};
