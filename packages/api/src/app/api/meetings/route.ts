// GET  /api/meetings — All meetings with lead info
// PATCH /api/meetings/[id] — Update outcome, deal value, notes

import { NextRequest } from 'next/server';
import { supabase, requireAuth, ok, err, serverErr, parsePagination } from '../../lib/utils';
import { z } from 'zod';

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    const url    = new URL(req.url);
    const { limit, offset } = parsePagination(url);
    const status = url.searchParams.get('status');
    const upcoming = url.searchParams.get('upcoming') === 'true';

    let query = supabase
      .from('meetings')
      .select(`
        *,
        lead:leads(id, company_name, owner_name, phone, email, industry, source)
      `, { count: 'exact' })
      .order('scheduled_at', { ascending: upcoming })
      .range(offset, offset + limit - 1);

    if (status)   query = query.eq('status', status);
    if (upcoming) query = query.gte('scheduled_at', new Date().toISOString());

    const { data, error, count } = await query;
    if (error) return err(error.message);

    return ok({ meetings: data, total: count, limit, offset });
  } catch (e) {
    return serverErr(e);
  }
}

// ─── PATCH /api/meetings/[id] ─────────────────────────────────
const MeetingPatchSchema = z.object({
  status:              z.enum(['pending','confirmed','cancelled','completed','no_show']).optional(),
  outcome:             z.enum(['deal_won','deal_lost','follow_up','not_qualified']).optional(),
  deal_value:          z.number().positive().optional(),
  notes:               z.string().optional(),
  post_meeting_notes:  z.string().optional(),
}).strict();

export async function PATCH(req: NextRequest) {
  // Extract ID from URL manually (shared route file)
  const id = req.url.split('/meetings/')[1]?.split('?')[0];
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    const body   = await req.json();
    const parsed = MeetingPatchSchema.safeParse(body);
    if (!parsed.success) return err(parsed.error.message);

    const { data, error } = await supabase
      .from('meetings')
      .update(parsed.data)
      .eq('id', id)
      .select()
      .single();

    if (error) return err(error.message);

    // If deal won → update lead to converted
    if (parsed.data.outcome === 'deal_won') {
      await supabase.from('leads')
        .update({ status: 'converted' })
        .eq('id', data.lead_id);
    }

    return ok(data);
  } catch (e) {
    return serverErr(e);
  }
}
