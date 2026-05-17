// ─────────────────────────────────────────────────────────────
// HSM Bot — Claude 3.5 Sonnet Client
// Used for: engaged leads, closing conversations, hot leads
// Better reasoning → better at complex objection handling
// ─────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY?.trim() || 'placeholder-anthropic-key',
});

export interface ClaudeResponse {
  text:       string;
  tokensUsed: number;
  costUsd:    number;
}

// Claude 3.5 Sonnet pricing (as of late 2024)
const COST_PER_INPUT_TOKEN  = 3e-6;   // $3 per 1M input tokens
const COST_PER_OUTPUT_TOKEN = 15e-6;  // $15 per 1M output tokens

// ─────────────────────────────────────────────────────────────
// Generate a response as Smit (for engaged/closing conversations)
// ─────────────────────────────────────────────────────────────
export async function generateWithClaude(
  systemPrompt: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  incomingMessage: string,
  channel: 'whatsapp' | 'email' = 'whatsapp',
): Promise<ClaudeResponse> {
  const maxTokens = channel === 'whatsapp' ? 200 : 500;

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...conversationHistory,
    { role: 'user', content: incomingMessage },
  ];

  try {
    const response = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system:     systemPrompt,
      messages,
    });

    const text       = response.content[0].type === 'text' ? response.content[0].text : '';
    const inputTok   = response.usage.input_tokens;
    const outputTok  = response.usage.output_tokens;
    const tokensUsed = inputTok + outputTok;
    const costUsd    = inputTok * COST_PER_INPUT_TOKEN + outputTok * COST_PER_OUTPUT_TOKEN;

    console.log(`[Claude] Generated ${outputTok} tokens | cost: $${costUsd.toFixed(6)}`);

    return { text, tokensUsed, costUsd };
  } catch (err: any) {
    console.error('[Claude] API error:', err.message);

    // Handle rate limits gracefully
    if (err.status === 429) {
      throw new Error('CLAUDE_RATE_LIMIT: Too many requests');
    }
    if (err.status === 401) {
      throw new Error('CLAUDE_AUTH_ERROR: Invalid API key — check admin panel');
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// Health check — used by admin panel "Test Key" button
// ─────────────────────────────────────────────────────────────
export async function testClaudeConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 10,
      messages:   [{ role: 'user', content: 'Say "ok" only.' }],
    });
    return { ok: res.content[0].type === 'text' };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
