// ─────────────────────────────────────────────────────────────
// HSM Bot — Language Switcher
// Decides when to switch language based on lead's replies.
// Once switched to lead's language → never go back to English.
// ─────────────────────────────────────────────────────────────

import { DetectedLanguage, detectLanguage } from './detector';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export interface LanguageState {
  current:   DetectedLanguage;
  locked:    boolean;   // true = lead replied → language locked, don't switch
  confidence: number;   // 0-1, based on message history
}

// ─────────────────────────────────────────────────────────────
// Get current language state for a lead
// ─────────────────────────────────────────────────────────────
export async function getLanguageState(leadId: string): Promise<LanguageState> {
  // Get detected language from lead record
  const { data: lead } = await supabase
    .from('leads')
    .select('language_detected')
    .eq('id', leadId)
    .single();

  // Get last 5 inbound messages
  const { data: messages } = await supabase
    .from('conversations')
    .select('message, direction')
    .eq('lead_id', leadId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(5);

  const hasReplied = (messages?.length ?? 0) > 0;
  const storedLanguage = (lead?.language_detected as DetectedLanguage) ?? 'en';

  if (!hasReplied) {
    // No replies yet — use stored detection (from scrape) or default English
    return { current: storedLanguage, locked: false, confidence: 0.5 };
  }

  // Detect language from their actual replies
  const replyText = messages!.map(m => m.message).join(' ');
  const detected  = detectLanguage(replyText);

  // Once they reply in a non-English language → lock it
  const locked = detected !== 'en';

  return { current: detected, locked, confidence: locked ? 0.95 : 0.7 };
}

// ─────────────────────────────────────────────────────────────
// Process an incoming message → update language if needed
// ─────────────────────────────────────────────────────────────
export async function processIncomingLanguage(
  leadId: string,
  incomingMessage: string,
): Promise<DetectedLanguage> {
  const detected = detectLanguage(incomingMessage);

  // Update lead's language_detected if they're replying in non-English
  if (detected !== 'en') {
    await supabase
      .from('leads')
      .update({ language_detected: detected })
      .eq('id', leadId);

    console.log(`[LanguageSwitcher] Lead ${leadId} → language locked to: ${detected}`);
  }

  return detected;
}

// ─────────────────────────────────────────────────────────────
// Build language instruction to append to system prompt
// ─────────────────────────────────────────────────────────────
export function buildLanguageInstruction(state: LanguageState): string {
  const instructions: Record<DetectedLanguage, string> = {
    en: `RESPOND IN: English only. Professional and warm.`,

    hi: `RESPOND IN: Hindi/Hinglish. The lead writes in Hindi. Match their style.
Example tone: "Sir, main samajh sakta hoon. Ek cheez batao — aapke competitors ne 3D use karna shuru kar diya hai. Aap bhi aage badhenge?"`,

    gu: `RESPOND IN: Gujarati. The lead writes in Gujarati. Match their native style.
Example tone: "Saheb, no tension. Tamara products mate specifically concept ready karis. Ek vaar juo to khushi thase."`,

    hinglish: `RESPOND IN: Hinglish (Hindi + English mix). The lead writes in Hinglish.
Example tone: "Bhai, bilkul sahi kaha. Actually aapke product ke liye specifically kya kya possible hai — ek call pe show karta hoon, 20 minutes only."`,

    gujlish: `RESPOND IN: Gujlish (Gujarati + English mix). The lead writes in Gujlish.
Example tone: "Are sir, tame tension na lo! Quality top-notch rehshe. Ek vaar call karie — 20 minutes ma sab clear thase."`,
  };

  const lock = state.locked
    ? `\nIMPORTANT: Lead has replied in ${state.current} — DO NOT switch to English. Stay in ${state.current}.`
    : '';

  return (instructions[state.current] ?? instructions.en) + lock;
}
