// POST /api/webhooks/calendly — Meeting booked/cancelled events
import { NextRequest, NextResponse } from 'next/server';
import { processCalendlyWebhook, verifyCalendlySignature } from '@hsm/messaging';

export async function POST(req: NextRequest) {
  try {
    const rawBody  = await req.text();
    const signature = req.headers.get('calendly-webhook-signature') ?? '';
    const timestamp = req.headers.get('calendly-webhook-timestamp') ?? '';

    if (!verifyCalendlySignature(rawBody, signature, timestamp)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const payload = JSON.parse(rawBody);
    processCalendlyWebhook(payload).catch(e => console.error('[Calendly Webhook]', e.message));

    return new NextResponse('OK', { status: 200 });
  } catch (e: any) {
    return new NextResponse('Bad Request', { status: 400 });
  }
}
