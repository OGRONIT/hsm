// ─────────────────────────────────────────────────────────────
// HSM Bot — Outreach Flow
// Generates the first message to a brand-new lead.
// Uses GPT-4o Mini (cheap, good enough for cold outreach).
// ─────────────────────────────────────────────────────────────

import { buildSystemPrompt, SmitContext } from '../persona/smit';
import { enforceRules } from '../persona/rules';
import { buildLanguageInstruction } from '../language/switcher';
import { generateWithOpenAI } from '../ai/openai';

export interface OutreachInput {
  leadId:      string;
  companyName: string;
  ownerName:   string | null;
  industry:    string;
  source:      string;
  language:    string;
  channel:     'whatsapp' | 'email';
  calendlyUrl: string;
  // Optional context from scraper for personalization
  productInfo?: string;
  instagramBio?: string;
  location?:    string;
}

export interface GeneratedMessage {
  text:        string;
  tokensUsed:  number;
  costUsd:     number;
  modelUsed:   string;
  rulesPassed: boolean;
}

// ─────────────────────────────────────────────────────────────
// Industry-specific openers (personalization hooks)
// ─────────────────────────────────────────────────────────────
const INDUSTRY_HOOKS: Record<string, string> = {
  home_appliances:   'home appliance manufacturers are now using 3D animations to showcase product features that cameras can\'t capture — like internal mechanisms and airflow',
  heavy_machinery:   'heavy machinery is one of the best use cases for 3D — exploded views, assembly sequences, and spec highlights that physical shoots simply can\'t do',
  safes:             'safe and locker manufacturers are winning B2B clients by showing internal locking mechanisms and security features in 3D — impossible with traditional photography',
  submersible_pumps: 'submersible pump manufacturers are using 3D cross-sections to show buyers exactly how the motor and impeller work — builds massive trust',
  peanut_sorting:    'grading and sorting machine manufacturers are using 3D animations to show the full sorting process — buyers love seeing exactly how it works before purchasing',
  auto_parts:        'auto parts manufacturers are replacing expensive studio shoots with 3D renders that show every angle, tolerance, and spec — at a fraction of the cost',
  other:             'Indian manufacturers are increasingly using 3D product animations to stand out from competitors on platforms like IndiaMart and trade fairs',
};

// ─────────────────────────────────────────────────────────────
// Generate first outreach message
// ─────────────────────────────────────────────────────────────
export async function generateOutreachMessage(input: OutreachInput): Promise<GeneratedMessage> {
  const ctx: SmitContext = {
    companyName: input.companyName,
    ownerName:   input.ownerName,
    industry:    input.industry,
    source:      input.source,
    language:    input.language,
    stage:       'outreach',
    calendlyUrl: input.calendlyUrl,
  };

  const languageInstruction = buildLanguageInstruction({
    current:    input.language as any,
    locked:     false,
    confidence: 0.5,
  });

  const systemPrompt = buildSystemPrompt(ctx) + '\n\n' + languageInstruction;

  const industryHook = INDUSTRY_HOOKS[input.industry] ?? INDUSTRY_HOOKS.other;
  const sourceContext = getSourceContext(input.source, input.instagramBio);
  const channelInstruction = input.channel === 'email'
    ? 'Write a professional cold email (subject line first, then body). Max 150 words.'
    : 'Write a WhatsApp message. Max 4 lines. Conversational. No bullet points.';

  const userPrompt = `
Generate a ${input.channel === 'email' ? 'cold email' : 'WhatsApp outreach message'} to:
- Company: ${input.companyName}
- Owner: ${input.ownerName ?? 'Unknown'}
- Industry: ${input.industry}
- Source: ${input.source} ${sourceContext}
- Location: ${input.location ?? 'India'}

Industry insight to weave in naturally: "${industryHook}"

${channelInstruction}

DO NOT use bullet points. DO NOT mention price. End with ONE question.
Generate the message only — no explanation, no preamble.`.trim();

  const { text, tokensUsed, costUsd } = await generateWithOpenAI(
    systemPrompt,
    userPrompt,
    input.channel,
  );

  // Enforce hard rules
  const { passed, sanitized, violations } = enforceRules(text, input.channel);

  if (violations.length > 0) {
    console.warn(`[OutreachFlow] Rule violations: ${violations.map(v => v.rule).join(', ')}`);
  }

  return {
    text:        sanitized,
    tokensUsed,
    costUsd,
    modelUsed:   'gpt-4o-mini',
    rulesPassed: passed,
  };
}

function getSourceContext(source: string, bio?: string): string {
  const contexts: Record<string, string> = {
    instagram:      bio ? `(found via Instagram — their bio: "${bio.slice(0, 100)}")` : '(found via Instagram)',
    facebook_groups:'(found in a Facebook manufacturer group)',
    indiamart:      '(found on IndiaMart listing)',
    google_maps:    '(found via Google Maps)',
    justdial:       '(found on JustDial)',
    linkedin:       '(found on LinkedIn)',
  };
  return contexts[source] ?? '';
}
