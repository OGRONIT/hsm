// ─────────────────────────────────────────────────────────────
// HSM Bot — Meeting Closer Flow
// Triggers when hot-lead detected. Uses Claude for best output.
// ─────────────────────────────────────────────────────────────

import { buildSystemPrompt, SmitContext } from '../persona/smit';
import { enforceRules } from '../persona/rules';
import { buildLanguageInstruction, getLanguageState } from '../language/switcher';
import { generateWithClaude } from '../ai/claude';

const CALENDLY_URL = process.env.CALENDLY_BOOKING_URL ?? 'https://calendly.com/smit-hariii/20min';

export interface MeetingCloserInput {
  leadId:              string;
  companyName:         string;
  ownerName:           string | null;
  industry:            string;
  source:              string;
  channel:             'whatsapp' | 'email';
  triggerMessage:      string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

// ─────────────────────────────────────────────────────────────
// Generate calendar push message
// ─────────────────────────────────────────────────────────────
export async function generateMeetingCloserMessage(input: MeetingCloserInput): Promise<{
  text: string; tokensUsed: number; costUsd: number;
}> {
  const langState = await getLanguageState(input.leadId);

  const ctx: SmitContext = {
    companyName:      input.companyName,
    ownerName:        input.ownerName,
    industry:         input.industry,
    source:           input.source,
    language:         langState.current,
    stage:            'closing',
    calendlyUrl:      CALENDLY_URL,
    previousMessages: input.conversationHistory,
  };

  const langInstruction = buildLanguageInstruction(langState);

  const systemPrompt = `${buildSystemPrompt(ctx)}

${langInstruction}

The lead just showed strong interest by saying: "${input.triggerMessage}"

YOUR GOAL: Get them to click the Calendly link right now.
- Acknowledge their interest warmly (1 line)
- Share the Calendly link clearly
- Keep it short — don't pitch more, they're already interested
- ${input.channel === 'whatsapp' ? 'Max 3 lines.' : 'Max 80 words.'}

Calendly link: ${CALENDLY_URL}`;

  const { text, tokensUsed, costUsd } = await generateWithClaude(
    systemPrompt,
    input.conversationHistory,
    input.triggerMessage,
    input.channel,
  );

  const { sanitized } = enforceRules(text, input.channel);
  return { text: sanitized, tokensUsed, costUsd };
}


// ─────────────────────────────────────────────────────────────
// HSM Bot — Photo Request (LAST RESORT ONLY)
// Use ONLY when lead is lukewarm after 2+ ignored messages.
// Primary goal is always meeting. Smit asks for photos/media
// AFTER the deal is closing, not during bot outreach.
// ─────────────────────────────────────────────────────────────

export interface PhotoRequestInput {
  leadId:   string;
  ownerName: string | null;
  language:  string;
  channel:   'whatsapp' | 'email';
}

const PHOTO_REQUEST_TEMPLATES: Record<string, Record<string, string>> = {
  whatsapp: {
    en:       `Sir, one small request — could you send a rough photo of your product? Any angle, even mobile camera is fine. I'll show our team and they'll quickly tell me what's possible specifically for your product. 📸`,
    hi:       `Sir ek kaam karo — apne product ki ek rough photo bhejo (koi bhi angle se, mobile se chalega). Main apne designers ko dikhata hoon, woh batayenge specifically aapke product ke liye kya kya possible hai.`,
    gu:       `Saheb, ek kaam karo — tamara product ni ek rough photo moko (gamo te angle, mobile thi chalse). Main mara designers ne dakavis, te kaheshe specifically tamara product mate shu shu thay shake.`,
    hinglish: `Bhai, ek request hai — apne product ki ek rough photo bhejo, koi bhi angle se chalega. Main team ko dikhata hoon aur specifically aapke product ke liye kya possible hai — quick feedback dunga.`,
    gujlish:  `Are bhai, ek kaam karo — tamara product ni ek photo moko, gamo te angle thi chalse. Main team ne dakavis ne specifically tamara mate shu thay shake te kahis. 📸`,
  },
  email: {
    en: `Quick request — could you share a photo or reference image of your product? Even a rough mobile shot works perfectly. I'll have our design team look at it and come back to you with specific ideas for your product line.`,
    hi: `Sir, ek request hai — apne product ki ek photo share kar sakte ho? Mobile se bhi chalega. Main design team ko dikhata hoon aur specifically aapke product ke liye kya create kar sakte hain woh batata hoon.`,
    gu: `Saheb, ek request chhe — tamara product ni ek photo share karo? Mobile thi pan chalse. Main design team ne dakavis ne specifically tamara product mate shu create kari shakiye te kahis.`,
    hinglish: `Bhai, ek request — product ki ek rough photo bhejo? Koi bhi angle se chalega. Team ko dikhake specific concepts share karunga aapke liye.`,
    gujlish:  `Bhai, tamara product ni ek photo moko — gamo te angle thi chalse. Team ne dakavis ne specific ideas share karishu tamara mate.`,
  },
};

export function generatePhotoRequestMessage(input: PhotoRequestInput): string {
  const channelTemplates = PHOTO_REQUEST_TEMPLATES[input.channel] ?? PHOTO_REQUEST_TEMPLATES.whatsapp;
  return channelTemplates[input.language] ?? channelTemplates.en;
}

// ─────────────────────────────────────────────────────────────
// Response when lead sends a photo
// ─────────────────────────────────────────────────────────────
export function generatePhotoAcknowledgement(
  language: string,
  ownerName: string | null,
  channel: 'whatsapp' | 'email',
): string {
  const name = ownerName ?? (channel === 'whatsapp' ? 'sir' : 'Sir');
  const acks: Record<string, string> = {
    en:       `Got it ${name}! Sending this to our team right now. Based on what I can see, this is going to look incredible in 3D. Give me a day and I'll share some concepts. Meanwhile — shall we book that 20-min call? ${CALENDLY_URL}`,
    hi:       `${name} ji, mil gaya! Abhi team ko bhej raha hoon. Jo dikh raha hai usse lagta hai 3D mein zabardast lagega. Ek din mein concepts share karta hoon. Saath mein — ek 20-minute call book karte ho? ${CALENDLY_URL}`,
    gu:       `${name} saheb, mali gayu! Haju team ne moklu chu. Jo dikhay chhe te joine lagey chhe 3D ma zabardast lagse. Ek divas ma concepts share karish. Ane sathe — ek 20-minute call book karo? ${CALENDLY_URL}`,
    hinglish: `${name} bhai, mil gaya! Team ko abhi bhej raha hoon. Seriously 3D mein ekdum mast lagega ye product. Ek din mein concepts share karunga. Aur — ek quick call book karo? ${CALENDLY_URL}`,
    gujlish:  `Are ${name} bhai, mali gayu! Team ne haju moklu. Seriously 3D ma zabardast lagse tamaro product. Ek din ma concepts share karishu. Ane — ek quick call book karo? ${CALENDLY_URL}`,
  };
  return acks[language] ?? acks.en;
}
