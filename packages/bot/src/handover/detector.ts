// ─────────────────────────────────────────────────────────────
// HSM Bot — Handover / Hot Lead Detector
// Scans every inbound message for booking trigger words.
// When detected → fires BookingJob immediately.
// ─────────────────────────────────────────────────────────────

export interface HandoverResult {
  isHotLead:      boolean;
  triggerWord:    string | null;
  confidence:     number;        // 0-1
  shouldAlert:    boolean;       // whether to ping Smit
}

export type YesNoSignal = 'yes' | 'no' | 'time_mention' | null;

// ─────────────────────────────────────────────────────────────
// Tier 1 — Strong buying signals (confidence: 1.0)
// ─────────────────────────────────────────────────────────────
const TIER1_TRIGGERS = [
  // English
  'call karo', 'call me', 'let\'s talk', 'let\'s connect', 'meeting fix karo',
  'fix a meeting', 'schedule a call', 'book a call', 'set up a call',
  'i\'m interested', 'i am interested', 'we are interested', 'let\'s proceed',
  'move forward', 'go ahead', 'i\'d like to', 'we\'d like to',
  // Hindi/Hinglish
  'call karo', 'baat karte hain', 'call pe baat', 'meeting karte hain',
  'time dete hain', 'aage badhte hain', 'proceed karte hain', 'haan karo',
  'schedule karo', 'link bhejo', 'calendly bhejo', 'date fix karo',
  // Gujarati/Gujlish
  'call karie', 'baat karie', 'meeting karie', 'time apo', 'aave karie',
  'chalo karie', 'karie ne', 'gohvie', 'sambhalo', 'aavi jao',
];

// ─────────────────────────────────────────────────────────────
// Tier 2 — Soft interest signals (confidence: 0.7 — alert but don't book yet)
// ─────────────────────────────────────────────────────────────
const TIER2_TRIGGERS = [
  // English
  'okay', 'ok', 'fine', 'sounds good', 'interesting', 'tell me more',
  'how does it work', 'what\'s the process', 'what next', 'next steps',
  'how long', 'how much time', 'when can we', 'i want to know more',
  // Hindi/Hinglish
  'theek hai', 'thik hai', 'accha', 'achha', 'batao', 'samjhao',
  'dikhao', 'bata', 'haan', 'ha', 'sahi hai', 'try karna chahta',
  'discuss karna hai', 'details chahiye', 'aur batao', 'interesting laga',
  // Gujarati/Gujlish
  'saru che', 'saru lage', 'ha', 'haa', 'batavso', 'samjavso',
  'dikhavso', 'dakhavis', 'vanchvanu', 'janavano', 'thay', 'thase',
];

// ─────────────────────────────────────────────────────────────
// Negative signals — lead is objecting or declining
// (used to avoid false positives from tier2)
// ─────────────────────────────────────────────────────────────
const NEGATIVE_SIGNALS = [
  'nahi', 'no thanks', 'not interested', 'don\'t need', 'nai joie',
  'nathi joitu', 'hatao', 'remove', 'unsubscribe', 'stop', 'band karo',
  'mat bhejo', 'block', 'spam', 'wrong number', 'galat number',
];

// ─────────────────────────────────────────────────────────────
// Main detector
// ─────────────────────────────────────────────────────────────
export function detectHandover(message: string): HandoverResult {
  const lower = message.toLowerCase().trim();

  // Check for negative signals first — bail early
  const hasNegative = NEGATIVE_SIGNALS.some(neg => lower.includes(neg));
  if (hasNegative) {
    return { isHotLead: false, triggerWord: null, confidence: 0, shouldAlert: false };
  }

  // Tier 1 check — strong signals
  const tier1Match = TIER1_TRIGGERS.find(trigger => lower.includes(trigger));
  if (tier1Match) {
    return {
      isHotLead:   true,
      triggerWord: tier1Match,
      confidence:  1.0,
      shouldAlert: true,
    };
  }

  // Tier 2 check — soft signals
  const tier2Match = TIER2_TRIGGERS.find(trigger => lower.includes(trigger));
  if (tier2Match) {
    // Soft signals alone: flag as warm but don't immediately push booking
    // Let the bot continue the conversation — booking push happens after bot response
    return {
      isHotLead:   false,   // Not booking yet
      triggerWord: tier2Match,
      confidence:  0.7,
      shouldAlert: true,    // But alert Smit that this is getting warm
    };
  }

  return { isHotLead: false, triggerWord: null, confidence: 0, shouldAlert: false };
}

// ─────────────────────────────────────────────────────────────
// Check if message contains a photo (WhatsApp media)
// ─────────────────────────────────────────────────────────────
export function isMediaMessage(waMessage: Record<string, any>): boolean {
  return !!(
    waMessage.image ||
    waMessage.video ||
    waMessage.document ||
    waMessage.audio
  );
}

// ─────────────────────────────────────────────────────────────
// Detect opt-out requests
// ─────────────────────────────────────────────────────────────
export function detectOptOut(message: string): boolean {
  const lower = message.toLowerCase();
  const optOutSignals = [
    'stop', 'unsubscribe', 'opt out', 'remove me', 'do not contact',
    'mat bhejo', 'band karo', 'hatao mujhe', 'nahi chahiye koi message',
    'wrong number', 'galat number',
  ];
  return optOutSignals.some(s => lower.includes(s));
}

// ─────────────────────────────────────────────────────────────
// Detect yes/no/time-mention replies for meeting scheduling
// ─────────────────────────────────────────────────────────────
export function detectYesNo(message: string): YesNoSignal {
  const lower = message.toLowerCase().trim();

  const yesPatterns = [
    /\byes\b/, /\bhaan\b/, /\bhaa\b/, /\bha\b/, /\bbilkul\b/, /\bzaroor\b/, /\bok\b/, /\bokay\b/, /\bdone\b/, /\bconfirmed\b/,
    /\bsaru\b/, /\bthay\b/, /\bkaro\b/, /fix karo/, /book karo/,
  ];
  const noPatterns = [
    /\bno\b/, /\bnahi\b/, /\bnai\b/, /\bnathi\b/, /\bna\b/, /\bmat\b/, /\bcancel\b/, /band karo/,
  ];

  if (yesPatterns.some(pattern => pattern.test(lower))) return 'yes';
  if (noPatterns.some(pattern => pattern.test(lower))) return 'no';

  const timeMentionPatterns = [
    /\b\d{1,2}(?::\d{2})?\s*(am|pm)?\b/,
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(o'?clock|baje|vage|vaage)?\b/,
    /\b(ek|do|teen|char|chaar|paanch|panch|chhe|saat|aath|nau|das|gyaarah|baraah)\s*(baje|vage|vaage)?\b/,
    /\b(sham|shaam|sanje|evening|subah|morning|pm|am)\b/,
  ];

  if (timeMentionPatterns.some(pattern => pattern.test(lower))) return 'time_mention';
  return null;
}
