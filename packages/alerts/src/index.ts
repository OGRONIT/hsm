// ─────────────────────────────────────────────────────────────
// HSM Alerts — Main Index + Unified Dispatcher
// Single entry point for firing any alert.
// Telegram = primary, WhatsApp = redundancy for critical ones.
// ─────────────────────────────────────────────────────────────

import 'dotenv/config';
import {
  alertMeetingConfirmed,
  alertHotLead,
  alertDailySummary,
  alertWeeklyReport,
  alertSystemError,
  alertBanRisk,
  testTelegramConnection,
} from './telegram';
import { waAlertMeetingConfirmed, waAlertCriticalError } from './whatsapp';
import { startAlertScheduler } from './scheduler';

// ─────────────────────────────────────────────────────────────
// Re-export all individual alert functions
// ─────────────────────────────────────────────────────────────
export {
  alertMeetingConfirmed,
  alertHotLead,
  alertDailySummary,
  alertWeeklyReport,
  alertSystemError,
  alertBanRisk,
  testTelegramConnection,
};

// ─────────────────────────────────────────────────────────────
// Unified dispatcher — fires correct channels per alert type
// ─────────────────────────────────────────────────────────────
export const Alert = {
  // 🔥 Meeting confirmed → Telegram + WhatsApp (both)
  meetingConfirmed: async (data: Parameters<typeof alertMeetingConfirmed>[0]) => {
    await Promise.allSettled([
      alertMeetingConfirmed(data),
      waAlertMeetingConfirmed(data),
    ]);
  },

  // ⚡ Hot lead → Telegram only (fast enough)
  hotLead: async (data: Parameters<typeof alertHotLead>[0]) => {
    await alertHotLead(data);
  },

  // 🚨 Critical error → Telegram + WhatsApp (belt + suspenders)
  criticalError: async (data: { type: string; source: string; message: string; timestamp: string }) => {
    await Promise.allSettled([
      alertSystemError(data),
      waAlertCriticalError(data),
    ]);
  },

  // ⚠️ Regular error → Telegram only
  error: async (data: Parameters<typeof alertSystemError>[0]) => {
    await alertSystemError(data);
  },

  // 🛡 Ban risk → Telegram only
  banRisk: async (data: Parameters<typeof alertBanRisk>[0]) => {
    await alertBanRisk(data);
  },
};

// ─────────────────────────────────────────────────────────────
// Entry point when run as standalone service (on Railway)
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('[HSM Alerts] Starting alert scheduler service...');

  const { ok, botName, error } = await testTelegramConnection();
  if (!ok) {
    console.error(`[HSM Alerts] Telegram connection failed: ${error}`);
    console.error('[HSM Alerts] Check TELEGRAM_BOT_TOKEN in env vars');
  } else {
    console.log(`[HSM Alerts] ✓ Telegram connected: @${botName}`);
  }

  startAlertScheduler();
  console.log('[HSM Alerts] Alert scheduler running 24/7');

  // Keep alive
  process.on('SIGTERM', () => { console.log('[HSM Alerts] SIGTERM — shutting down'); process.exit(0); });
  process.on('SIGINT',  () => { console.log('[HSM Alerts] SIGINT — shutting down');  process.exit(0); });
}

main().catch(err => {
  console.error('[HSM Alerts] Fatal:', err);
  process.exit(1);
});
