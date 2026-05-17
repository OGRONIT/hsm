// ─────────────────────────────────────────────────────────────
// HSM Messaging — Main Index
// Public API for other packages (queue workers, API routes)
// ─────────────────────────────────────────────────────────────

// WhatsApp
export { sendWhatsAppText, testWhatsAppConnection, downloadAndStoreMedia, markMessageRead } from './whatsapp/client';
export { handleWebhookVerification, verifyWebhookSignature, processWhatsAppWebhook }        from './whatsapp/webhook';
export { smartSend, sendTemplateMessage, isWithin24hWindow, TEMPLATES }                     from './whatsapp/templates';

// Email
export { sendOutreachEmail, sendFollowupEmail, testResendConnection } from './email/resend';

// Calendar
export { processCalendlyWebhook, verifyCalendlySignature } from './calendar/calendly';
