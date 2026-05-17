// ─────────────────────────────────────────────────────────────
// HSM Queue — Main Entry Point
// Starts all workers + exports queue helpers for other packages
// ─────────────────────────────────────────────────────────────

import 'dotenv/config';
import { verifyRedisConnection } from './redis';
import { outreachWorker } from './workers/outreach.worker';
import { followupWorker } from './workers/followup.worker';
import { bookingWorker }  from './workers/booking.worker';

// Re-export queue helpers for use in other packages
export { addOutreachJob, addFollowupJob, addBookingJob, getAllQueueStats } from './queues';
export { getBankStats, getOrCreateTodayBank, runMidnightBankRollover, canSendMessage, canSendNewOutreach, recordMessageSent, recordNewOutreach } from './lib/message-bank';
export * from './types/jobs';

async function main() {
  console.log('[HSM Queue] Starting workers...');

  // Verify Redis connection before starting workers
  const redisOk = await verifyRedisConnection();
  if (!redisOk) {
    console.error('[HSM Queue] Cannot connect to Redis. Exiting.');
    process.exit(1);
  }

  console.log('[HSM Queue] All workers started:');
  console.log('  ✓ Outreach worker  (concurrency: 3)');
  console.log('  ✓ Followup worker  (concurrency: 5)');
  console.log('  ✓ Booking worker   (concurrency: 10)');
  console.log('  ✓ Daily WA limit:  500 messages/day');
  console.log('  ✓ Business hours:  8am–8pm IST');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[HSM Queue] ${signal} received — shutting down gracefully...`);
    await Promise.all([
      outreachWorker.close(),
      followupWorker.close(),
      bookingWorker.close(),
    ]);
    console.log('[HSM Queue] All workers stopped. Bye!');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[HSM Queue] Fatal error:', err);
  process.exit(1);
});
