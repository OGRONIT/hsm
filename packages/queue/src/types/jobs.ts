// ─────────────────────────────────────────────────────────────
// HSM Queue — Shared Job Type Definitions
// All job payloads are validated with Zod before processing
// ─────────────────────────────────────────────────────────────

import { z } from 'zod';

// ─── Lead status stages ───────────────────────────────────────
export const LeadStatus = z.enum([
  'new', 'contacted', 'replied', 'interested',
  'meeting_booked', 'converted', 'dead',
]);
export type LeadStatus = z.infer<typeof LeadStatus>;

// ─── Channel ─────────────────────────────────────────────────
export const Channel = z.enum(['whatsapp', 'email']);
export type Channel = z.infer<typeof Channel>;

// ─── Language ────────────────────────────────────────────────
export const Language = z.enum(['en', 'hi', 'gu', 'hinglish', 'gujlish']);
export type Language = z.infer<typeof Language>;

// ─────────────────────────────────────────────────────────────
// OUTREACH JOB
// First message to a new lead — queued by scraper after dedup
// ─────────────────────────────────────────────────────────────
export const OutreachJobSchema = z.object({
  leadId:       z.string().uuid(),
  companyName:  z.string(),
  ownerName:    z.string().nullable(),
  phone:        z.string(),                   // +91XXXXXXXXXX
  email:        z.string().email().nullable(),
  industry:     z.string(),
  source:       z.string(),
  channel:      Channel,
  language:     Language.default('en'),       // Start in English always
  scheduledAt:  z.string().datetime().optional(), // Delay to business hours
});
export type OutreachJob = z.infer<typeof OutreachJobSchema>;

// ─────────────────────────────────────────────────────────────
// FOLLOWUP JOB
// Queued 2-3 days after outreach if no reply received
// ─────────────────────────────────────────────────────────────
export const FollowupJobSchema = z.object({
  leadId:         z.string().uuid(),
  companyName:    z.string(),
  ownerName:      z.string().nullable(),
  phone:          z.string(),
  email:          z.string().email().nullable(),
  channel:        Channel,
  language:       Language,
  followupNumber: z.number().int().min(1).max(2), // Max 2 followups
  outreachSentAt: z.string().datetime(),
});
export type FollowupJob = z.infer<typeof FollowupJobSchema>;

// ─────────────────────────────────────────────────────────────
// BOOKING JOB
// Triggered when hot-lead keywords detected ("theek hai", "call karo")
// ─────────────────────────────────────────────────────────────
export const BookingJobSchema = z.object({
  leadId:          z.string().uuid(),
  companyName:     z.string(),
  ownerName:       z.string().nullable(),
  phone:           z.string(),
  email:           z.string().email().nullable(),
  channel:         Channel,
  language:        Language,
  triggerMessage:  z.string(),                // The message that triggered booking
  calendlyUrl:     z.string().url().optional(),
  suppressOutbound: z.boolean().optional(),
});
export type BookingJob = z.infer<typeof BookingJobSchema>;

// ─────────────────────────────────────────────────────────────
// JOB NAMES (used as BullMQ job name strings)
// ─────────────────────────────────────────────────────────────
export const JobName = {
  OUTREACH:       'outreach:send',
  FOLLOWUP:       'followup:send',
  BOOKING_PUSH:   'booking:push-calendar-link',
  BOOKING_CONFIRM:'booking:confirm',
} as const;

// ─────────────────────────────────────────────────────────────
// QUEUE NAMES
// ─────────────────────────────────────────────────────────────
export const QueueName = {
  OUTREACH: 'hsm-outreach',
  FOLLOWUP: 'hsm-followup',
  BOOKING:  'hsm-booking',
} as const;

// ─────────────────────────────────────────────────────────────
// JOB RESULT (returned by each worker on success)
// ─────────────────────────────────────────────────────────────
export interface JobResult {
  success:     boolean;
  leadId:      string;
  channel:     string;
  messageId?:  string;       // WA message ID or email ID
  tokensUsed?: number;
  costUsd?:    number;
  error?:      string;
}
