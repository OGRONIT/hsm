// ─────────────────────────────────────────────────────────────
// GET /api/leads — List leads with filters + pagination
// ─────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server';
import { supabase, requireAuth, ok, err, serverErr, parsePagination } from '../../lib/utils';

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    const url      = new URL(req.url);
    const { limit, offset } = parsePagination(url);

    // Filters
    const status   = url.searchParams.get('status');
    const source   = url.searchParams.get('source');
    const industry = url.searchParams.get('industry');
    const search   = url.searchParams.get('search');   // company name search
    const dateFrom = url.searchParams.get('from');
    const dateTo   = url.searchParams.get('to');

    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status)   query = query.eq('status', status);
    if (source)   query = query.eq('source', source);
    if (industry) query = query.eq('industry', industry);
    if (search)   query = query.ilike('company_name', `%${search}%`);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo)   query = query.lte('created_at', dateTo);

    const { data, error, count } = await query;
    if (error) return err(error.message);

    return ok({ leads: data, total: count, limit, offset });
  } catch (e) {
    return serverErr(e);
  }
}
