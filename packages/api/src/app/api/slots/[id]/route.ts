import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, ok, err, serverErr } from '../../../../lib/utils';
import { setSlotAvailability } from '../../../../lib/slots';

const PatchSchema = z.object({
  is_available: z.boolean(),
}).strict();

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return err(parsed.error.message);

    const slot = await setSlotAvailability(params.id, parsed.data.is_available);
    return ok({ slot });
  } catch (error) {
    return serverErr(error);
  }
}
