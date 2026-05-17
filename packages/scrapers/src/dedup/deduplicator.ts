// ─────────────────────────────────────────────────────────────
// HSM Scrapers — Deduplicator
// Checks phone + email + company+city before inserting.
// If duplicate found → update existing record with new info.
// ─────────────────────────────────────────────────────────────

import { supabase, ScrapedLead, normalizePhone } from '../utils/types';

export type DedupeResult = 'inserted' | 'updated' | 'skipped';

export interface InsertResult {
  result:  DedupeResult;
  leadId:  string | null;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────
// Main dedup + upsert function
// ─────────────────────────────────────────────────────────────
export async function deduplicateAndInsert(raw: ScrapedLead): Promise<InsertResult> {
  const phone = normalizePhone(raw.phone);

  // ── 1. Check by phone ──────────────────────────────────────
  if (phone) {
    const { data: byPhone } = await supabase
      .from('leads')
      .select('id, source, raw_data')
      .eq('phone', phone)
      .single();

    if (byPhone) {
      await enrichExistingLead(byPhone.id, raw);
      return { result: 'updated', leadId: byPhone.id, reason: 'duplicate_phone' };
    }
  }

  // ── 2. Check by email ──────────────────────────────────────
  if (raw.email) {
    const { data: byEmail } = await supabase
      .from('leads')
      .select('id')
      .eq('email', raw.email)
      .single();

    if (byEmail) {
      await enrichExistingLead(byEmail.id, raw);
      return { result: 'updated', leadId: byEmail.id, reason: 'duplicate_email' };
    }
  }

  // ── 3. Check by company name + city (fuzzy) ────────────────
  if (raw.company_name && raw.city) {
    const { data: byCompany } = await supabase
      .from('leads')
      .select('id')
      .ilike('company_name', `%${raw.company_name.slice(0, 20)}%`)
      .eq('city', raw.city)
      .single();

    if (byCompany) {
      await enrichExistingLead(byCompany.id, raw);
      return { result: 'updated', leadId: byCompany.id, reason: 'duplicate_company_city' };
    }
  }

  // ── 4. Fresh lead — insert ──────────────────────────────────
  const { data: inserted, error } = await supabase
    .from('leads')
    .insert({
      company_name:     raw.company_name,
      owner_name:       raw.owner_name,
      phone:            phone,
      email:            raw.email,
      city:             raw.city,
      state:            raw.state,
      industry:         raw.industry,
      source:           raw.source,
      source_url:       raw.source_url,
      instagram_handle: raw.instagram_handle,
      facebook_profile: raw.facebook_profile,
      raw_data:         raw.raw_data,
      status:           'new',
    })
    .select('id')
    .single();

  if (error) {
    // Handle unique constraint violation (race condition)
    if (error.code === '23505') {
      return { result: 'skipped', leadId: null, reason: 'unique_constraint_race' };
    }
    console.error('[Dedup] Insert error:', error.message);
    return { result: 'skipped', leadId: null, reason: error.message };
  }

  return { result: 'inserted', leadId: inserted.id };
}

// ─────────────────────────────────────────────────────────────
// Enrich existing lead with new data from another source
// (e.g. found on Instagram too — add instagram_handle)
// ─────────────────────────────────────────────────────────────
async function enrichExistingLead(leadId: string, newData: ScrapedLead): Promise<void> {
  const { data: existing } = await supabase
    .from('leads')
    .select('phone, email, owner_name, instagram_handle, facebook_profile, raw_data')
    .eq('id', leadId)
    .single();

  if (!existing) return;

  const patch: Record<string, any> = {};

  // Only fill in missing fields — never overwrite existing data
  if (!existing.phone        && newData.phone)             patch.phone            = normalizePhone(newData.phone);
  if (!existing.email        && newData.email)             patch.email            = newData.email;
  if (!existing.owner_name   && newData.owner_name)        patch.owner_name       = newData.owner_name;
  if (!existing.instagram_handle && newData.instagram_handle) patch.instagram_handle = newData.instagram_handle;
  if (!existing.facebook_profile && newData.facebook_profile) patch.facebook_profile = newData.facebook_profile;

  // Merge raw_data (keep all source data)
  patch.raw_data = {
    ...(existing.raw_data ?? {}),
    [newData.source]: newData.raw_data,
  };

  if (Object.keys(patch).length > 1) {  // >1 because raw_data always updated
    await supabase.from('leads').update(patch).eq('id', leadId);
  }
}

// ─────────────────────────────────────────────────────────────
// Batch insert — processes array of leads, returns counts
// ─────────────────────────────────────────────────────────────
export async function batchDeduplicateAndInsert(leads: ScrapedLead[]): Promise<{
  inserted: number; updated: number; skipped: number;
}> {
  let inserted = 0, updated = 0, skipped = 0;

  for (const lead of leads) {
    const { result } = await deduplicateAndInsert(lead);
    if (result === 'inserted') inserted++;
    else if (result === 'updated') updated++;
    else skipped++;
  }

  return { inserted, updated, skipped };
}
