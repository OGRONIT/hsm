// ─────────────────────────────────────────────────────────────
// HSM Alerts — WhatsApp Personal Alerts to Smit
// Sends key alerts to Smit's personal WhatsApp number.
// Uses same WA Business API but different recipient (Smit himself).
// Telegram is primary — WA is backup/redundancy for critical alerts.
// ─────────────────────────────────────────────────────────────

const WA_API_URL         = process.env.WHATSAPP_API_URL!;
const WA_TOKEN           = process.env.WHATSAPP_API_TOKEN!;
const WA_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const SMIT_WA_NUMBER     = process.env.SMIT_WHATSAPP_NUMBER!;  // e.g. 919876543210

// ─────────────────────────────────────────────────────────────
// Core send to Smit's personal WhatsApp
// ─────────────────────────────────────────────────────────────
async function sendToSmitWhatsApp(message: string): Promise<{ ok: boolean; error?: string }> {
  if (!SMIT_WA_NUMBER) {
    console.warn('[WA Alert] SMIT_WHATSAPP_NUMBER not set — skipping');
    return { ok: false, error: 'SMIT_WHATSAPP_NUMBER not configured' };
  }

  try {
    const res = await fetch(`${WA_API_URL}/${WA_PHONE_NUMBER_ID}/messages`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                SMIT_WA_NUMBER,
        type:              'text',
        text:              { body: message },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[WA Alert] Failed:', data?.error?.message);
      return { ok: false, error: data?.error?.message };
    }
    return { ok: true };
  } catch (err: any) {
    console.error('[WA Alert] Network error:', err.message);
    return { ok: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// 🔥 Meeting confirmed — WA alert to Smit
// ─────────────────────────────────────────────────────────────
export async function waAlertMeetingConfirmed(data: {
  companyName:  string;
  ownerName:    string | null;
  scheduledAt:  string;
  meetLink:     string | null;
}): Promise<void> {
  const scheduledIST = new Date(data.scheduledAt).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short',
  });

  const msg = [
    `🔥 MEETING CONFIRMED!`,
    ``,
    `Company: ${data.companyName}`,
    `Contact: ${data.ownerName ?? 'Unknown'}`,
    `Time: ${scheduledIST} IST`,
    data.meetLink ? `Link: ${data.meetLink}` : '',
  ].filter(Boolean).join('\n');

  await sendToSmitWhatsApp(msg);
}

// ─────────────────────────────────────────────────────────────
// 📊 Daily summary — WA to Smit (9pm IST)
// ─────────────────────────────────────────────────────────────
export async function waAlertDailySummary(data: {
  date:            string;
  leadsScraped:    number;
  messagesSent:    number;
  repliesReceived: number;
  meetingsBooked:  number;
  hotLeads:        number;
  monthTotal:      number;
  conversionRate:  string;
}): Promise<void> {
  const msg = [
    `📊 HSM Daily Report — ${data.date}`,
    ``,
    `Leads scraped:   ${data.leadsScraped}`,
    `Messages sent:   ${data.messagesSent}`,
    `Replies:         ${data.repliesReceived}`,
    `Hot leads:       ${data.hotLeads}`,
    `Meetings booked: ${data.meetingsBooked}`,
    ``,
    `Month total: ${data.monthTotal} meetings`,
    `Conversion: ${data.conversionRate}%`,
  ].join('\n');

  await sendToSmitWhatsApp(msg);
}

// ─────────────────────────────────────────────────────────────
// 🚨 Critical system error — WA to Smit
// Only for critical-level alerts (token revoked, scraper down, etc.)
// ─────────────────────────────────────────────────────────────
export async function waAlertCriticalError(data: {
  type:    string;
  source:  string;
  message: string;
}): Promise<void> {
  const msg = [
    `🚨 HSM SYSTEM ALERT`,
    ``,
    `Type: ${data.type}`,
    `Source: ${data.source}`,
    `Error: ${data.message.slice(0, 150)}`,
    ``,
    `Check admin panel immediately.`,
  ].join('\n');

  await sendToSmitWhatsApp(msg);
}
