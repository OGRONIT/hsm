import { Worker, Job } from 'bullmq';
import { redis } from '../redis';
import { BookingJob, BookingJobSchema, JobResult, QueueName } from '../types/jobs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || 'placeholder-service-role-key',
);

const CALENDLY_URL = process.env.CALENDLY_BOOKING_URL ?? 'https://calendly.com/smit-hariii/20min';

// ─────────────────────────────────────────────────────────────
// BOOKING WORKER
// Hot-lead detected → send Calendly link → alert Smit on Telegram
// ─────────────────────────────────────────────────────────────
export const bookingWorker = new Worker<BookingJob, JobResult>(
  QueueName.BOOKING,
  async (job: Job<BookingJob>): Promise<JobResult> => {
    console.log(`[BookingWorker] 🔥 HOT LEAD — ${job.data.companyName}`);

    const data = BookingJobSchema.parse(job.data);

    // 1. Final status check — don't send booking link if already booked
    const { data: lead } = await supabase
      .from('leads')
      .select('id, status, company_name, industry, source')
      .eq('id', data.leadId)
      .single();

    if (!lead || lead.status === 'meeting_booked' || lead.status === 'converted') {
      console.log(`[BookingWorker] Lead already at ${lead?.status} — skipping`);
      return { success: true, leadId: data.leadId, channel: data.channel };
    }

    // 2. Generate booking push message unless the bot already sent the slot suggestion
    const message = data.suppressOutbound ? '' : buildBookingMessage(data);

    // 3. Send via WhatsApp or email
    let messageId: string;
    if (data.suppressOutbound) {
      messageId = `booking_suppressed_${Date.now()}`;
    } else if (data.channel === 'whatsapp') {
      messageId = await sendWhatsAppMessage(data.phone, message);
    } else {
      messageId = await sendEmail(data.email!, data.companyName, message);
    }

    // 4. Update lead status → 'interested'
    await supabase
      .from('leads')
      .update({ status: 'interested' })
      .eq('id', data.leadId);

    // 5. Log conversation
    if (!data.suppressOutbound) {
      await supabase.from('conversations').insert({
        lead_id:       data.leadId,
        channel:       data.channel,
        direction:     'outbound',
        message,
        language:      data.language,
        ai_model_used: 'claude-3-5-sonnet',
        wa_message_id: data.channel === 'whatsapp' ? messageId : null,
        email_id:      data.channel === 'email' ? messageId : null,
        status:        'sent',
      });
    }

    // 6. 🔔 ALERT SMIT — Telegram + WhatsApp
    await fireHotLeadAlert({
      companyName:    lead.company_name,
      ownerName:      data.ownerName,
      industry:       lead.industry,
      source:         lead.source,
      triggerMessage: data.triggerMessage,
      leadId:         data.leadId,
    });

    await supabase.from('system_logs').insert({
      level:    'info',
      source:   'bot',
      message:  `Booking push sent to HOT LEAD ${data.companyName}`,
      metadata: { leadId: data.leadId, triggerMessage: data.triggerMessage },
    });

    console.log(`[BookingWorker] ✓ Booking link sent to ${data.companyName} | Smit alerted`);

    return {
      success:   true,
      leadId:    data.leadId,
      channel:   data.channel,
      messageId,
    };
  },
  {
    connection:  redis,
    concurrency: 10,    // High concurrency — booking must be instant
  },
);

bookingWorker.on('completed', (job) => {
  console.log(`[BookingWorker] Job ${job.id} completed — 🔥 lead pushed to booking`);
});

bookingWorker.on('failed', async (job, err) => {
  console.error(`[BookingWorker] CRITICAL — booking job ${job?.id} failed:`, err.message);
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || 'placeholder-service-role-key',
  );
  await sb.from('system_logs').insert({
    level:    'critical',
    source:   'queue',
    message:  `BOOKING JOB FAILED for ${job?.data?.companyName}`,
    metadata: { error: err.message, leadId: job?.data?.leadId },
  });
  // Also alert Smit on Telegram that a hot lead booking push failed
  await sendTelegramAlert(
    `🚨 BOOKING JOB FAILED\n\nLead: ${job?.data?.companyName}\nError: ${err.message}\n\nCheck admin panel immediately.`,
  );
});

// ─────────────────────────────────────────────────────────────
// Message builders
// ─────────────────────────────────────────────────────────────
function buildBookingMessage(data: BookingJob): string {
  const name = data.ownerName ?? 'sir';

  const templates: Record<string, string> = {
    en: `${name}, great to hear you're interested! Let's schedule a quick 20-minute call where I can show you exactly what we can do for your products.\n\n📅 Book here: ${CALENDLY_URL}\n\nLooking forward to connecting!`,
    hi: `${name} ji, bahut achha! Chalo ek 20-minute call schedule karte hain — main specifically aapke products ke liye kya kar sakte hain woh dikhata hoon.\n\n📅 Yahan book karein: ${CALENDLY_URL}`,
    gu: `${name} saheb, khub saru! Chalo ek 20-minute call gohviye — main tamara products mate specifically shu kari shakiye te dakhavis.\n\n📅 Yahan book karo: ${CALENDLY_URL}`,
    hinglish: `${name} bhai, bahut badhiya! Ek 20-minute call pe milte hain — main specifically aapke products ke liye kya kar sakte hain dikhata hoon.\n\n📅 Book karo: ${CALENDLY_URL}`,
    gujlish: `${name} bhai, saru! Ek 20-minute call karie — main specifically tamara products mate shu kari shakiye te dakhavis.\n\n📅 Book karo: ${CALENDLY_URL}`,
  };

  return templates[data.language] ?? templates.en;
}

// ─────────────────────────────────────────────────────────────
// Hot lead alert to Smit (Telegram + WhatsApp)
// ─────────────────────────────────────────────────────────────
interface AlertPayload {
  companyName:    string;
  ownerName:      string | null;
  industry:       string;
  source:         string;
  triggerMessage: string;
  leadId:         string;
}

async function fireHotLeadAlert(payload: AlertPayload): Promise<void> {
  const adminPanelUrl = `${process.env.ADMIN_PANEL_URL ?? 'https://admin.hariii.design'}/leads/${payload.leadId}`;

  const text = [
    `⚡ HOT LEAD — Interested!`,
    ``,
    `Company: ${payload.companyName}`,
    `Contact: ${payload.ownerName ?? 'Unknown'}`,
    `Industry: ${payload.industry}`,
    `Source: ${payload.source}`,
    ``,
    `They said: "${payload.triggerMessage.slice(0, 100)}"`,
    ``,
    `Status: Interested → Sending calendar link now`,
    `View: ${adminPanelUrl}`,
  ].join('\n');

  // Fire both alerts in parallel — don't wait for each other
  await Promise.allSettled([
    sendTelegramAlert(text),
    sendWhatsAppAlert(text),
  ]);
}

// ─────────────────────────────────────────────────────────────
// Stubs (replaced by packages/alerts in Step 5)
// ─────────────────────────────────────────────────────────────
async function sendTelegramAlert(text: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  } catch (err) {
    console.error('[BookingWorker] Telegram alert failed:', err);
  }
}

async function sendWhatsAppAlert(_text: string): Promise<void> {
  // Stub: real call → packages/alerts/src/whatsapp.ts
  console.log('[Stub] WhatsApp alert to Smit fired');
}

async function sendWhatsAppMessage(phone: string, message: string): Promise<string> {
  // Stub: real call → packages/messaging/src/whatsapp/client.ts
  console.log(`[Stub] WA booking → ${phone}`);
  return `wa_booking_stub_${Date.now()}`;
}

async function sendEmail(email: string, company: string, message: string): Promise<string> {
  console.log(`[Stub] Email booking → ${email}`);
  return `email_booking_stub_${Date.now()}`;
}
