// GET /api/logs — System logs with filters (admin panel live feed)
import { NextRequest } from 'next/server';
import { supabase, requireAuth, ok, err, serverErr, parsePagination } from '../../lib/utils';

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    const url    = new URL(req.url);
    const { limit, offset } = parsePagination(url);
    const level  = url.searchParams.get('level');
    const source = url.searchParams.get('source');
    const since  = url.searchParams.get('since');    // ISO date

    let query = supabase
      .from('system_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (level)  query = query.eq('level', level);
    if (source) query = query.eq('source', source);
    if (since)  query = query.gte('created_at', since);

    const { data, error, count } = await query;
    if (error) return err(error.message);

    return ok({ logs: data, total: count, limit, offset });
  } catch (e) {
    return serverErr(e);
  }
}
