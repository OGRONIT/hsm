// ─────────────────────────────────────────────────────────────
// HSM Messaging — Calendly Webhook Handler
// Called by Next.js API route: POST /api/webhooks/calendly
// Events: invitee.created (booked), invitee.canceled (cancelled)
// ─────────────────────────────────────────────────────────────

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CALENDLY_WEBHOOK_SECRET = process.env.CALENDLY_WEBHOOK_SECRET ?? '';

// ─────────────────────────────────────────────────────────────
// Verify Calendly webhook signature
// ─────────────────────────────────────────────────────────────
export function verifyCalendlySignature(
  rawBody:   string,
  signature: string,
  timestamp: string,
): boolean {
  if (!CALENDLY_WEBHOOK_SECRET) return true; // Skip in dev
  try {
    const toSign   = `${timestamp}.${rawBody}`;
    const expected = crypto
      .createHmac('sha256', CALENDLY_WEBHOOK_SECRET)
      .update(toSign)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Process Calendly event payload
// ─────────────────────────────────────────────────────────────
export async function processCalendlyWebhook(payload: CalendlyPayload): Promise<void> {
  const { event, payload: eventData } = payload;

  console.log(`[Calendly Webhook] Event: ${event}`);

  switch (event) {
    case 'invitee.created':
      await handleMeetingBooked(eventData);
      break;
    case 'invitee.canceled':
      await handleMeetingCancelled(eventData);
      break;
    default:
      console.log(`[Calendly Webhook] Unhandled event type: ${event}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Meeting booked
// ─────────────────────────────────────────────────────────────
async function handleMeetingBooked(data: CalendlyEventData): Promise<void> {
  const inviteeEmail = data.invitee?.email;
  const inviteeName  = data.invitee?.name;
  const eventId      = data.event?.uuid;
  const startTime    = data.event?.start_time;
  const meetLink     = data.event?.location?.join_url ?? null;

  console.log(`[Calendly] Meeting booked by ${inviteeName} (${inviteeEmail})`);

  // Find lead by email
  const { data: lead } = await supabase
    .from('leads')
    .select('id, company_name, owner_name, phone, industry, source')
    .eq('email', inviteeEmail)
    .single();

  if (!lead) {
    // Try by name as fallback
    console.warn(`[Calendly] No lead found for email: ${inviteeEmail}`);
    await supabase.from('system_logs').insert({
      level:    'warn',
      source:   'webhooks',
      message:  `Calendly booking from unknown email: ${inviteeEmail}`,
      metadata: { inviteeEmail, inviteeName, eventId },
    });
    return;
  }

  // Create or update meeting record
  const { data: existingMeeting } = await supabase
    .from('meetings')
    .select('id')
    .eq('lead_id', lead.id)
    .eq('status', 'pending')
    .single();

  const meetingPayload = {
    lead_id:            lead.id,
    status:             'confirmed',
    scheduled_at:       startTime,
    calendly_event_id:  eventId,
    calendly_event_url: data.event?.uri,
    meet_link:          meetLink,
    duration_minutes:   20,
  };

  if (existingMeeting) {
    await supabase.from('meetings').update(meetingPayload).eq('id', existingMeeting.id);
  } else {
    await supabase.from('meetings').insert(meetingPayload);
  }

  // Update lead status → meeting_booked
  await supabase
    .from('leads')
    .update({ status: 'meeting_booked' })
    .eq('id', lead.id);

  // Log conversation (system message)
  await supabase.from('conversations').insert({
    lead_id:   lead.id,
    channel:   'whatsapp',
    direction: 'inbound',
    message:   `[MEETING BOOKED via Calendly — ${new Date(startTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST]`,
    status:    'delivered',
  });

  // Fire alert to Smit
  await fireMeetingConfirmedAlert({
    companyName: lead.company_name,
    ownerName:   lead.owner_name,
    industry:    lead.industry,
    source:      lead.source,
    scheduledAt: startTime,
    meetLink,
    leadId:      lead.id,
  });

  await supabase.from('system_logs').insert({
    level:    'info',
    source:   'webhooks',
    message:  `Meeting confirmed: ${lead.company_name} at ${startTime}`,
    metadata: { leadId: lead.id, eventId, scheduledAt: startTime },
  });

  console.log(`[Calendly] ✓ Meeting confirmed for ${lead.company_name} — Smit alerted`);
}

// ─────────────────────────────────────────────────────────────
// Meeting cancelled
// ─────────────────────────────────────────────────────────────
async function handleMeetingCancelled(data: CalendlyEventData): Promise<void> {
  const eventId = data.event?.uuid;

  await supabase
    .from('meetings')
    .update({ status: 'cancelled' })
    .eq('calendly_event_id', eventId);

  console.log(`[Calendly] Meeting cancelled: ${eventId}`);
}

// ─────────────────────────────────────────────────────────────
// Alert Smit when a meeting is confirmed
// (Real implementation in packages/alerts — this is a direct call for reliability)
// ─────────────────────────────────────────────────────────────
async function fireMeetingConfirmedAlert(data: {
  companyName: string;
  ownerName:   string | null;
  industry:    string;
  source:      string;
  scheduledAt: string;
  meetLink:    string | null;
  leadId:      string;
}): Promise<void> {
  const adminUrl   = `${process.env.ADMIN_PANEL_URL ?? 'https://admin.hariii.design'}/leads/${data.leadId}`;
  const scheduledIST = new Date(data.scheduledAt).toLocaleString('en-IN', {
    timeZone:   'Asia/Kolkata',
    dateStyle:  'full',
    timeStyle:  'short',
  });

  const text = [
    `🔥 MEETING CONFIRMED!`,
    ``,
    `Company: ${data.companyName}`,
    `Contact: ${data.ownerName ?? 'Unknown'}`,
    `Industry: ${data.industry}`,
    `Source: ${data.source}`,
    `Time: ${scheduledIST} IST`,
    data.meetLink ? `Meet: ${data.meetLink}` : '',
    ``,
    `Details: ${adminUrl}`,
  ].filter(Boolean).join('\n');

  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (token && chatId) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text }),
    }).catch(err => console.error('[Calendly] Telegram alert failed:', err.message));
  }
}

// ─────────────────────────────────────────────────────────────
// Calendly Payload Types
// ─────────────────────────────────────────────────────────────
interface CalendlyPayload {
  event:   string;
  payload: CalendlyEventData;
}

interface CalendlyEventData {
  event?: {
    uuid:       string;
    uri:        string;
    start_time: string;
    end_time:   string;
    location?:  { join_url?: string; type?: string };
  };
  invitee?: {
    email: string;
    name:  string;
    uri:   string;
  };
  cancel_url?:   string;
  reschedule_url?: string;
}
