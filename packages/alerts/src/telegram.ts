// ─────────────────────────────────────────────────────────────
// HSM Alerts — Telegram Bot Client
// Sends all system alerts to Smit's Telegram chat.
// Bot token + chat ID set in env vars.
// ─────────────────────────────────────────────────────────────

const TELEGRAM_API = 'https://api.telegram.org';
const BOT_TOKEN    = () => process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID      = () => process.env.TELEGRAM_CHAT_ID!;

export type ParseMode = 'HTML' | 'Markdown' | 'MarkdownV2';

// ─────────────────────────────────────────────────────────────
// Core send function
// ─────────────────────────────────────────────────────────────
async function sendTelegramMessage(
  text:      string,
  parseMode: ParseMode = 'HTML',
  extra?:    Record<string, any>,
): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  const token  = BOT_TOKEN();
  const chatId = CHAT_ID();

  if (!token || !chatId) {
    console.warn('[Telegram] BOT_TOKEN or CHAT_ID not set — alert skipped');
    return { ok: false, error: 'Missing Telegram config' };
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        chat_id:                  chatId,
        text,
        parse_mode:               parseMode,
        disable_web_page_preview: true,
        ...extra,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error('[Telegram] Send failed:', data.description);
      return { ok: false, error: data.description };
    }
    return { ok: true, messageId: data.result?.message_id };
  } catch (err: any) {
    console.error('[Telegram] Network error:', err.message);
    return { ok: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Send a document/file to Smit (e.g. weekly report PDF)
// ─────────────────────────────────────────────────────────────
async function sendTelegramDocument(
  fileContent: Buffer,
  filename:    string,
  caption?:    string,
): Promise<{ ok: boolean }> {
  const token  = BOT_TOKEN();
  const chatId = CHAT_ID();
  if (!token || !chatId) return { ok: false };

  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('document', new Blob([fileContent]), filename);
    if (caption) form.append('caption', caption);

    const res  = await fetch(`${TELEGRAM_API}/bot${token}/sendDocument`, {
      method: 'POST',
      body:   form,
    });
    const data = await res.json();
    return { ok: data.ok };
  } catch {
    return { ok: false };
  }
}

// ─────────────────────────────────────────────────────────────
// Health check — used by admin panel
// ─────────────────────────────────────────────────────────────
export async function testTelegramConnection(): Promise<{ ok: boolean; botName?: string; error?: string }> {
  const token = BOT_TOKEN();
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  try {
    const res  = await fetch(`${TELEGRAM_API}/bot${token}/getMe`);
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.description };
    return { ok: true, botName: data.result?.username };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// ─── ALERT TYPES ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────

// 🔥 Meeting confirmed
export async function alertMeetingConfirmed(data: {
  companyName:  string;
  ownerName:    string | null;
  industry:     string;
  source:       string;
  scheduledAt:  string;
  meetLink:     string | null;
  leadId:       string;
}): Promise<void> {
  const scheduledIST = formatIST(data.scheduledAt);
  const adminUrl     = adminLink(data.leadId);

  const text = [
    `🔥 <b>MEETING CONFIRMED!</b>`,
    ``,
    `🏭 <b>${esc(data.companyName)}</b>`,
    `👤 ${esc(data.ownerName ?? 'Unknown')}`,
    `🏷 ${esc(data.industry)} • ${esc(data.source)}`,
    `📅 ${scheduledIST} IST`,
    data.meetLink ? `🔗 <a href="${data.meetLink}">Join Meeting</a>` : '',
    ``,
    `📋 <a href="${adminUrl}">View Lead</a>`,
  ].filter(Boolean).join('\n');

  await sendTelegramMessage(text);
  console.log(`[Telegram] ✓ Meeting confirmed alert sent for ${data.companyName}`);
}

// ⚡ Hot lead detected
export async function alertHotLead(data: {
  companyName:    string;
  ownerName:      string | null;
  industry:       string;
  source:         string;
  triggerMessage: string;
  leadId:         string;
}): Promise<void> {
  const adminUrl = adminLink(data.leadId);
  const preview  = data.triggerMessage.slice(0, 120);

  const text = [
    `⚡ <b>HOT LEAD — Interested!</b>`,
    ``,
    `🏭 <b>${esc(data.companyName)}</b>`,
    `👤 ${esc(data.ownerName ?? 'Unknown')}`,
    `🏷 ${esc(data.industry)} • ${esc(data.source)}`,
    ``,
    `💬 <i>"${esc(preview)}"</i>`,
    ``,
    `🤖 Bot pushing calendar link now...`,
    `📋 <a href="${adminUrl}">View Conversation</a>`,
  ].join('\n');

  await sendTelegramMessage(text);
}

// 📊 Daily summary (sent at 9pm IST every day)
export async function alertDailySummary(data: {
  date:           string;
  leadsScraped:   number;
  messagesSent:   number;
  repliesReceived:number;
  meetingsBooked: number;
  hotLeads:       number;
  monthTotal:     number;
  conversionRate: string;
}): Promise<void> {
  const text = [
    `📊 <b>Daily Report — ${data.date}</b>`,
    ``,
    `🔍 Leads scraped:    <b>${data.leadsScraped}</b>`,
    `📨 Messages sent:    <b>${data.messagesSent}</b>`,
    `💬 Replies received: <b>${data.repliesReceived}</b>`,
    `🔥 Hot leads:        <b>${data.hotLeads}</b>`,
    `📅 Meetings booked:  <b>${data.meetingsBooked}</b>`,
    ``,
    `📈 Month total: <b>${data.monthTotal} meetings</b>`,
    `📉 Conversion: <b>${data.conversionRate}%</b>`,
    ``,
    `<a href="${process.env.HARIII_PORTAL_URL ?? 'https://app.hariii.design'}/analytics">View Full Analytics</a>`,
  ].join('\n');

  await sendTelegramMessage(text);
}

// 📆 Weekly report (sent every Monday 9am IST)
export async function alertWeeklyReport(data: {
  weekLabel:        string;
  totalLeads:       number;
  contacted:        number;
  replied:          number;
  interested:       number;
  meetingsBooked:   number;
  converted:        number;
  topSource:        string;
  topIndustry:      string;
  totalCostUsd:     number;
  costPerMeeting:   number;
}): Promise<void> {
  const text = [
    `📆 <b>Weekly Report — ${data.weekLabel}</b>`,
    ``,
    `<b>Funnel</b>`,
    `• Leads scraped:  ${data.totalLeads}`,
    `• Contacted:      ${data.contacted}`,
    `• Replied:        ${data.replied}`,
    `• Interested:     ${data.interested}`,
    `• Meetings:       ${data.meetingsBooked}`,
    `• Converted:      ${data.converted}`,
    ``,
    `<b>Best Source:</b> ${esc(data.topSource)}`,
    `<b>Best Industry:</b> ${esc(data.topIndustry)}`,
    ``,
    `<b>Cost</b>`,
    `• Total spend:    $${data.totalCostUsd.toFixed(2)}`,
    `• Cost/meeting:   $${data.costPerMeeting.toFixed(2)}`,
    ``,
    `<a href="${process.env.HARIII_PORTAL_URL ?? 'https://app.hariii.design'}/analytics">Full Report →</a>`,
  ].join('\n');

  await sendTelegramMessage(text);
}

// 🚨 System error alert
export async function alertSystemError(data: {
  type:      string;
  source:    string;
  message:   string;
  timestamp: string;
}): Promise<void> {
  const text = [
    `🚨 <b>SYSTEM ALERT</b>`,
    ``,
    `⚠️ Type:    ${esc(data.type)}`,
    `📦 Source:  ${esc(data.source)}`,
    `❌ Error:   ${esc(data.message.slice(0, 200))}`,
    `🕐 Time:    ${formatIST(data.timestamp)}`,
    ``,
    `👉 <a href="${process.env.ADMIN_PANEL_URL ?? 'https://admin.hariii.design'}/logs">Check Logs</a>`,
  ].join('\n');

  await sendTelegramMessage(text);
}

// 🛡 Ban risk warning
export async function alertBanRisk(data: {
  scraperName: string;
  blockRate:   number;
  action:      string;
}): Promise<void> {
  const emoji = data.blockRate > 70 ? '🔴' : '🟡';
  const text  = [
    `${emoji} <b>BAN RISK ALERT</b>`,
    ``,
    `🕷 Scraper: ${esc(data.scraperName)}`,
    `📊 Block rate: <b>${data.blockRate}%</b>`,
    `🔧 Action: ${esc(data.action)}`,
    ``,
    `<a href="${process.env.ADMIN_PANEL_URL ?? 'https://admin.hariii.design'}/proxies">Check Proxies</a>`,
  ].join('\n');

  await sendTelegramMessage(text);
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function esc(text: string): string {
  return text.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] ?? c));
}

function formatIST(isoString: string): string {
  return new Date(isoString).toLocaleString('en-IN', {
    timeZone:  'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function adminLink(leadId: string): string {
  return `${process.env.ADMIN_PANEL_URL ?? 'https://admin.hariii.design'}/leads/${leadId}`;
}
