import { Worker, Job } from 'bullmq';
import { redis } from '../redis';
import { FollowupJob, FollowupJobSchema, JobResult, QueueName } from '../types/jobs';
import { addFollowupJob } from '../queues';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || 'placeholder-service-role-key',
);

// ─────────────────────────────────────────────────────────────
// FOLLOWUP WORKER
// Before sending, checks if lead has already replied.
// If replied → skip (bot's inbound handler takes over).
// If still no reply after followup #2 → mark as 'dead'.
// ─────────────────────────────────────────────────────────────
export const followupWorker = new Worker<FollowupJob, JobResult>(
  QueueName.FOLLOWUP,
  async (job: Job<FollowupJob>): Promise<JobResult> => {
    console.log(`[FollowupWorker] Job ${job.id} — ${job.data.companyName} (followup #${job.data.followupNumber})`);

    const data = FollowupJobSchema.parse(job.data);

    // 1. Get current lead status + check for inbound replies since outreach
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, status')
      .eq('id', data.leadId)
      .single();

    if (leadErr || !lead) {
      throw new Error(`Lead ${data.leadId} not found`);
    }

    // 2. If lead has progressed past 'contacted' → they replied → skip followup
    const SKIP_STATUSES = ['replied', 'interested', 'meeting_booked', 'converted', 'dead'];
    if (SKIP_STATUSES.includes(lead.status)) {
      console.log(`[FollowupWorker] Lead ${data.leadId} is '${lead.status}' — no followup needed`);
      return { success: true, leadId: data.leadId, channel: data.channel };
    }

    // 3. Double-check: any inbound message since outreach?
    const { count } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', data.leadId)
      .eq('direction', 'inbound')
      .gte('created_at', data.outreachSentAt);

    if ((count ?? 0) > 0) {
      console.log(`[FollowupWorker] Lead ${data.leadId} has inbound messages — skipping`);
      return { success: true, leadId: data.leadId, channel: data.channel };
    }

    // 4. Send followup message
    const message = await generateFollowupMessage(data);

    let messageId: string;
    if (data.channel === 'whatsapp') {
      messageId = await sendWhatsAppMessage(data.phone, message.text);
    } else {
      messageId = await sendEmail(data.email!, data.companyName, message.text);
    }

    // 5. Log conversation
    await supabase.from('conversations').insert({
      lead_id:       data.leadId,
      channel:       data.channel,
      direction:     'outbound',
      message:       message.text,
      language:      data.language,
      ai_model_used: 'gpt-4o-mini',
      tokens_used:   message.tokensUsed,
      cost_usd:      message.costUsd,
      wa_message_id: data.channel === 'whatsapp' ? messageId : null,
      email_id:      data.channel === 'email' ? messageId : null,
      status:        'sent',
    });

    await supabase.from('system_logs').insert({
      level:    'info',
      source:   'bot',
      message:  `Followup #${data.followupNumber} sent to ${data.companyName}`,
      metadata: { leadId: data.leadId, followupNumber: data.followupNumber },
    });

    console.log(`[FollowupWorker] ✓ Followup #${data.followupNumber} sent to ${data.companyName}`);

    // 6. Queue followup #2 if this was #1
    if (data.followupNumber === 1) {
      await addFollowupJob({
        ...data,
        followupNumber: 2,
        outreachSentAt: new Date().toISOString(),
      }, 2);
      console.log(`[FollowupWorker] Followup #2 scheduled for ${data.companyName}`);
    }

    // 7. After followup #2 with no reply → mark dead after 3 more days
    if (data.followupNumber === 2) {
      // Schedule a dead-lead cleanup job (3 days from now, checked in cron)
      await redis.setex(
        `hsm:dead-check:${data.leadId}`,
        3 * 24 * 3600,
        '1',
      );
      console.log(`[FollowupWorker] Dead-check scheduled for ${data.leadId} in 3 days`);
    }

    return {
      success:    true,
      leadId:     data.leadId,
      channel:    data.channel,
      messageId,
      tokensUsed: message.tokensUsed,
      costUsd:    message.costUsd,
    };
  },
  {
    connection:  redis,
    concurrency: 5,
  },
);

followupWorker.on('completed', (job) => {
  console.log(`[FollowupWorker] Job ${job.id} completed`);
});

followupWorker.on('failed', async (job, err) => {
  console.error(`[FollowupWorker] Job ${job?.id} failed:`, err.message);
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || 'placeholder-service-role-key',
  );
  await sb.from('system_logs').insert({
    level:    'error',
    source:   'queue',
    message:  `Followup job failed for lead ${job?.data?.leadId}`,
    metadata: { jobId: job?.id, error: err.message },
  });
});

// ─── Stubs (replaced by bot/messaging packages in Step 3+) ───
async function generateFollowupMessage(data: FollowupJob) {
  const texts: Record<number, string> = {
    1: `Hi ${data.ownerName ?? 'sir'}! Smit from Hariii Design here — just checking if you had a chance to look at my earlier message about 3D animations for your products. Happy to share more details!`,
    2: `${data.ownerName ?? 'Sir'} ji, ek last check-in from Smit — Hariii Design. Aapke products ke liye 3D visualization mein koi interest hai toh batayein, nahi toh koi baat nahi!`,
  };
  return {
    text:       texts[data.followupNumber] ?? texts[1],
    tokensUsed: 0,
    costUsd:    0,
  };
}

async function sendWhatsAppMessage(phone: string, message: string): Promise<string> {
  console.log(`[Stub] WA followup → ${phone}`);
  return `wa_followup_stub_${Date.now()}`;
}

async function sendEmail(email: string, company: string, message: string): Promise<string> {
  console.log(`[Stub] Email followup → ${email}`);
  return `email_followup_stub_${Date.now()}`;
}
