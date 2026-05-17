import { Queue, QueueOptions } from 'bullmq';
import { redis } from '../redis';
import { QueueName, OutreachJob, FollowupJob, BookingJob } from '../types/jobs';

// ─────────────────────────────────────────────────────────────
// Shared BullMQ queue options
// ─────────────────────────────────────────────────────────────
const defaultQueueOptions: QueueOptions = {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 500 },    // Keep last 500 completed jobs for history
    removeOnFail:     { count: 200 },    // Keep last 200 failed jobs for debugging
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,                       // 5s → 25s → 125s on retry
    },
  },
};

// ─────────────────────────────────────────────────────────────
// OUTREACH QUEUE
// Max 500 messages/day across WhatsApp + Email.
// Rate limited in worker — not here at queue level.
// ─────────────────────────────────────────────────────────────
export const outreachQueue = new Queue<OutreachJob>(
  QueueName.OUTREACH,
  {
    ...defaultQueueOptions,
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      // Delay jobs to business hours (8am-8pm IST) — computed in addOutreachJob()
    },
  },
);

// ─────────────────────────────────────────────────────────────
// FOLLOWUP QUEUE
// Jobs are delayed 2-3 days after outreach send time.
// Worker checks if lead has already replied before sending.
// ─────────────────────────────────────────────────────────────
export const followupQueue = new Queue<FollowupJob>(
  QueueName.FOLLOWUP,
  defaultQueueOptions,
);

// ─────────────────────────────────────────────────────────────
// BOOKING QUEUE
// Triggered by hot-lead detector. High priority, no delay.
// ─────────────────────────────────────────────────────────────
export const bookingQueue = new Queue<BookingJob>(
  QueueName.BOOKING,
  {
    ...defaultQueueOptions,
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      priority: 1,   // Highest priority — booking must be instant
      attempts: 5,   // More retries — can't miss a hot lead
    },
  },
);

// ─────────────────────────────────────────────────────────────
// HELPER: Add outreach job with smart business-hours scheduling
// ─────────────────────────────────────────────────────────────
export async function addOutreachJob(
  data: OutreachJob,
  delayMs?: number,
): Promise<void> {
  const delay = delayMs ?? getBusinessHoursDelay();
  await outreachQueue.add(
    'outreach:send',
    data,
    {
      delay,
      jobId: `outreach:${data.leadId}`,   // Dedupe: same lead can't be queued twice
    },
  );
  console.log(`[OutreachQueue] Job added for ${data.companyName} — delay: ${Math.round(delay / 1000)}s`);
}

// ─────────────────────────────────────────────────────────────
// HELPER: Add followup job with 2-3 day delay
// ─────────────────────────────────────────────────────────────
export async function addFollowupJob(
  data: FollowupJob,
  followupNumber: 1 | 2 = 1,
): Promise<void> {
  const FOLLOWUP_DELAYS = {
    1: 2 * 24 * 60 * 60 * 1000,    // 2 days
    2: 3 * 24 * 60 * 60 * 1000,    // 3 more days after first followup
  };
  const delay = FOLLOWUP_DELAYS[followupNumber];
  await followupQueue.add(
    'followup:send',
    { ...data, followupNumber },
    {
      delay,
      jobId: `followup:${data.leadId}:${followupNumber}`,
    },
  );
  console.log(`[FollowupQueue] Followup #${followupNumber} scheduled for ${data.companyName} in ${delay / 3600000}h`);
}

// ─────────────────────────────────────────────────────────────
// HELPER: Add booking push job (immediate)
// ─────────────────────────────────────────────────────────────
export async function addBookingJob(data: BookingJob): Promise<void> {
  await bookingQueue.add(
    'booking:push-calendar-link',
    data,
    {
      jobId: `booking:${data.leadId}`,
    },
  );
  console.log(`[BookingQueue] Booking push queued for ${data.companyName} — HOT LEAD`);
}

// ─────────────────────────────────────────────────────────────
// HELPER: Business hours delay (IST 8am-8pm)
// Returns milliseconds to wait until next 8am IST if currently off-hours
// ─────────────────────────────────────────────────────────────
function getBusinessHoursDelay(): number {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;    // IST = UTC+5:30
  const now = new Date(Date.now() + IST_OFFSET);
  const hour = now.getUTCHours();

  // Between 8am and 8pm IST → send within next 5 minutes (random spread)
  if (hour >= 8 && hour < 20) {
    return Math.floor(Math.random() * 5 * 60 * 1000);   // 0-5 minutes random
  }

  // Outside hours → delay until 8am IST tomorrow
  const tomorrow8am = new Date(now);
  tomorrow8am.setUTCHours(8 - 5, 30 - 30, 0, 0);       // 8:00 IST = 2:30 UTC
  if (tomorrow8am <= now) {
    tomorrow8am.setUTCDate(tomorrow8am.getUTCDate() + 1);
  }
  const delayMs = tomorrow8am.getTime() - now.getTime();
  console.log(`[Queue] Outside business hours — delaying ${Math.round(delayMs / 3600000)}h`);
  return delayMs;
}

// ─────────────────────────────────────────────────────────────
// QUEUE STATS: used by admin panel /api/queue/stats
// ─────────────────────────────────────────────────────────────
export async function getAllQueueStats() {
  const [outreach, followup, booking] = await Promise.all([
    getQueueStats(outreachQueue, QueueName.OUTREACH),
    getQueueStats(followupQueue, QueueName.FOLLOWUP),
    getQueueStats(bookingQueue, QueueName.BOOKING),
  ]);
  return { outreach, followup, booking };
}

async function getQueueStats(queue: Queue, name: string) {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);
  return { name, waiting, active, completed, failed, delayed };
}
