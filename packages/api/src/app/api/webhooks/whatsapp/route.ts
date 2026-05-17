// ─────────────────────────────────────────────────────────────
// GET  /api/webhooks/whatsapp — Meta webhook verification
// POST /api/webhooks/whatsapp — Inbound message handler
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import {
  handleWebhookVerification,
  verifyWebhookSignature,
  processWhatsAppWebhook,
} from '@hsm/messaging';

// ─── GET — webhook verification (Meta calls this on setup) ────
export async function GET(req: NextRequest) {
  const url       = new URL(req.url);
  const mode      = url.searchParams.get('hub.mode');
  const token     = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const { status, body } = handleWebhookVerification(mode, token, challenge);
  return new NextResponse(body, { status });
}

// ─── POST — inbound WA events ─────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const rawBody  = await req.text();
    const signature = req.headers.get('x-hub-signature-256') ?? '';

    // Verify webhook signature
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn('[WA Webhook] Invalid signature — rejected');
      return new NextResponse('Forbidden', { status: 403 });
    }

    const payload = JSON.parse(rawBody);

    // Process async — return 200 immediately (Meta requires fast response)
    processWhatsAppWebhook(payload).catch(err => {
      console.error('[WA Webhook] Processing error:', err.message);
    });

    // Meta requires 200 OK within 5 seconds
    return new NextResponse('OK', { status: 200 });

  } catch (err: any) {
    console.error('[WA Webhook] Parse error:', err.message);
    return new NextResponse('Bad Request', { status: 400 });
  }
}
