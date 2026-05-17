// ─────────────────────────────────────────────────────────────
// GET  /api/leads/[id] — Full lead detail with conversations + meetings
// PATCH /api/leads/[id] — Update status, notes, deal value
// ─────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server';
import { supabase, requireAuth, ok, err, serverErr } from '../../../../lib/utils';
import { z } from 'zod';

const PatchSchema = z.object({
  status:     z.enum(['new','contacted','replied','interested','meeting_booked','converted','dead']).optional(),
  owner_name: z.string().optional(),
  notes:      z.string().optional(),
}).strict();

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    const { id } = params;

    // Lead
    const { data: lead, error: leadErr } = await supabase
      .from('leads').select('*').eq('id', id).single();
    if (leadErr || !lead) return err('Lead not found', 404);

    // Conversations
    const { data: conversations } = await supabase
      .from('conversations')
      .select('*')
      .eq('lead_id', id)
      .order('created_at', { ascending: true });

    // Meetings
    const { data: meetings } = await supabase
      .from('meetings').select('*').eq('lead_id', id).order('created_at', { ascending: false });

    // Media
    const { data: media } = await supabase
      .from('media').select('*').eq('lead_id', id).order('uploaded_at', { ascending: false });

    return ok({ lead, conversations, meetings, media });
  } catch (e) {
    return serverErr(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    const body   = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return err(parsed.error.message);

    const { data, error } = await supabase
      .from('leads')
      .update(parsed.data)
      .eq('id', params.id)
      .select()
      .single();

    if (error) return err(error.message);
    return ok(data);
  } catch (e) {
    return serverErr(e);
  }
}
