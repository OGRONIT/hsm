"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateTodayBank = getOrCreateTodayBank;
exports.canSendMessage = canSendMessage;
exports.recordMessageSent = recordMessageSent;
exports.canSendNewOutreach = canSendNewOutreach;
exports.recordNewOutreach = recordNewOutreach;
exports.runMidnightBankRollover = runMidnightBankRollover;
exports.getBankStats = getBankStats;
exports.getAvailableBankDate = getAvailableBankDate;
exports.primeTomorrowBank = primeTomorrowBank;
const supabase_js_1 = require("@supabase/supabase-js");
const date_fns_1 = require("date-fns");
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DEFAULT_FRESH_ALLOCATED = 500;
const DEFAULT_NEW_OUTREACH_LIMIT = 50;
const MAX_BANK_CAP = 1000;
function toIstDate(date = new Date()) {
    return new Date(date.getTime() + IST_OFFSET_MS);
}
function getIstDateString(date = new Date()) {
    const ist = toIstDate(date);
    return ist.toISOString().slice(0, 10);
}
function shiftDateString(dateString, days) {
    const date = new Date(`${dateString}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
function normalizeBankRow(row) {
    const freshAllocated = row.fresh_allocated ?? DEFAULT_FRESH_ALLOCATED;
    const used = row.used ?? 0;
    const bankedCarriedIn = row.banked_carried_in ?? 0;
    const bankedCarriedOut = row.banked_carried_out ?? 0;
    const totalAvailable = row.total_available ?? (freshAllocated + bankedCarriedIn);
    return {
        id: row.id ?? '',
        date: row.date,
        fresh_allocated: freshAllocated,
        used,
        banked_carried_in: bankedCarriedIn,
        banked_carried_out: bankedCarriedOut,
        total_available: totalAvailable,
        new_outreach_count: row.new_outreach_count ?? 0,
        new_outreach_limit: row.new_outreach_limit ?? DEFAULT_NEW_OUTREACH_LIMIT,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
async function logBankError(source, message, metadata = {}) {
    try {
        await supabase.from('system_logs').insert({
            level: 'error',
            source: 'queue',
            message,
            metadata: { source, ...metadata },
        });
    }
    catch (error) {
        console.error('[MessageBank] Failed to log system event:', error);
    }
}
async function getBankByDate(dateString) {
    const { data, error } = await supabase
        .from('message_bank')
        .select('*')
        .eq('date', dateString)
        .maybeSingle();
    if (error) {
        await logBankError('getBankByDate', error.message, { date: dateString });
        throw error;
    }
    return data ? normalizeBankRow(data) : null;
}
async function upsertBankRow(row) {
    const payload = {
        date: row.date,
        fresh_allocated: row.fresh_allocated ?? DEFAULT_FRESH_ALLOCATED,
        banked_carried_in: row.banked_carried_in ?? 0,
        banked_carried_out: row.banked_carried_out ?? 0,
        total_available: row.total_available ?? ((row.fresh_allocated ?? DEFAULT_FRESH_ALLOCATED) + (row.banked_carried_in ?? 0)),
        new_outreach_count: row.new_outreach_count ?? 0,
        new_outreach_limit: row.new_outreach_limit ?? DEFAULT_NEW_OUTREACH_LIMIT,
    };
    const { data, error } = await supabase
        .from('message_bank')
        .upsert(payload, { onConflict: 'date' })
        .select('*')
        .single();
    if (error) {
        await logBankError('upsertBankRow', error.message, { date: row.date });
        throw error;
    }
    return normalizeBankRow(data);
}
async function ensureBankForDate(dateString) {
    const existing = await getBankByDate(dateString);
    if (existing)
        return existing;
    const previous = await getBankByDate(shiftDateString(dateString, -1));
    const bankedCarriedIn = previous?.banked_carried_out ?? 0;
    return upsertBankRow({
        date: dateString,
        fresh_allocated: DEFAULT_FRESH_ALLOCATED,
        banked_carried_in: bankedCarriedIn,
        total_available: DEFAULT_FRESH_ALLOCATED + bankedCarriedIn,
        new_outreach_limit: DEFAULT_NEW_OUTREACH_LIMIT,
    });
}
async function getOrCreateTodayBank() {
    try {
        return await ensureBankForDate(getIstDateString());
    }
    catch (error) {
        await logBankError('getOrCreateTodayBank', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
}
async function canSendMessage() {
    const bank = await getOrCreateTodayBank();
    return bank.used < bank.total_available;
}
async function recordMessageSent() {
    try {
        const bank = await getOrCreateTodayBank();
        const nextUsed = bank.used + 1;
        if (nextUsed > bank.total_available) {
            throw new Error('Message bank exhausted');
        }
        const { data, error } = await supabase
            .from('message_bank')
            .update({ used: nextUsed, updated_at: new Date().toISOString() })
            .eq('date', bank.date)
            .select('*')
            .single();
        if (error) {
            await logBankError('recordMessageSent', error.message, { date: bank.date });
            throw error;
        }
        return normalizeBankRow(data);
    }
    catch (error) {
        await logBankError('recordMessageSent', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
}
async function canSendNewOutreach() {
    const bank = await getOrCreateTodayBank();
    return bank.new_outreach_count < bank.new_outreach_limit;
}
async function recordNewOutreach() {
    try {
        const bank = await getOrCreateTodayBank();
        const nextCount = bank.new_outreach_count + 1;
        if (nextCount > bank.new_outreach_limit) {
            throw new Error('New outreach limit reached');
        }
        const { data, error } = await supabase
            .from('message_bank')
            .update({ new_outreach_count: nextCount, updated_at: new Date().toISOString() })
            .eq('date', bank.date)
            .select('*')
            .single();
        if (error) {
            await logBankError('recordNewOutreach', error.message, { date: bank.date });
            throw error;
        }
        return normalizeBankRow(data);
    }
    catch (error) {
        await logBankError('recordNewOutreach', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
}
async function runMidnightBankRollover() {
    try {
        const today = getIstDateString();
        const yesterday = shiftDateString(today, -1);
        const yesterdayBank = await getBankByDate(yesterday);
        const carryOut = Math.min(Math.max((yesterdayBank?.total_available ?? DEFAULT_FRESH_ALLOCATED) - (yesterdayBank?.used ?? 0), 0), MAX_BANK_CAP);
        if (yesterdayBank) {
            const { error } = await supabase
                .from('message_bank')
                .update({ banked_carried_out: carryOut, updated_at: new Date().toISOString() })
                .eq('date', yesterday);
            if (error) {
                await logBankError('runMidnightBankRollover.updateYesterday', error.message, { date: yesterday });
                throw error;
            }
        }
        return await upsertBankRow({
            date: today,
            fresh_allocated: DEFAULT_FRESH_ALLOCATED,
            banked_carried_in: carryOut,
            banked_carried_out: 0,
            total_available: DEFAULT_FRESH_ALLOCATED + carryOut,
            new_outreach_limit: DEFAULT_NEW_OUTREACH_LIMIT,
        });
    }
    catch (error) {
        await logBankError('runMidnightBankRollover', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
}
async function getBankStats() {
    try {
        const today = await getOrCreateTodayBank();
        const yesterday = await getBankByDate(shiftDateString(today.date, -1));
        const remaining = Math.max(today.total_available - today.used, 0);
        const freshRemaining = Math.max(today.fresh_allocated - today.used, 0);
        const bankedRemaining = Math.max(today.total_available - Math.max(today.used, today.fresh_allocated), 0);
        return {
            today,
            yesterday,
            remaining,
            freshRemaining,
            bankedRemaining,
            todayUsed: today.used,
            todayAvailable: today.total_available,
            bankedCarriedIn: today.banked_carried_in,
            bankedCarriedOut: today.banked_carried_out,
            newOutreachToday: today.new_outreach_count,
            newOutreachLimit: today.new_outreach_limit,
        };
    }
    catch (error) {
        await logBankError('getBankStats', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
}
async function getAvailableBankDate() {
    return getIstDateString();
}
async function primeTomorrowBank() {
    const today = getIstDateString();
    const tomorrow = getIstDateString((0, date_fns_1.addDays)(toIstDate(new Date()), 1));
    const todayBank = await ensureBankForDate(today);
    const carryOut = Math.min(Math.max(todayBank.total_available - todayBank.used, 0), MAX_BANK_CAP);
    return upsertBankRow({
        date: tomorrow,
        fresh_allocated: DEFAULT_FRESH_ALLOCATED,
        banked_carried_in: carryOut,
        banked_carried_out: 0,
        total_available: DEFAULT_FRESH_ALLOCATED + carryOut,
        new_outreach_limit: DEFAULT_NEW_OUTREACH_LIMIT,
    });
}
