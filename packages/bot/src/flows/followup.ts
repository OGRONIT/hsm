// ─────────────────────────────────────────────────────────────
// HSM Bot — Followup Flow
// Two followups max: 2 days + 5 days after outreach.
// Each adds a NEW value point not mentioned before.
// ─────────────────────────────────────────────────────────────

import { buildSystemPrompt, STAGE_PROMPTS, SmitContext } from '../persona/smit';
import { enforceRules } from '../persona/rules';
import { buildLanguageInstruction } from '../language/switcher';
import { generateWithOpenAI } from '../ai/openai';

export interface FollowupInput {
  leadId:         string;
  companyName:    string;
  ownerName:      string | null;
  industry:       string;
  source:         string;
  language:       string;
  channel:        'whatsapp' | 'email';
  followupNumber: 1 | 2;
  calendlyUrl:    string;
  firstMessagePreview?: string; // snippet of first message to reference
}

// ─────────────────────────────────────────────────────────────
// New value points for each followup (must be fresh, not repeated)
// ─────────────────────────────────────────────────────────────
const FOLLOWUP_VALUE_POINTS = {
  1: {
    home_appliances:   'One thing I forgot to mention — 3D lets you show internal components like heating elements, motors, and filters. No camera can do that.',
    heavy_machinery:   'One more thing — with 3D you can create assembly/disassembly animations for service manuals and sales demos. Huge value for B2B buyers.',
    safes:             'Quick add — 3D lets you animate the locking mechanism in slow motion. Buyers love seeing exactly how the security works.',
    submersible_pumps: 'One thing I should add — cross-section animations showing water flow path are converting very well for pump manufacturers right now.',
    peanut_sorting:    'One more value — we can animate the entire sorting process step by step. Trade show buyers find this incredibly convincing.',
    auto_parts:        'Quick thing — 3D lets you show every tolerance and mating surface in detail. Buyers can virtually inspect before ordering.',
    other:             'One thing I should mention — once created, 3D assets work forever: website, catalog, Amazon, exhibitions — one investment, unlimited use.',
  },
  2: {
    home_appliances:   'Last thought — your competitors are likely already exploring 3D. Early movers in this space always stand out at trade shows and on portals.',
    heavy_machinery:   'Final thought from me — machinery 3D animations are getting massive traction on LinkedIn and industry portals. Worth a 20-minute conversation?',
    safes:             'One final thing — safe manufacturers using 3D animations are seeing 40-60% more inquiry-to-meeting conversions on IndiaMart. Worth a quick call?',
    submersible_pumps: 'Last message from me — pump and motor manufacturers using 3D are standing out heavily on IndiaMart right now. Worth a 20-min chat?',
    peanut_sorting:    'Final note — sorting machine buyers love technical animations. If you\'re exhibiting at trade fairs, this changes the game completely.',
    auto_parts:        'Last thought — auto parts is one of our strongest verticals. Happy to show you samples specifically from this industry. Worth 20 minutes?',
    other:             'Last message from me — happy to share samples from your specific industry. If timing isn\'t right, no problem at all. Whenever you\'re ready.',
  },
};

export async function generateFollowupMessage(input: FollowupInput): Promise<{
  text: string; tokensUsed: number; costUsd: number; modelUsed: string;
}> {
  const ctx: SmitContext = {
    companyName: input.companyName,
    ownerName:   input.ownerName,
    industry:    input.industry,
    source:      input.source,
    language:    input.language,
    stage:       'followup',
    calendlyUrl: input.calendlyUrl,
  };

  const languageInstruction = buildLanguageInstruction({
    current:    input.language as any,
    locked:     false,
    confidence: 0.5,
  });

  const systemPrompt = buildSystemPrompt(ctx) + '\n\n' + languageInstruction;

  const valuePoints = FOLLOWUP_VALUE_POINTS[input.followupNumber];
  const valuePoint  = valuePoints[input.industry as keyof typeof valuePoints] ?? valuePoints.other;

  const followupInstruction = input.followupNumber === 1
    ? 'This is a gentle first follow-up (2 days after first message, no reply received). Reference the first message briefly. Add the new value point naturally.'
    : 'This is the FINAL follow-up (5 days after first message, still no reply). Keep it very short. Not pushy. Leave the door open gracefully.';

  const userPrompt = `
Generate a ${input.channel} follow-up message (#${input.followupNumber}) to:
- Company: ${input.companyName}
- Owner: ${input.ownerName ?? 'Unknown'}
- Industry: ${input.industry}
${input.firstMessagePreview ? `- First message we sent: "${input.firstMessagePreview}"` : ''}

${followupInstruction}

New value point to add naturally: "${valuePoint}"

${input.channel === 'whatsapp'
    ? 'Max 3 lines. No bullets. Very conversational.'
    : 'Max 100 words. Warm but brief.'}

Generate the message only.`.trim();

  const { text, tokensUsed, costUsd } = await generateWithOpenAI(
    systemPrompt,
    userPrompt,
    input.channel,
  );

  const { sanitized } = enforceRules(text, input.channel);

  return { text: sanitized, tokensUsed, costUsd, modelUsed: 'gpt-4o-mini' };
}
