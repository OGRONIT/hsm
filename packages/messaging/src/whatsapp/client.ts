// ─────────────────────────────────────────────────────────────
// HSM Messaging — WhatsApp Business API Client
// Wraps Meta WhatsApp Cloud API (used via AiSensy or WATI,
// or directly with Meta credentials).
// ─────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || 'placeholder-service-role-key',
);

const WA_API_URL       = process.env.WHATSAPP_API_URL!;
const WA_TOKEN         = process.env.WHATSAPP_API_TOKEN!;
const WA_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface SendTextResult {
  success:   boolean;
  messageId: string | null;
  error?:    string;
  waError?:  { code: number; message: string };
}

export interface WAErrorResponse {
  error: {
    message:    string;
    type:       string;
    code:       number;
    error_data: { messaging_product: string; details: string };
  };
}

// ─────────────────────────────────────────────────────────────
// Core: Send a plain text WhatsApp message
// ─────────────────────────────────────────────────────────────
export async function sendWhatsAppText(
  to:      string,    // +91XXXXXXXXXX
  message: string,
): Promise<SendTextResult> {
  const url = `${WA_API_URL}/${WA_PHONE_NUMBER_ID}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                normalizePhone(to),
    type:              'text',
    text:              { body: message, preview_url: false },
  };

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      const err = (data as WAErrorResponse).error;
      console.error(`[WhatsApp] Send failed to ${to}: [${err?.code}] ${err?.message}`);

      // Log ban risk errors
      if (err?.code === 131026 || err?.code === 131047) {
        await logSystemEvent('warn', `WhatsApp message undeliverable to ${to} — may be blocked`, {
          code: err.code, phone: to,
        });
      }
      if (err?.code === 190) {
        await logSystemEvent('critical', 'WhatsApp API token expired/revoked — action required!', {
          code: err.code,
        });
      }

      return { success: false, messageId: null, error: err?.message, waError: { code: err?.code, message: err?.message } };
    }

    const messageId = data.messages?.[0]?.id ?? null;
    console.log(`[WhatsApp] ✓ Sent to ${to} | msgId: ${messageId}`);
    return { success: true, messageId };

  } catch (err: any) {
    console.error('[WhatsApp] Network error:', err.message);
    return { success: false, messageId: null, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Download media sent by a lead (product photos, videos)
// WA media IDs expire after 30 days — download immediately
// ─────────────────────────────────────────────────────────────
export async function downloadAndStoreMedia(
  mediaId:  string,
  leadId:   string,
  mimeType: string,
): Promise<{ url: string | null; storagePath: string | null }> {
  try {
    // Step 1: Get the media URL from WA
    const urlRes = await fetch(`${WA_API_URL}/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${WA_TOKEN}` },
    });

    if (!urlRes.ok) {
      console.error(`[WhatsApp] Failed to get media URL for ${mediaId}`);
      return { url: null, storagePath: null };
    }

    const { url: mediaUrl } = await urlRes.json();

    // Step 2: Download the actual file
    const fileRes = await fetch(mediaUrl, {
      headers: { 'Authorization': `Bearer ${WA_TOKEN}` },
    });

    if (!fileRes.ok) {
      console.error(`[WhatsApp] Failed to download media from ${mediaUrl}`);
      return { url: null, storagePath: null };
    }

    const buffer     = await fileRes.arrayBuffer();
    const ext        = mimeTypeToExt(mimeType);
    const fileName   = `${leadId}/${mediaId}.${ext}`;
    const storagePath = `media/${fileName}`;

    // Step 3: Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('hsm-media')
      .upload(storagePath, buffer, {
        contentType:  mimeType,
        cacheControl: '3600',
        upsert:       false,
      });

    if (uploadError) {
      console.error('[WhatsApp] Storage upload failed:', uploadError.message);
      return { url: null, storagePath: null };
    }

    const { data: publicData } = supabase.storage
      .from('hsm-media')
      .getPublicUrl(storagePath);

    const publicUrl = publicData.publicUrl;

    console.log(`[WhatsApp] ✓ Media stored: ${storagePath}`);
    return { url: publicUrl, storagePath };

  } catch (err: any) {
    console.error('[WhatsApp] Media download error:', err.message);
    return { url: null, storagePath: null };
  }
}

// ─────────────────────────────────────────────────────────────
// Mark a message as read (shows blue ticks to lead)
// ─────────────────────────────────────────────────────────────
export async function markMessageRead(messageId: string): Promise<void> {
  try {
    await fetch(`${WA_API_URL}/${WA_PHONE_NUMBER_ID}/messages`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status:            'read',
        message_id:        messageId,
      }),
    });
  } catch {
    // Non-critical — don't throw
  }
}

// ─────────────────────────────────────────────────────────────
// Health check — used by admin panel "Test Key" button
// ─────────────────────────────────────────────────────────────
export async function testWhatsAppConnection(): Promise<{ ok: boolean; error?: string; phoneNumberId?: string }> {
  try {
    const res = await fetch(`${WA_API_URL}/${WA_PHONE_NUMBER_ID}`, {
      headers: { 'Authorization': `Bearer ${WA_TOKEN}` },
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error?.message };
    return { ok: true, phoneNumberId: data.id };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function normalizePhone(phone: string): string {
  // Strip all non-digits, ensure +91 prefix
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function mimeTypeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg':       'jpg',
    'image/png':        'png',
    'image/webp':       'webp',
    'video/mp4':        'mp4',
    'video/3gpp':       '3gp',
    'audio/ogg':        'ogg',
    'audio/mpeg':       'mp3',
    'application/pdf':  'pdf',
  };
  return map[mime] ?? 'bin';
}

async function logSystemEvent(level: string, message: string, metadata: object): Promise<void> {
  await supabase.from('system_logs').insert({ level, source: 'messaging', message, metadata });
}
