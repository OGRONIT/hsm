// ─────────────────────────────────────────────────────────────
// HSM Bot — Objection Handler
// Uses Claude 3.5 Sonnet — needs better reasoning for objections
// ─────────────────────────────────────────────────────────────

import { buildSystemPrompt, SmitContext } from '../persona/smit';
import { enforceRules } from '../persona/rules';
import { buildLanguageInstruction, getLanguageState } from '../language/switcher';
import { generateWithClaude } from '../ai/claude';

export interface ObjectionInput {
  leadId:              string;
  companyName:         string;
  ownerName:           string | null;
  industry:            string;
  source:              string;
  channel:             'whatsapp' | 'email';
  calendlyUrl:         string;
  incomingMessage:     string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

// ─────────────────────────────────────────────────────────────
// Classify objection type from message
// ─────────────────────────────────────────────────────────────
type ObjectionType =
  | 'price'
  | 'not_needed'
  | 'want_sample'
  | 'thinking'
  | 'no_budget'
  | 'already_have'
  | 'no_time'
  | 'unknown';

function classifyObjection(message: string): ObjectionType {
  const lower = message.toLowerCase();

  if (/costly|expensive|mehenga|vhevu|mahagu|price|cost|kitna|ketlu/.test(lower)) return 'price';
  if (/nahi chahiye|don't need|nai joie|not required|no need/.test(lower))         return 'not_needed';
  if (/sample|demo|example|pehle dikhao|pahela dakho|show me/.test(lower))         return 'want_sample';
  if (/sochta|sochke|think|consider|baad mein|pachhi|later|time de/.test(lower))   return 'thinking';
  if (/budget nahi|no budget|afford|paisey nathi|paisa nahi/.test(lower))          return 'no_budget';
  if (/already|pehle se|pahela thi|someone else|doosri company/.test(lower))       return 'already_have';
  if (/time nahi|busy|no time|baad mein|later|abhi nahi|haju nahi/.test(lower))   return 'no_time';
  return 'unknown';
}

// ─────────────────────────────────────────────────────────────
// Pre-written objection scripts (fed to Claude as context)
// ─────────────────────────────────────────────────────────────
const OBJECTION_SCRIPTS: Record<ObjectionType, string> = {
  price: `The lead thinks it's expensive. Use value framing:
- Compare to physical studio costs (crane hire, set design, multiple shoot days, editing)
- 3D is a one-time investment, traditional is recurring
- Don't mention specific price ranges
- Invite them to a call where you can explain the ROI properly`,

  not_needed: `The lead says they don't need 3D. Reframe with competition angle:
- Acknowledge their position respectfully
- Ask: "Your competitors who ARE using 3D — are you happy letting them look more premium?"
- Don't push hard, plant a seed and ask one question`,

  want_sample: `The lead wants to see a sample. This is actually a GREAT sign — don't resist:
- Enthusiastically agree
- Ask them to send a rough mobile photo of their product
- Tell them you'll show concepts specifically for their product
- This is the photo request flow — use it!`,

  thinking: `The lead is thinking about it. Acknowledge and keep the door warm:
- Don't push
- Tell them no rush
- Mention you'll check in after 2-3 days
- Keep it very short — 2 lines max`,

  no_budget: `The lead says no budget. Reframe as investment vs cost:
- Acknowledge the budget concern
- Compare one-time 3D investment vs recurring traditional shoot costs
- Mention that once created, assets work forever across all platforms
- Ask if they'd like to see the numbers on a quick call`,

  already_have: `The lead already works with someone for 3D or photography. Stay warm:
- Acknowledge positively ("Great that you're already thinking about this!")
- Differentiate subtly (different style, specialized in manufacturers, etc.)
- Offer to show a sample specifically from their industry
- Don't badmouth competitors (hard rule)`,

  no_time: `The lead says they're busy. Respect their time:
- Acknowledge immediately
- Offer maximum flexibility ("You tell me when — even 10 minutes works")
- Keep the message extremely short`,

  unknown: `This is a general reply. Engage warmly, answer their question, and move the conversation toward showing value or booking a call.`,
};

// ─────────────────────────────────────────────────────────────
// Generate objection handling response
// ─────────────────────────────────────────────────────────────
export async function handleObjection(input: ObjectionInput): Promise<{
  text: string; tokensUsed: number; costUsd: number; objectionType: ObjectionType;
}> {
  const langState = await getLanguageState(input.leadId);

  const ctx: SmitContext = {
    companyName:      input.companyName,
    ownerName:        input.ownerName,
    industry:         input.industry,
    source:           input.source,
    language:         langState.current,
    stage:            'engaged',
    calendlyUrl:      input.calendlyUrl,
    previousMessages: input.conversationHistory,
  };

  const objectionType   = classifyObjection(input.incomingMessage);
  const objectionScript = OBJECTION_SCRIPTS[objectionType];
  const langInstruction = buildLanguageInstruction(langState);

  const systemPrompt = `${buildSystemPrompt(ctx)}

${langInstruction}

OBJECTION CONTEXT:
The lead just said: "${input.incomingMessage}"
Objection type detected: ${objectionType}

HOW TO HANDLE THIS SPECIFIC OBJECTION:
${objectionScript}

Generate ONLY the reply message. No explanation. ${input.channel === 'whatsapp' ? 'Max 4 lines. No bullets.' : 'Max 120 words.'}`;

  const { text, tokensUsed, costUsd } = await generateWithClaude(
    systemPrompt,
    input.conversationHistory,
    input.incomingMessage,
    input.channel,
  );

  const { sanitized } = enforceRules(text, input.channel);

  return { text: sanitized, tokensUsed, costUsd, objectionType };
}
