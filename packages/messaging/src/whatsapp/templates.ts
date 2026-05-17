// ─────────────────────────────────────────────────────────────
// HSM Messaging — WhatsApp Message Templates
// Pre-approved WA templates for first-time outreach.
// Free-form messages only work within 24h of lead's last reply.
// Outside 24h window → must use approved template.
// ─────────────────────────────────────────────────────────────

import { sendWhatsAppText } from './client';

const WA_API_URL         = process.env.WHATSAPP_API_URL!;
const WA_TOKEN           = process.env.WHATSAPP_API_TOKEN!;
const WA_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;

// ─────────────────────────────────────────────────────────────
// Check if we're within the 24h free messaging window
// (lead sent us a message in last 24h)
// ─────────────────────────────────────────────────────────────
export function isWithin24hWindow(lastInboundAt: Date | null): boolean {
  if (!lastInboundAt) return false;
  const diff = Date.now() - lastInboundAt.getTime();
  return diff < 24 * 60 * 60 * 1000;
}

// ─────────────────────────────────────────────────────────────
// Send using approved template (for first outreach or >24h gap)
// Template must be pre-approved in Meta Business Manager
// ─────────────────────────────────────────────────────────────
export async function sendTemplateMessage(
  to:           string,
  templateName: string,
  languageCode: string,
  components:   WATemplateComponent[],
): Promise<{ success: boolean; messageId: string | null; error?: string }> {
  const url  = `${WA_API_URL}/${WA_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type:     'template',
    template: {
      name:       templateName,
      language:   { code: languageCode },
      components,
    },
  };

  try {
    const res  = await fetch(url, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, messageId: null, error: data?.error?.message };
    return { success: true, messageId: data.messages?.[0]?.id ?? null };
  } catch (err: any) {
    return { success: false, messageId: null, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Smart send: use free-form if within window, template if not
// ─────────────────────────────────────────────────────────────
export async function smartSend(
  to:             string,
  freeFormText:   string,
  lastInboundAt:  Date | null,
  templateName:   string,
  templateParams: string[],
  languageCode:   string = 'en',
): Promise<{ success: boolean; messageId: string | null }> {
  if (isWithin24hWindow(lastInboundAt)) {
    // Free-form — richer, personalized
    const res = await sendWhatsAppText(to, freeFormText);
    return { success: res.success, messageId: res.messageId };
  }

  // Outside window — use approved template
  const components: WATemplateComponent[] = templateParams.length
    ? [{
        type:       'body',
        parameters: templateParams.map(text => ({ type: 'text', text })),
      }]
    : [];

  return sendTemplateMessage(to, templateName, languageCode, components);
}

// ─────────────────────────────────────────────────────────────
// HSM Pre-defined template names (register these in Meta BM)
// ─────────────────────────────────────────────────────────────
export const TEMPLATES = {
  // Initial outreach template
  // Variables: {{1}} = company name, {{2}} = industry
  OUTREACH_EN: 'hsm_outreach_v1',

  // Followup template
  // Variables: {{1}} = owner name
  FOLLOWUP_EN: 'hsm_followup_v1',

  // Meeting confirmation
  // Variables: {{1}} = owner name, {{2}} = date/time, {{3}} = meet link
  MEETING_CONFIRM: 'hsm_meeting_confirm_v1',
} as const;

// ─────────────────────────────────────────────────────────────
// Type helpers
// ─────────────────────────────────────────────────────────────
interface WATemplateComponent {
  type:        'header' | 'body' | 'button';
  parameters?: Array<{ type: string; text?: string; image?: { link: string } }>;
  sub_type?:   string;
  index?:      number;
}
