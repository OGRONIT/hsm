import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { detectYesNo } from '../handover/detector';
import { DetectedLanguage } from '../language/detector';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || 'placeholder-service-role-key',
);

const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const NEGOTIATION_TTL_SECONDS = 7 * 24 * 60 * 60;
const SLOT_BUFFER_MS = 2 * 60 * 60 * 1000;
const DEFAULT_LANGUAGE: DetectedLanguage = 'en';

export interface MeetingSlotRow {
  id: string;
  slot_date: string;
  slot_time: string;
  slot_datetime: string;
  is_available: boolean;
  meeting_id: string | null;
  lead_id: string | null;
  created_at?: string;
}

interface PendingMeetingSlotState {
  slotId: string;
  slotDate: string;
  slotTime: string;
  slotDatetime: string;
  language: DetectedLanguage;
}

interface MeetingReply {
  text: string | null;
  tokensUsed: number;
  costUsd: number;
  modelUsed: string;
  flowUsed: string;
  hotLead: boolean;
  optOut: boolean;
}

interface ParsedTime {
  hour: number;
  minute: number;
}

const YES_NO_TEMPLATES: Record<DetectedLanguage, string> = {
  en: 'Perfect! Confirming {{day}}, {{date}} at {{time}} IST. Reply YES to confirm or NO to pick another time.',
  hi: 'Theek hai! {{day}}, {{date}} ko {{time}} IST pe call fix karoon? YES likhen confirm ke liye, NO likhen aur time ke liye.',
  gu: 'Saru! {{day}}, {{date}} na {{time}} IST e call fix karun? Confirm mate YES, badla mate NO.',
  hinglish: 'Perfect bhai! {{day}}, {{date}} {{time}} IST pe call karein? YES for confirm, NO for reschedule.',
  gujlish: 'Saru bhai! {{day}}, {{date}} {{time}} IST e fix karun? YES lakhjo confirm mate, NO lakhjo change mate.',
};

const BOOKED_TEMPLATES: Record<DetectedLanguage, string> = {
  en: 'Great, your call is confirmed for {{day}}, {{date}} at {{time}} IST. See you then.',
  hi: 'Great, aapki call {{day}}, {{date}} ko {{time}} IST pe confirm ho gayi hai. Milte hain.',
  gu: 'Saru, tamari call {{day}}, {{date}} na {{time}} IST e confirm thai gai chhe. Malishu.',
  hinglish: 'Great bhai, your call is confirmed for {{day}}, {{date}} at {{time}} IST. Milte hain.',
  gujlish: 'Great bhai, tamari call {{day}}, {{date}} na {{time}} IST e confirm thai gai chhe. Malishu.',
};

const FAILED_TEMPLATES: Record<DetectedLanguage, string> = {
  en: 'No worries, we will reconnect shortly and sort out the best time.',
  hi: 'Koi baat nahi, hum thodi der me phir se best time set kar lenge.',
  gu: 'Koi tension nahi, thodi vaar ma fari thi saru time set kari laishun.',
  hinglish: 'No worries bhai, thodi der me phir best time set karte hain.',
  gujlish: 'Koi tension nahi bhai, thodi vaar ma fari thi best time set kari laishu.',
};

function toIstDate(date = new Date()): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

function getIstDateString(date = new Date()): string {
  const ist = toIstDate(date);
  return ist.toISOString().slice(0, 10);
}

function getIstDateTimeParts(date = new Date()): {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
} {
  const ist = toIstDate(date);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
    weekday: ist.getUTCDay(),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatIstDateLabel(slotDateTime: string): { day: string; date: string; time: string } {
  const date = new Date(slotDateTime);
  return {
    day: date.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' }),
    date: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }),
    time: date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }),
  };
}

function toSlotDateTime(slotDate: string, slotTime: string): Date {
  const [year, month, day] = slotDate.split('-').map(Number);
  const [hour, minute] = slotTime.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MS);
}

function getNextBusinessDate(startDate = new Date()): Date {
  const base = toIstDate(startDate);
  while (base.getUTCDay() === 0) {
    base.setUTCDate(base.getUTCDate() + 1);
  }
  return base;
}

function normalizeToSlotBoundary(hour: number, minute: number): ParsedTime {
  const totalMinutes = hour * 60 + minute;
  const normalized = Math.round(totalMinutes / 30) * 30;
  return {
    hour: Math.floor(normalized / 60),
    minute: normalized % 60,
  };
}

function isBusinessHour(hour: number, minute: number): boolean {
  const totalMinutes = hour * 60 + minute;
  return totalMinutes >= 10 * 60 && totalMinutes < 18 * 60;
}

function buildSlotFromIstDate(date: Date, hour: number, minute: number): MeetingSlotRow | null {
  if (date.getUTCDay() === 0) return null;
  if (!isBusinessHour(hour, minute)) return null;

  const slotDate = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const slotTime = `${pad(hour)}:${pad(minute)}:00`;
  const slotDatetime = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute) - IST_OFFSET_MS);

  return {
    id: `${slotDate}-${slotTime}`,
    slot_date: slotDate,
    slot_time: slotTime,
    slot_datetime: slotDatetime.toISOString(),
    is_available: true,
    meeting_id: null,
    lead_id: null,
  };
}

async function logSystemEvent(level: 'info' | 'warn' | 'error' | 'critical', message: string, metadata: Record<string, unknown>): Promise<void> {
  try {
    await supabase.from('system_logs').insert({
      level,
      source: 'bot',
      message,
      metadata,
    });
  } catch (error) {
    console.error('[SmartMeeting] Failed to log system event:', error);
  }
}

async function setNegotiationRound(leadId: string, round: number): Promise<void> {
  await redis.set(`hsm:meeting-negotiation:${leadId}`, String(round), 'EX', NEGOTIATION_TTL_SECONDS);
}

export async function getNegotiationRound(leadId: string): Promise<number> {
  const value = await redis.get(`hsm:meeting-negotiation:${leadId}`);
  return value ? Number(value) || 0 : 0;
}

async function incrementNegotiationRound(leadId: string): Promise<number> {
  const current = await getNegotiationRound(leadId);
  const next = current + 1;
  await setNegotiationRound(leadId, next);
  return next;
}

async function clearNegotiationState(leadId: string): Promise<void> {
  await redis.del(`hsm:meeting-negotiation:${leadId}`);
  await redis.del(`hsm:meeting-pending-slot:${leadId}`);
}

async function setPendingSlot(leadId: string, slot: MeetingSlotRow, language: DetectedLanguage): Promise<void> {
  const state: PendingMeetingSlotState = {
    slotId: slot.id,
    slotDate: slot.slot_date,
    slotTime: slot.slot_time,
    slotDatetime: slot.slot_datetime,
    language,
  };
  await redis.set(`hsm:meeting-pending-slot:${leadId}`, JSON.stringify(state), 'EX', NEGOTIATION_TTL_SECONDS);
}

async function getPendingSlot(leadId: string): Promise<PendingMeetingSlotState | null> {
  const raw = await redis.get(`hsm:meeting-pending-slot:${leadId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingMeetingSlotState;
  } catch {
    return null;
  }
}

async function clearPendingSlot(leadId: string): Promise<void> {
  await redis.del(`hsm:meeting-pending-slot:${leadId}`);
}

async function getSlotById(slotId: string): Promise<MeetingSlotRow | null> {
  const { data, error } = await supabase
    .from('meeting_slots')
    .select('*')
    .eq('id', slotId)
    .maybeSingle();

  if (error) {
    await logSystemEvent('error', 'Failed to load meeting slot by ID', { slotId, error: error.message });
    throw error;
  }

  return data ? (data as MeetingSlotRow) : null;
}

async function getSlotByDateTime(slotDateTime: Date): Promise<MeetingSlotRow | null> {
  const parts = getIstDateTimeParts(slotDateTime);
  const slotDate = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  const slotTime = `${pad(parts.hour)}:${pad(parts.minute)}:00`;

  const { data, error } = await supabase
    .from('meeting_slots')
    .select('*')
    .eq('slot_date', slotDate)
    .eq('slot_time', slotTime)
    .maybeSingle();

  if (error) {
    await logSystemEvent('error', 'Failed to load meeting slot by datetime', { slotDateTime: slotDateTime.toISOString(), error: error.message });
    throw error;
  }

  return data ? (data as MeetingSlotRow) : null;
}

export async function generateAvailableSlots(daysAhead: number): Promise<MeetingSlotRow[]> {
  try {
    const rows: Array<Pick<MeetingSlotRow, 'slot_date' | 'slot_time' | 'slot_datetime' | 'is_available'>> = [];
    const todayIst = getNextBusinessDate();

    for (let dayOffset = 0; dayOffset <= daysAhead; dayOffset += 1) {
      const current = new Date(todayIst.getTime());
      current.setUTCDate(current.getUTCDate() + dayOffset);
      if (current.getUTCDay() === 0) continue;

      for (let minutes = 10 * 60; minutes < 18 * 60; minutes += 30) {
        const hour = Math.floor(minutes / 60);
        const minute = minutes % 60;
        const slotDate = `${current.getUTCFullYear()}-${pad(current.getUTCMonth() + 1)}-${pad(current.getUTCDate())}`;
        const slotTime = `${pad(hour)}:${pad(minute)}:00`;
        const slotDatetime = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(), hour, minute) - IST_OFFSET_MS);

        rows.push({
          slot_date: slotDate,
          slot_time: slotTime,
          slot_datetime: slotDatetime.toISOString(),
          is_available: true,
        });
      }
    }

    if (rows.length === 0) return [];

    const { data, error } = await supabase
      .from('meeting_slots')
      .upsert(rows, { onConflict: 'slot_date,slot_time', ignoreDuplicates: true })
      .select('*');

    if (error) {
      await logSystemEvent('error', 'Slot generation failed', { daysAhead, error: error.message });
      throw error;
    }

    return (data ?? []) as MeetingSlotRow[];
  } catch (error) {
    await logSystemEvent('error', 'generateAvailableSlots failed', {
      daysAhead,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

export async function listAvailableSlots(daysAhead = 14): Promise<MeetingSlotRow[]> {
  await generateAvailableSlots(daysAhead);
  const now = new Date();
  const until = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('meeting_slots')
    .select('*')
    .eq('is_available', true)
    .gt('slot_datetime', now.toISOString())
    .lt('slot_datetime', until.toISOString())
    .order('slot_datetime', { ascending: true });

  if (error) {
    await logSystemEvent('error', 'Failed to list available slots', { daysAhead, error: error.message });
    throw error;
  }

  return (data ?? []) as MeetingSlotRow[];
}

export async function getNextAvailableSlot(): Promise<MeetingSlotRow | null> {
  await generateAvailableSlots(14);
  const threshold = new Date(Date.now() + SLOT_BUFFER_MS).toISOString();

  const { data, error } = await supabase
    .from('meeting_slots')
    .select('*')
    .eq('is_available', true)
    .gt('slot_datetime', threshold)
    .order('slot_datetime', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    await logSystemEvent('error', 'Failed to fetch next available slot', { error: error.message });
    throw error;
  }

  return data ? (data as MeetingSlotRow) : null;
}

export async function isSlotAvailable(datetime: Date): Promise<boolean> {
  const slot = await getSlotByDateTime(datetime);
  return Boolean(slot?.is_available);
}

export async function setSlotAvailability(slotId: string, isAvailable: boolean): Promise<MeetingSlotRow> {
  const { data, error } = await supabase
    .from('meeting_slots')
    .update({ is_available: isAvailable })
    .eq('id', slotId)
    .select('*')
    .single();

  if (error) {
    await logSystemEvent('error', 'Failed to update slot availability', { slotId, isAvailable, error: error.message });
    throw error;
  }

  return data as MeetingSlotRow;
}

function substituteTemplate(template: string, slot: MeetingSlotRow): string {
  const labels = formatIstDateLabel(slot.slot_datetime);
  return template
    .replaceAll('{{day}}', labels.day)
    .replaceAll('{{date}}', labels.date)
    .replaceAll('{{time}}', labels.time);
}

export function getConfirmationMessage(slot: MeetingSlotRow, language: DetectedLanguage, round: number): string {
  const template = YES_NO_TEMPLATES[language] ?? YES_NO_TEMPLATES.en;
  return substituteTemplate(template, slot);
}

function getBookedConfirmationMessage(slot: MeetingSlotRow, language: DetectedLanguage): string {
  const template = BOOKED_TEMPLATES[language] ?? BOOKED_TEMPLATES.en;
  return substituteTemplate(template, slot);
}

function getSchedulingFailedMessage(language: DetectedLanguage): string {
  return FAILED_TEMPLATES[language] ?? FAILED_TEMPLATES.en;
}

export function parseLeadTime(message: string): Date | null {
  const text = message.toLowerCase().replace(/[^a-z0-9:\s]/g, ' ');
  const hourWords: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    ek: 1,
    do: 2,
    teen: 3,
    char: 4,
    chaar: 4,
    foura: 4,
    paan: 5,
    panch: 5,
    chhe: 6,
    saat: 7,
    aath: 8,
    nau: 9,
    das: 10,
    gyaarah: 11,
    baraah: 12,
  };

  let hour: number | null = null;
  let minute = 0;
  let hasPmHint = /\b(pm|evening|sham|sanje|sang|shaam|raat|rath)\b/.test(text);
  let hasAmHint = /\b(am|morning|subah|savere|bapore)\b/.test(text);

  const numericMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (numericMatch) {
    hour = Number(numericMatch[1]);
    minute = numericMatch[2] ? Number(numericMatch[2]) : 0;
    if (numericMatch[3] === 'pm') hasPmHint = true;
    if (numericMatch[3] === 'am') hasAmHint = true;
  } else {
    const words = text.split(/\s+/).filter(Boolean);
    const matchedWord = words.find(word => hourWords[word] !== undefined);
    if (matchedWord) {
      hour = hourWords[matchedWord];
      minute = 0;
    }
  }

  if (hour === null) return null;

  const normalized = normalizeToSlotBoundary(hour, minute);
  hour = normalized.hour;
  minute = normalized.minute;

  if (hour < 1 || hour > 12) return null;

  if (hasPmHint && hour < 12) {
    hour += 12;
  } else if (!hasAmHint && !hasPmHint) {
    if (hour <= 7) {
      hour += 12;
    } else if (hour === 12) {
      hour = 12;
    }
  }

  if (hour === 24) hour = 0;
  if (hour < 10 || hour >= 18) return null;

  const candidate = getNextBusinessDate();
  const nowIst = toIstDate(new Date());

  for (let offset = 0; offset < 14; offset += 1) {
    const day = new Date(candidate.getTime());
    day.setUTCDate(day.getUTCDate() + offset);
    if (day.getUTCDay() === 0) continue;

    const candidateSlot = buildSlotFromIstDate(day, hour, minute);
    if (!candidateSlot) continue;

    const candidateDate = new Date(candidateSlot.slot_datetime);
    if (candidateDate.getTime() <= Date.now() + SLOT_BUFFER_MS) {
      continue;
    }

    const candidateIst = toIstDate(candidateDate);
    if (candidateIst.getUTCFullYear() !== nowIst.getUTCFullYear() || candidateIst.getUTCMonth() !== nowIst.getUTCMonth() || candidateIst.getUTCDate() !== nowIst.getUTCDate()) {
      return candidateDate;
    }

    if (candidateDate.getTime() > Date.now() + SLOT_BUFFER_MS) {
      return candidateDate;
    }
  }

  return null;
}

async function suggestMeetingSlotText(leadId: string, language: DetectedLanguage, round: number): Promise<string> {
  const nextSlot = await getNextAvailableSlot();
  if (!nextSlot) {
    throw new Error('No available meeting slots found');
  }

  await setPendingSlot(leadId, nextSlot, language);
  await setNegotiationRound(leadId, round);
  return getConfirmationMessage(nextSlot, language, round);
}

export async function suggestMeetingSlot(leadId: string, language: DetectedLanguage, round: number): Promise<string> {
  return suggestMeetingSlotText(leadId, language, round);
}

async function sendTelegramAlert(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch (error) {
    console.error('[SmartMeeting] Telegram alert failed:', error);
  }
}

async function sendWhatsAppAlert(text: string): Promise<void> {
  const apiUrl = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const recipient = process.env.SMIT_WHATSAPP_NUMBER;

  if (!apiUrl || !token || !phoneNumberId || !recipient) return;

  try {
    await fetch(`${apiUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'text',
        text: { body: text },
      }),
    });
  } catch (error) {
    console.error('[SmartMeeting] WhatsApp alert failed:', error);
  }
}

async function alertSmit(message: string): Promise<void> {
  await Promise.allSettled([
    sendTelegramAlert(message),
    sendWhatsAppAlert(message),
  ]);
}

export async function bookConfirmedSlot(leadId: string, slotId: string, language: DetectedLanguage): Promise<MeetingReply> {
  try {
    const slot = await getSlotById(slotId);
    if (!slot || !slot.is_available) {
      const nextRound = await incrementNegotiationRound(leadId);
      const fallback = await getNextAvailableSlot();
      if (!fallback) {
        return schedulingFailed(leadId, language);
      }
      await setPendingSlot(leadId, fallback, language);
      return {
        text: getConfirmationMessage(fallback, language, nextRound),
        tokensUsed: 0,
        costUsd: 0,
        modelUsed: 'system',
        flowUsed: 'smart_meeting_reschedule',
        hotLead: false,
        optOut: false,
      };
    }

    const { data: lockedSlot, error: lockError } = await supabase
      .from('meeting_slots')
      .update({ is_available: false, lead_id: leadId })
      .eq('id', slotId)
      .eq('is_available', true)
      .select('*')
      .single();

    if (lockError) throw lockError;
    const confirmedSlot = lockedSlot as MeetingSlotRow;

    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .insert({
        lead_id: leadId,
        status: 'confirmed',
        scheduled_at: confirmedSlot.slot_datetime,
        duration_minutes: 30,
      })
      .select('*')
      .single();

    if (meetingError) throw meetingError;

    await supabase
      .from('meeting_slots')
      .update({ meeting_id: (meeting as { id: string }).id })
      .eq('id', slotId);

    await supabase
      .from('leads')
      .update({ status: 'meeting_booked' })
      .eq('id', leadId);

    await clearNegotiationState(leadId);

    const finalMessage = getBookedConfirmationMessage(confirmedSlot, language);
    const labels = formatIstDateLabel(confirmedSlot.slot_datetime);
    await supabase.from('system_logs').insert({
      level: 'info',
      source: 'bot',
      message: `Meeting booked for lead ${leadId}`,
      metadata: { leadId, slotId, scheduledAt: confirmedSlot.slot_datetime },
    });

    await alertSmit([
      '🔥 MEETING CONFIRMED',
      '',
      `Lead: ${leadId}`,
      `Time: ${labels.day}, ${labels.date} at ${labels.time} IST`,
      '',
      `Lead booking saved in Supabase and admin panel updated.`,
    ].join('\n'));

    return {
      text: finalMessage,
      tokensUsed: 0,
      costUsd: 0,
      modelUsed: 'system',
      flowUsed: 'smart_meeting_confirmed',
      hotLead: false,
      optOut: false,
    };
  } catch (error) {
    await logSystemEvent('error', 'bookConfirmedSlot failed', {
      leadId,
      slotId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

export async function schedulingFailed(leadId: string, language: DetectedLanguage = DEFAULT_LANGUAGE): Promise<MeetingReply> {
  const text = getSchedulingFailedMessage(language);

  await supabase.from('system_logs').insert({
    level: 'warn',
    source: 'bot',
    message: 'Lead interested but could not schedule',
    metadata: { leadId, status: 'scheduling_failed' },
  });

  await supabase
    .from('leads')
    .update({ status: 'interested' })
    .eq('id', leadId);

  await clearNegotiationState(leadId);

  await alertSmit([
    'Lead interested but could not schedule',
    '',
    `Lead ID: ${leadId}`,
    'Manual intervention needed.',
  ].join('\n'));

  return {
    text,
    tokensUsed: 0,
    costUsd: 0,
    modelUsed: 'system',
    flowUsed: 'smart_meeting_failed',
    hotLead: false,
    optOut: false,
  };
}

export async function handleMeetingResponse(leadId: string, message: string, language: DetectedLanguage): Promise<MeetingReply> {
  const signal = detectYesNo(message);
  const currentRound = await getNegotiationRound(leadId);

  if (signal === 'yes') {
    const pending = await getPendingSlot(leadId);
    const slot = pending ? await getSlotById(pending.slotId) : await getNextAvailableSlot();
    if (!slot) {
      return schedulingFailed(leadId, language);
    }
    return bookConfirmedSlot(leadId, slot.id, language);
  }

  if (currentRound >= 5) {
    return schedulingFailed(leadId, language);
  }

  if (signal === 'time_mention') {
    const requested = parseLeadTime(message);
    if (requested) {
      const slot = await getSlotByDateTime(requested);
      if (slot && slot.is_available) {
        const nextRound = await incrementNegotiationRound(leadId);
        await setPendingSlot(leadId, slot, language);
        return {
          text: getConfirmationMessage(slot, language, nextRound),
          tokensUsed: 0,
          costUsd: 0,
          modelUsed: 'system',
          flowUsed: 'smart_meeting_time_check',
          hotLead: false,
          optOut: false,
        };
      }
    }

    const nextRound = await incrementNegotiationRound(leadId);
    return {
      text: await suggestMeetingSlotText(leadId, language, nextRound),
      tokensUsed: 0,
      costUsd: 0,
      modelUsed: 'system',
      flowUsed: 'smart_meeting_reschedule',
      hotLead: false,
      optOut: false,
    };
  }

  if (signal === 'no') {
    const nextRound = await incrementNegotiationRound(leadId);
    return {
      text: await suggestMeetingSlotText(leadId, language, nextRound),
      tokensUsed: 0,
      costUsd: 0,
      modelUsed: 'system',
      flowUsed: 'smart_meeting_reschedule',
      hotLead: false,
      optOut: false,
    };
  }

  return {
    text: null,
    tokensUsed: 0,
    costUsd: 0,
    modelUsed: 'system',
    flowUsed: 'smart_meeting_idle',
    hotLead: false,
    optOut: false,
  };
}
