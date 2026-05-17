// ─────────────────────────────────────────────────────────────
// HSM Messaging — WhatsApp Webhook Handler
// Called by Next.js API route: POST /api/webhooks/whatsapp
// Handles: inbound messages, delivery receipts, media
// ─────────────────────────────────────────────────────────────

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppText, markMessageRead, downloadAndStoreMedia } from './client';
import { processInboundMessage } from '@hsm/bot';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const WA_APP_SECRET    = process.env.WHATSAPP_APP_SECRET!;
const VERIFY_TOKEN     = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN!;

// ─────────────────────────────────────────────────────────────
// Webhook verification (GET) — Meta calls this to verify endpoint
// ─────────────────────────────────────────────────────────────
export function handleWebhookVerification(
  mode:      string | null,
  token:     string | null,
  challenge: string | null,
): { status: number; body: string } {
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] Verified successfully');
    return { status: 200, body: challenge ?? '' };
  }
  console.warn('[WhatsApp Webhook] Verification failed — token mismatch');
  return { status: 403, body: 'Forbidden' };
}

// ─────────────────────────────────────────────────────────────
// Signature verification — every POST must be verified
// ─────────────────────────────────────────────────────────────
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!WA_APP_SECRET) {
    console.warn('[WhatsApp Webhook] WA_APP_SECRET not set — skipping signature check');
    return true;
  }
  const expected = 'sha256=' + crypto
    .createHmac('sha256', WA_APP_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Main webhook processor (POST)
// ─────────────────────────────────────────────────────────────
export async function processWhatsAppWebhook(payload: WAWebhookPayload): Promise<void> {
  const entry = payload.entry?.[0];
  if (!entry) return;

  const changes = entry.changes ?? [];

  for (const change of changes) {
    const value = change.value;
    if (!value) continue;

    // ── Delivery status updates ───────────────────────────────
    if (value.statuses?.length) {
      await handleStatusUpdates(value.statuses);
    }

    // ── Inbound messages ──────────────────────────────────────
    if (value.messages?.length) {
      for (const msg of value.messages) {
        await handleInboundMessage(msg, value.contacts?.[0]);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Handle inbound message from a lead
// ─────────────────────────────────────────────────────────────
async function handleInboundMessage(
  msg:     WAMessage,
  contact: WAContact | undefined,
): Promise<void> {
  const phone      = `+${msg.from}`;
  const waMessageId = msg.id;
  const msgType    = msg.type;

  console.log(`[WhatsApp Webhook] Inbound from ${phone} | type: ${msgType} | id: ${waMessageId}`);

  // Mark as read immediately (blue ticks for lead)
  await markMessageRead(waMessageId);

  // ── Find lead by phone ────────────────────────────────────
  const { data: lead } = await supabase
    .from('leads')
    .select('id, status, whatsapp_opt_out')
    .eq('phone', phone)
    .single();

  if (!lead) {
    // Unknown number — log and ignore (could be spam or wrong number)
    console.warn(`[WhatsApp Webhook] Unknown phone: ${phone} — no lead found`);
    await supabase.from('system_logs').insert({
      level:    'warn',
      source:   'webhooks',
      message:  `Inbound WA from unknown number: ${phone}`,
      metadata: { phone, msgType },
    });
    return;
  }

  if (lead.whatsapp_opt_out) {
    console.log(`[WhatsApp Webhook] Lead ${lead.id} is opted out — ignoring`);
    return;
  }

  // ── Extract message text ──────────────────────────────────
  let messageText = '';
  if (msgType === 'text') {
    messageText = msg.text?.body ?? '';
  } else if (msgType === 'interactive') {
    // Button reply or list reply
    messageText = msg.interactive?.button_reply?.title
      ?? msg.interactive?.list_reply?.title
      ?? '';
  } else if (['image', 'video', 'audio', 'document', 'voice'].includes(msgType)) {
    // Media message — extract caption if any
    const mediaObj = (msg as any)[msgType];
    messageText = mediaObj?.caption ?? `[${msgType} received]`;
  }

  // ── Log inbound conversation ──────────────────────────────
  await supabase.from('conversations').insert({
    lead_id:       lead.id,
    channel:       'whatsapp',
    direction:     'inbound',
    message:       messageText || `[${msgType}]`,
    wa_message_id: waMessageId,
    status:        'delivered',
  });

  // ── Handle media download ─────────────────────────────────
  if (['image', 'video', 'document'].includes(msgType)) {
    const mediaObj   = (msg as any)[msgType];
    const mediaId    = mediaObj?.id;
    const mimeType   = mediaObj?.mime_type ?? 'application/octet-stream';
    const mediaType  = msgType === 'image' ? 'product_photo'
                     : msgType === 'video' ? 'reference_video'
                     : 'document';

    if (mediaId) {
      // Fire and forget — don't block bot response on storage
      downloadAndStoreMedia(mediaId, lead.id, mimeType).then(({ url, storagePath }) => {
        if (url) {
          supabase.from('media').insert({
            lead_id:           lead.id,
            type:              mediaType,
            url,
            whatsapp_media_id: mediaId,
            mime_type:         mimeType,
            storage_path:      storagePath,
            description:       `Received via WhatsApp from ${contact?.profile?.name ?? phone}`,
          });
        }
      });
    }
  }

  // ── Route to bot ─────────────────────────────────────────
  try {
    const botResponse = await processInboundMessage({
      leadId:    lead.id,
      message:   messageText,
      channel:   'whatsapp',
      waMessage: msg as any,
    });

    // Bot said to send a reply
    if (botResponse.text) {
      const { success, messageId, error } = await sendWhatsAppText(phone, botResponse.text);

      // Log outbound bot reply
      await supabase.from('conversations').insert({
        lead_id:       lead.id,
        channel:       'whatsapp',
        direction:     'outbound',
        message:       botResponse.text,
        ai_model_used: botResponse.modelUsed as any,
        tokens_used:   botResponse.tokensUsed,
        cost_usd:      botResponse.costUsd,
        wa_message_id: messageId,
        status:        success ? 'sent' : 'failed',
        error_detail:  error,
      });
    }

  } catch (err: any) {
    console.error('[WhatsApp Webhook] Bot processing error:', err.message);
    await supabase.from('system_logs').insert({
      level:    'error',
      source:   'bot',
      message:  `Bot failed to process message from lead ${lead.id}`,
      metadata: { leadId: lead.id, error: err.message },
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Handle delivery/read status updates
// ─────────────────────────────────────────────────────────────
async function handleStatusUpdates(statuses: WAStatus[]): Promise<void> {
  for (const status of statuses) {
    const { id: waMessageId, status: deliveryStatus, errors } = status;

    const dbStatus = deliveryStatus === 'delivered' ? 'delivered'
                   : deliveryStatus === 'read'      ? 'read'
                   : deliveryStatus === 'failed'    ? 'failed'
                   : 'sent';

    const updatePayload: Record<string, any> = { status: dbStatus };

    if (errors?.length) {
      updatePayload.error_detail = errors[0]?.title ?? errors[0]?.message;
      console.warn(`[WhatsApp Webhook] Delivery failed for ${waMessageId}: ${updatePayload.error_detail}`);
    }

    await supabase
      .from('conversations')
      .update(updatePayload)
      .eq('wa_message_id', waMessageId);
  }
}

// ─────────────────────────────────────────────────────────────
// WhatsApp Webhook Payload Types
// ─────────────────────────────────────────────────────────────
export interface WAWebhookPayload {
  object: string;
  entry:  WAEntry[];
}

interface WAEntry {
  id:      string;
  changes: WAChange[];
}

interface WAChange {
  value: WAChangeValue;
  field: string;
}

interface WAChangeValue {
  messaging_product: string;
  metadata:          { display_phone_number: string; phone_number_id: string };
  contacts?:         WAContact[];
  messages?:         WAMessage[];
  statuses?:         WAStatus[];
}

export interface WAContact {
  profile: { name: string };
  wa_id:   string;
}

export interface WAMessage {
  from:         string;
  id:           string;
  timestamp:    string;
  type:         string;
  text?:        { body: string };
  image?:       { id: string; mime_type: string; sha256: string; caption?: string };
  video?:       { id: string; mime_type: string; sha256: string; caption?: string };
  audio?:       { id: string; mime_type: string; sha256: string };
  document?:    { id: string; mime_type: string; filename?: string; caption?: string };
  interactive?: {
    type:         string;
    button_reply?: { id: string; title: string };
    list_reply?:   { id: string; title: string; description?: string };
  };
  context?:     { from: string; id: string };
}

interface WAStatus {
  id:         string;
  status:     'sent' | 'delivered' | 'read' | 'failed';
  timestamp:  string;
  recipient_id: string;
  errors?:    Array<{ code: number; title: string; message: string }>;
}
