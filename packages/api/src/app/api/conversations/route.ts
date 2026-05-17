// GET /api/conversations — All conversations with lead info
import { NextRequest } from 'next/server';
import { supabase, requireAuth, ok, err, serverErr, parsePagination } from '../../lib/utils';

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    const url    = new URL(req.url);
    const { limit, offset } = parsePagination(url);
    const leadId  = url.searchParams.get('lead_id');
    const channel = url.searchParams.get('channel');
    const direction = url.searchParams.get('direction');

    let query = supabase
      .from('conversations')
      .select(`
        *,
        lead:leads(id, company_name, owner_name, phone, industry, source, status)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (leadId)    query = query.eq('lead_id', leadId);
    if (channel)   query = query.eq('channel', channel);
    if (direction) query = query.eq('direction', direction);

    const { data, error, count } = await query;
    if (error) return err(error.message);

    return ok({ conversations: data, total: count, limit, offset });
  } catch (e) {
    return serverErr(e);
  }
}
