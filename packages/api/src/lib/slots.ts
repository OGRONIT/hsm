import { supabase } from './utils';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

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

function toIstDate(date = new Date()): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function isBusinessDay(date: Date): boolean {
  const day = date.getUTCDay();
  return day >= 1 && day <= 6;
}

function buildSlot(date: Date, hour: number, minute: number): Omit<MeetingSlotRow, 'id' | 'meeting_id' | 'lead_id' | 'created_at'> {
  const slotDate = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const slotTime = `${pad(hour)}:${pad(minute)}:00`;
  const slotDatetime = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute) - IST_OFFSET_MS);

  return {
    slot_date: slotDate,
    slot_time: slotTime,
    slot_datetime: slotDatetime.toISOString(),
    is_available: true,
  };
}

export async function generateAvailableSlots(daysAhead: number): Promise<MeetingSlotRow[]> {
  const rows: Array<Omit<MeetingSlotRow, 'id' | 'meeting_id' | 'lead_id' | 'created_at'>> = [];
  const todayIst = toIstDate();

  for (let dayOffset = 0; dayOffset <= daysAhead; dayOffset += 1) {
    const current = new Date(todayIst.getTime());
    current.setUTCDate(current.getUTCDate() + dayOffset);
    if (!isBusinessDay(current)) continue;

    for (let minutes = 10 * 60; minutes < 18 * 60; minutes += 30) {
      rows.push(buildSlot(current, Math.floor(minutes / 60), minutes % 60));
    }
  }

  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from('meeting_slots')
    .upsert(rows, { onConflict: 'slot_date,slot_time', ignoreDuplicates: true })
    .select('*');

  if (error) throw error;
  return (data ?? []) as MeetingSlotRow[];
}

export async function listAvailableSlots(daysAhead = 14): Promise<MeetingSlotRow[]> {
  await generateAvailableSlots(daysAhead);
  const now = new Date().toISOString();
  const until = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('meeting_slots')
    .select('*')
    .eq('is_available', true)
    .gt('slot_datetime', now)
    .lt('slot_datetime', until)
    .order('slot_datetime', { ascending: true });

  if (error) throw error;
  return (data ?? []) as MeetingSlotRow[];
}

export async function setSlotAvailability(slotId: string, isAvailable: boolean): Promise<MeetingSlotRow> {
  const { data, error } = await supabase
    .from('meeting_slots')
    .update({ is_available: isAvailable })
    .eq('id', slotId)
    .select('*')
    .single();

  if (error) throw error;
  return data as MeetingSlotRow;
}
