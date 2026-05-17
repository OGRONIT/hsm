import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, ok, err, serverErr } from '../../../lib/utils';
import { generateAvailableSlots } from '../../../../../../bot/src/flows/smart-meeting';

const GenerateSchema = z.object({
  daysAhead: z.number().int().min(1).max(30).optional(),
}).strict();

export async function POST(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = GenerateSchema.safeParse(body);
    if (!parsed.success) return err(parsed.error.message);

    const daysAhead = parsed.data.daysAhead ?? 14;
    const slots = await generateAvailableSlots(daysAhead);

    return ok({
      generated: slots.length,
      daysAhead,
    });
  } catch (error) {
    return serverErr(error);
  }
}
