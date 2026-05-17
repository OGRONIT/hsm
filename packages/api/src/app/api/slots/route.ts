import { NextRequest } from 'next/server';
import { requireAuth, ok, err, serverErr, supabase } from '../../../lib/utils';
import { listAvailableSlots } from '../../../lib/slots';

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    const url = new URL(req.url);
    const daysAhead = Math.min(30, Math.max(1, Number(url.searchParams.get('daysAhead') ?? '14')));
    const slots = await listAvailableSlots(daysAhead);
    const now = new Date().toISOString();
    const until = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

    const { data: bookedSlots } = await supabase
      .from('meeting_slots')
      .select('*')
      .eq('is_available', false)
      .gt('slot_datetime', now)
      .lt('slot_datetime', until)
      .order('slot_datetime', { ascending: true });

    return ok({
      slots,
      bookedSlots: bookedSlots ?? [],
      daysAhead,
      total: slots.length,
    });
  } catch (error) {
    return serverErr(error);
  }
}
