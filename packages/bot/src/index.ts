// ─────────────────────────────────────────────────────────────
// HSM Bot — Main Orchestrator
// Called by messaging webhook when a lead replies.
// Routes to correct flow based on lead state + message content.
// ─────────────────────────────────────────────────────────────

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { detectHandover, detectOptOut, isMediaMessage } from './handover/detector';
import { processIncomingLanguage } from './language/switcher';
import { generateOutreachMessage } from './flows/outreach';
import { generateFollowupMessage }  from './flows/followup';
import { handleObjection }          from './flows/objection-handler';
import { generateMeetingCloserMessage, generatePhotoAcknowledgement } from './flows/meeting-closer';
import { handleMeetingResponse, suggestMeetingSlot } from './flows/smart-meeting';
import { addBookingJob } from '@hsm/queue';

// Re-export flows for queue workers (stubs replaced by these)
export { generateOutreachMessage }  from './flows/outreach';
export { generateFollowupMessage }  from './flows/followup';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || 'placeholder-service-role-key',
);

const CALENDLY_URL = process.env.CALENDLY_BOOKING_URL ?? 'https://calendly.com/smit-hariii/20min';

export interface InboundMessage {
  leadId:    string;
  message:   string;
  channel:   'whatsapp' | 'email';
  waMessage?: Record<string, any>;  // Raw WA payload (for media detection)
}

export interface BotResponse {
  text:          string | null;    // null = no reply needed (e.g. opted out)
  tokensUsed:    number;
  costUsd:       number;
  modelUsed:     string;
  flowUsed:      string;
  hotLead:       boolean;
  optOut:        boolean;
}

// ─────────────────────────────────────────────────────────────
// Main entry point — called by WhatsApp webhook handler
// ─────────────────────────────────────────────────────────────
export async function processInboundMessage(input: InboundMessage): Promise<BotResponse> {
  const { leadId, message, channel, waMessage } = input;

  console.log(`[Bot] Processing inbound from lead ${leadId} via ${channel}`);

  // ── 0. Opt-out check ─────────────────────────────────────
  if (detectOptOut(message)) {
    await handleOptOut(leadId, channel);
    return { text: null, tokensUsed: 0, costUsd: 0, modelUsed: 'none', flowUsed: 'opt_out', hotLead: false, optOut: true };
  }

  // ── 1. Load lead context ──────────────────────────────────
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();

  if (leadErr || !lead) throw new Error(`Lead ${leadId} not found`);

  // ── 2. Detect & lock language ─────────────────────────────
  const detectedLang = await processIncomingLanguage(leadId, message);

  // ── 3. Smart meeting negotiation for interested leads ─────
  if (lead.status === 'interested') {
    const meetingResponse = await handleMeetingResponse(leadId, message, detectedLang);
    if (meetingResponse.text !== null || meetingResponse.flowUsed !== 'smart_meeting_idle') {
      return meetingResponse;
    }
  }

  // ── 4. Load conversation history (last 10 messages) ───────
  const { data: history } = await supabase
    .from('conversations')
    .select('direction, message, ai_model_used')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
    .limit(10);

  const conversationHistory = (history ?? []).map((h: { direction: string; message: string }) => ({
    role:    h.direction === 'outbound' ? 'assistant' as const : 'user' as const,
    content: h.message,
  }));

  // ── 5. Media message (lead sent photo/video unprompted) ──────
  // Bot NEVER asks for media — meeting is the only goal.
  // If lead sends media anyway, push straight to meeting booking.
  if (waMessage && isMediaMessage(waMessage)) {
    await updateLeadStatus(leadId, 'replied');
    const closer = await generateMeetingCloserMessage({
      leadId,
      companyName:         lead.company_name,
      ownerName:           lead.owner_name,
      industry:            lead.industry,
      source:              lead.source,
      channel,
      triggerMessage:      '[lead sent a product photo — use this as a reason to meet]',
      conversationHistory,
    });
    return { ...closer, modelUsed: 'claude-3-5-sonnet', flowUsed: 'media_meeting_push', hotLead: false, optOut: false };
  }

  // ── 6. Hot lead / handover detection ──────────────────────
  const handover = detectHandover(message);

  if (handover.isHotLead) {
    console.log(`[Bot] 🔥 HOT LEAD detected for ${lead.company_name} — trigger: "${handover.triggerWord}"`);

    // Queue the booking push job (sends calendar link + alerts Smit)
    await addBookingJob({
      leadId:         leadId,
      companyName:    lead.company_name,
      ownerName:      lead.owner_name,
      phone:          lead.phone,
      email:          lead.email,
      channel,
      language:       detectedLang,
      triggerMessage: message,
      calendlyUrl:    CALENDLY_URL,
      suppressOutbound: true,
    });

    await updateLeadStatus(leadId, 'interested');
    const smartMeeting = await suggestMeetingSlot(leadId, detectedLang, 1);
    return { text: smartMeeting, tokensUsed: 0, costUsd: 0, modelUsed: 'system', flowUsed: 'smart_meeting_initial', hotLead: true, optOut: false };
  }

  // ── 7. Update lead status to 'replied' if first reply ─────
  if (lead.status === 'contacted') {
    await updateLeadStatus(leadId, 'replied');
  }

  // ── 8. Route to objection handler (Claude) ────────────────
  const objResult = await handleObjection({
    leadId,
    companyName:         lead.company_name,
    ownerName:           lead.owner_name,
    industry:            lead.industry,
    source:              lead.source,
    channel,
    calendlyUrl:         CALENDLY_URL,
    incomingMessage:     message,
    conversationHistory,
  });

  return {
    text:       objResult.text,
    tokensUsed: objResult.tokensUsed,
    costUsd:    objResult.costUsd,
    modelUsed:  'claude-3-5-sonnet',
    flowUsed:   `objection_${objResult.objectionType}`,
    hotLead:    false,
    optOut:     false,
  };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
async function updateLeadStatus(leadId: string, status: string): Promise<void> {
  await supabase.from('leads').update({ status }).eq('id', leadId);
}

async function handleOptOut(leadId: string, channel: 'whatsapp' | 'email'): Promise<void> {
  const update = channel === 'whatsapp'
    ? { whatsapp_opt_out: true, status: 'dead' }
    : { email_opt_out: true, status: 'dead' };
  await supabase.from('leads').update(update).eq('id', leadId);
  await supabase.from('system_logs').insert({
    level:    'info',
    source:   'bot',
    message:  `Lead ${leadId} opted out via ${channel}`,
    metadata: { leadId, channel },
  });
  console.log(`[Bot] Lead ${leadId} opted out via ${channel} — marked dead`);
}
