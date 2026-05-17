// ─────────────────────────────────────────────────────────────
// HSM Bot — GPT-4o Mini Client
// Used for: initial outreach + followup messages (cheaper)
// Claude handles the complex closing conversations
// ─────────────────────────────────────────────────────────────

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY?.trim() || 'placeholder-openai-key',
});

export interface OpenAIResponse {
  text:       string;
  tokensUsed: number;
  costUsd:    number;
}

// GPT-4o Mini pricing
const COST_PER_INPUT_TOKEN  = 0.15e-6;
const COST_PER_OUTPUT_TOKEN = 0.60e-6;

export async function generateWithOpenAI(
  systemPrompt: string,
  userMessage:  string,
  channel:      'whatsapp' | 'email' = 'whatsapp',
): Promise<OpenAIResponse> {
  const maxTokens = channel === 'whatsapp' ? 180 : 400;

  try {
    const response = await client.chat.completions.create({
      model:      'gpt-4o-mini',
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
      temperature: 0.8,
    });

    const text      = response.choices[0].message.content ?? '';
    const inputTok  = response.usage?.prompt_tokens ?? 0;
    const outputTok = response.usage?.completion_tokens ?? 0;
    const costUsd   = inputTok * COST_PER_INPUT_TOKEN + outputTok * COST_PER_OUTPUT_TOKEN;

    console.log(`[OpenAI] Generated ${outputTok} tokens | cost: $${costUsd.toFixed(6)}`);
    return { text, tokensUsed: inputTok + outputTok, costUsd };
  } catch (err: any) {
    console.error('[OpenAI] API error:', err.message);
    if (err.status === 429) throw new Error('OPENAI_RATE_LIMIT');
    if (err.status === 401) throw new Error('OPENAI_AUTH_ERROR: Invalid API key');
    throw err;
  }
}

export async function testOpenAIConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await client.chat.completions.create({
      model:      'gpt-4o-mini',
      max_tokens: 5,
      messages:   [{ role: 'user', content: 'Say ok' }],
    });
    return { ok: !!res.choices[0].message.content };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
