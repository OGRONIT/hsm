import { Worker, Job } from 'bullmq';
import { redis } from '../redis';
import { OutreachJob, OutreachJobSchema, JobResult, QueueName } from '../types/jobs';
import { addFollowupJob } from '../queues';
import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────
// Supabase client (service role — full DB access)
// ─────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─────────────────────────────────────────────────────────────
// Daily rate limit tracking (500 messages/day max for WA)
// Uses Redis counter that resets at midnight IST
// ─────────────────────────────────────────────────────────────
const DAILY_WA_LIMIT = 500;
const WA_RATE_KEY = () => {
  const IST = new Date(Date.now() + 5.5 * 3600000);
  return `hsm:wa:daily:${IST.toISOString().slice(0, 10)}`;  // e.g. "hsm:wa:daily:2024-11-21"
};

async function checkAndIncrementRateLimit(r: typeof redis): Promise<boolean> {
  const key = WA_RATE_KEY();
  const count = await r.incr(key);
  if (count === 1) await r.expire(key, 86400);   // TTL 24h on first increment
  if (count > DAILY_WA_LIMIT) {
    await r.decr(key);                            // Roll back — don't count failed
    console.warn(`[OutreachWorker] Daily WA limit hit (${DAILY_WA_LIMIT}). Job will retry tomorrow.`);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────
// OUTREACH WORKER
// ─────────────────────────────────────────────────────────────
export const outreachWorker = new Worker<OutreachJob, JobResult>(
  QueueName.OUTREACH,
  async (job: Job<OutreachJob>): Promise<JobResult> => {
    console.log(`[OutreachWorker] Processing job ${job.id} for lead ${job.data.leadId}`);

    // 1. Validate job payload
    const data = OutreachJobSchema.parse(job.data);

    // 2. Check lead still exists and is in 'new' status
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, status, company_name')
      .eq('id', data.leadId)
      .single();

    if (leadErr || !lead) {
      throw new Error(`Lead ${data.leadId} not found: ${leadErr?.message}`);
    }

    if (lead.status !== 'new') {
      console.log(`[OutreachWorker] Lead ${data.leadId} is already ${lead.status} — skipping`);
      return { success: true, leadId: data.leadId, channel: data.channel };
    }

    // 3. Rate limit check (WhatsApp only)
    if (data.channel === 'whatsapp') {
      const allowed = await checkAndIncrementRateLimit(redis);
      if (!allowed) {
        // Throw to trigger BullMQ retry (will be delayed by backoff)
        throw new Error('RATE_LIMIT: Daily WA limit reached');
      }
    }

    // 4. Generate outreach message via bot (dynamic import avoids circular deps)
    // In production this calls the bot package directly or via HTTP
    // For now we stub — actual call wired in Step 3 (bot package)
    const message = await generateOutreachMessage(data);
    const tokensUsed = message.tokensUsed;
    const costUsd    = message.costUsd;

    // 5. Send the message
    let messageId: string;
    if (data.channel === 'whatsapp') {
      messageId = await sendWhatsAppMessage(data.phone, message.text);
    } else {
      messageId = await sendEmail(data.email!, data.companyName, message.text);
    }

    // 6. Update lead status → 'contacted'
    await supabase
      .from('leads')
      .update({ status: 'contacted', language_detected: data.language })
      .eq('id', data.leadId);

    // 7. Log conversation
    await supabase.from('conversations').insert({
      lead_id:       data.leadId,
      channel:       data.channel,
      direction:     'outbound',
      message:       message.text,
      language:      data.language,
      ai_model_used: 'gpt-4o-mini',
      tokens_used:   tokensUsed,
      cost_usd:      costUsd,
      wa_message_id: data.channel === 'whatsapp' ? messageId : null,
      email_id:      data.channel === 'email' ? messageId : null,
      status:        'sent',
    });

    // 8. Log system event
    await supabase.from('system_logs').insert({
      level:    'info',
      source:   'bot',
      message:  `Outreach sent to ${data.companyName} via ${data.channel}`,
      metadata: { leadId: data.leadId, channel: data.channel, messageId },
    });

    // 9. Queue followup (2 days later, only if no reply)
    await addFollowupJob({
      leadId:         data.leadId,
      companyName:    data.companyName,
      ownerName:      data.ownerName,
      phone:          data.phone,
      email:          data.email,
      channel:        data.channel,
      language:       data.language,
      followupNumber: 1,
      outreachSentAt: new Date().toISOString(),
    }, 1);

    console.log(`[OutreachWorker] ✓ Outreach sent to ${data.companyName} | msgId: ${messageId}`);

    return {
      success:    true,
      leadId:     data.leadId,
      channel:    data.channel,
      messageId,
      tokensUsed,
      costUsd,
    };
  },
  {
    connection:  redis,
    concurrency: 3,      // 3 concurrent sends max (stays within WA rate limits)
    limiter: {
      max:       10,
      duration:  60000,  // Max 10 jobs per minute per worker instance
    },
  },
);

// ─────────────────────────────────────────────────────────────
// Worker event handlers
// ─────────────────────────────────────────────────────────────
outreachWorker.on('completed', (job) => {
  console.log(`[OutreachWorker] Job ${job.id} completed`);
});

outreachWorker.on('failed', async (job, err) => {
  console.error(`[OutreachWorker] Job ${job?.id} failed:`, err.message);
  const supabase2 = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  await supabase2.from('system_logs').insert({
    level:    'error',
    source:   'queue',
    message:  `Outreach job failed for lead ${job?.data?.leadId}`,
    metadata: { jobId: job?.id, error: err.message, leadId: job?.data?.leadId },
  });
});

// ─────────────────────────────────────────────────────────────
// STUBS — replaced by real implementations in bot/messaging packages
// ─────────────────────────────────────────────────────────────
async function generateOutreachMessage(data: OutreachJob) {
  // Stub: real call → packages/bot/src/flows/outreach.ts
  return {
    text: `Hi ${data.ownerName ?? 'there'}! I am Smit from Hariii Design.`,
    tokensUsed: 0,
    costUsd: 0,
  };
}

async function sendWhatsAppMessage(phone: string, message: string): Promise<string> {
  // Stub: real call → packages/messaging/src/whatsapp/client.ts
  console.log(`[Stub] WA → ${phone}: ${message.slice(0, 50)}...`);
  return `wa_stub_${Date.now()}`;
}

async function sendEmail(email: string, company: string, message: string): Promise<string> {
  // Stub: real call → packages/messaging/src/email/resend.ts
  console.log(`[Stub] Email → ${email} (${company})`);
  return `email_stub_${Date.now()}`;
}
