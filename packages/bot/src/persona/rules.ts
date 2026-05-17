// ─────────────────────────────────────────────────────────────
// HSM Bot — Hard Rules Enforcer
// Runs AFTER AI generates a response.
// Catches any rule violations before message is sent.
// ─────────────────────────────────────────────────────────────

export interface RuleViolation {
  rule:        string;
  matched:     string;
  severity:    'block' | 'warn';
}

export interface RuleCheckResult {
  passed:     boolean;
  violations: RuleViolation[];
  sanitized:  string;   // Message after auto-fixes (or original if blocked)
}

// ─────────────────────────────────────────────────────────────
// BLOCKING RULES — message must NOT be sent if these fire
// ─────────────────────────────────────────────────────────────
const BLOCKING_PATTERNS: Array<{ rule: string; pattern: RegExp }> = [
  // Price mentions
  {
    rule: 'NO_PRICE',
    pattern: /₹\s*[\d,]+|rs\.?\s*[\d,]+|inr\s*[\d,]+|\d+\s*thousand|\d+\s*lakh|\d+k\s*(per|for)|starting\s+from\s+[\d₹]/gi,
  },
  // Guarantees
  {
    rule: 'NO_GUARANTEE',
    pattern: /\b(guarantee|guaranteed|assure|promise|100%\s+sure|definitely\s+will|commit\s+to)\b/gi,
  },
  // Competitor mentions (add more as needed)
  {
    rule: 'NO_COMPETITORS',
    pattern: /\b(renderforest|fiverr|freelancer|99designs|designhill|upwork|other\s+studio|competitor)\b/gi,
  },
  // AI disclosure
  {
    rule: 'NO_AI_DISCLOSURE',
    pattern: /\b(i('m| am)\s+(an?\s+)?(ai|bot|chatbot|language\s+model|llm|gpt|claude|artificial\s+intelligence))\b/gi,
  },
  // Timelines guarantee
  {
    rule: 'NO_TIMELINE_GUARANTEE',
    pattern: /\b(deliver\s+in\s+\d+\s+days?\s+guaranteed|ready\s+in\s+exactly|100%\s+on\s+time)\b/gi,
  },
];

// ─────────────────────────────────────────────────────────────
// AUTO-FIX RULES — apply before returning (warn only)
// ─────────────────────────────────────────────────────────────
const AUTO_FIX_PATTERNS: Array<{ rule: string; pattern: RegExp; replacement: string }> = [
  // Generic AI phrases
  { rule: 'NO_AI_PHRASES',    pattern: /\b(certainly!|of course!|absolutely!|great question!|i'd be happy to)\b/gi, replacement: '' },
  // Remove bullet points from WA messages
  { rule: 'NO_BULLETS_WA',   pattern: /^[\s]*[-•*]\s+/gm, replacement: '' },
  // Remove numbered lists
  { rule: 'NO_NUMBERED_LIST', pattern: /^[\s]*\d+\.\s+/gm, replacement: '' },
  // Remove multiple consecutive emojis
  { rule: 'MAX_EMOJIS',       pattern: /([\u{1F300}-\u{1F9FF}][\s]*){3,}/gu, replacement: '' },
  // Trim excessive exclamation
  { rule: 'NO_EXCESSIVE_EXCLAIM', pattern: /!{3,}/g, replacement: '!' },
];

// ─────────────────────────────────────────────────────────────
// Main rule checker
// ─────────────────────────────────────────────────────────────
export function enforceRules(message: string, channel: 'whatsapp' | 'email' = 'whatsapp'): RuleCheckResult {
  const violations: RuleViolation[] = [];
  let sanitized = message;

  // 1. Check blocking rules
  for (const { rule, pattern } of BLOCKING_PATTERNS) {
    const matches = message.match(pattern);
    if (matches) {
      violations.push({
        rule,
        matched:  matches[0],
        severity: 'block',
      });
    }
  }

  // 2. If any blocking violations → don't send, return fallback
  if (violations.some(v => v.severity === 'block')) {
    console.warn('[RuleEnforcer] BLOCKED message — violations:', violations.map(v => v.rule));
    return {
      passed:     false,
      violations,
      sanitized:  getFallbackMessage(channel),
    };
  }

  // 3. Apply auto-fixes (warn-level)
  for (const { rule, pattern, replacement } of AUTO_FIX_PATTERNS) {
    const before = sanitized;
    sanitized = sanitized.replace(pattern, replacement);
    if (sanitized !== before) {
      violations.push({ rule, matched: '(auto-fixed)', severity: 'warn' });
    }
  }

  // 4. WhatsApp-specific: enforce max length
  if (channel === 'whatsapp' && sanitized.length > 600) {
    sanitized = sanitized.slice(0, 580) + '...';
    violations.push({ rule: 'MAX_LENGTH_WA', matched: '(truncated)', severity: 'warn' });
  }

  // 5. Cleanup extra blank lines left by auto-fixes
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n').trim();

  return {
    passed:     true,
    violations,
    sanitized,
  };
}

// ─────────────────────────────────────────────────────────────
// Fallback message when AI output is blocked
// ─────────────────────────────────────────────────────────────
function getFallbackMessage(channel: 'whatsapp' | 'email'): string {
  if (channel === 'whatsapp') {
    return 'Sir, main aapko jaldi connect karta hoon — thoda busy hoon abhi. 🙏';
  }
  return 'Thank you for your message. I will get back to you shortly. Best regards, Smit | Hariii Design';
}

// ─────────────────────────────────────────────────────────────
// Export for testing / admin panel display
// ─────────────────────────────────────────────────────────────
export const RULE_NAMES = [
  ...BLOCKING_PATTERNS.map(r => r.rule),
  ...AUTO_FIX_PATTERNS.map(r => r.rule),
];
