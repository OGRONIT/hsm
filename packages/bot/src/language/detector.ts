// ─────────────────────────────────────────────────────────────
// HSM Bot — Language Detector
// Detects: en | hi | gu | hinglish | gujlish
// Uses character-set analysis + keyword matching
// (franc library as fallback for standard languages)
// ─────────────────────────────────────────────────────────────

export type DetectedLanguage = 'en' | 'hi' | 'gu' | 'hinglish' | 'gujlish';

// ─────────────────────────────────────────────────────────────
// Common Hindi/Hinglish signal words (Roman script)
// ─────────────────────────────────────────────────────────────
const HINDI_SIGNALS = new Set([
  'hai', 'hain', 'ho', 'tha', 'thi', 'the', 'kya', 'aap', 'main', 'mein',
  'nahi', 'hoga', 'karo', 'bhai', 'sir', 'ji', 'bata', 'batao', 'samjho',
  'accha', 'theek', 'bilkul', 'zaroor', 'abhi', 'kal', 'aaj', 'kab', 'kahan',
  'kaise', 'kyun', 'matlab', 'dekho', 'suno', 'lena', 'dena', 'karna', 'rehna',
  'chahiye', 'milna', 'bolna', 'sunna', 'phir', 'lekin', 'toh', 'aur', 'ya',
  'woh', 'yeh', 'iska', 'uska', 'hamara', 'tumhara', 'apna', 'sab', 'kuch',
  'bahut', 'thoda', 'zyada', 'kam', 'achha', 'bura', 'naya', 'purana',
  'paisa', 'paise', 'rupee', 'rupees', 'lakh', 'karod', 'kaam', 'kab',
]);

// ─────────────────────────────────────────────────────────────
// Common Gujarati/Gujlish signal words (Roman script)
// ─────────────────────────────────────────────────────────────
const GUJARATI_SIGNALS = new Set([
  'chhe', 'che', 'hatu', 'hatu', 'nathi', 'kariye', 'kahiye', 'tamara',
  'tamne', 'ame', 'apne', 'saru', 'saras', 'barobar', 'thay', 'thaay',
  'karo', 'karie', 'joie', 'joise', 'malse', 'rehse', 'rehshe', 'batavso',
  'samjavso', 'dikhavsho', 'dakhavis', 'rehvu', 'khevu', 'pevu', 'jaavu',
  'aavvu', 'javsho', 'aavsho', 'ketlu', 'ketla', 'shu', 'shun', 'nai',
  'na', 'ha', 'haa', 'kem', 'kyare', 'kyan', 'kyathi', 'su', 'shu',
  'bhai', 'saheb', 'ben', 'kaka', 'dada', 'bapuji', 'boss', 'sahib',
  'kagad', 'chinta', 'tension', 'khabar', 'mast', 'maja', 'game',
  'tame', 'ane', 'pachi', 'pela', 'peli', 'aavu', 'lidhu', 'aapi',
]);

// ─────────────────────────────────────────────────────────────
// Devanagari unicode range check
// ─────────────────────────────────────────────────────────────
function hasDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

function hasGujaratiScript(text: string): boolean {
  return /[\u0A80-\u0AFF]/.test(text);
}

// ─────────────────────────────────────────────────────────────
// Score text against a signal word set
// Returns 0.0 - 1.0 (fraction of words that match)
// ─────────────────────────────────────────────────────────────
function scoreAgainstSignals(words: string[], signals: Set<string>): number {
  if (words.length === 0) return 0;
  const matches = words.filter(w => signals.has(w.toLowerCase())).length;
  return matches / words.length;
}

// ─────────────────────────────────────────────────────────────
// Main detector
// ─────────────────────────────────────────────────────────────
export function detectLanguage(text: string): DetectedLanguage {
  if (!text || text.trim().length < 2) return 'en';

  const cleaned = text.trim();

  // 1. Native script detection (most reliable)
  if (hasGujaratiScript(cleaned)) return 'gu';
  if (hasDevanagari(cleaned)) return 'hi';

  // 2. Roman script analysis
  const words = cleaned
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);

  const hiScore = scoreAgainstSignals(words, HINDI_SIGNALS);
  const guScore = scoreAgainstSignals(words, GUJARATI_SIGNALS);
  const totalSignalScore = hiScore + guScore;

  // Pure English (no signal words from either language)
  if (totalSignalScore < 0.05) return 'en';

  // Mixed with English = Hinglish or Gujlish
  const englishWords = words.filter(w => !HINDI_SIGNALS.has(w) && !GUJARATI_SIGNALS.has(w));
  const mixRatio = englishWords.length / Math.max(words.length, 1);

  if (guScore > hiScore) {
    // Gujarati-dominant
    return mixRatio > 0.3 ? 'gujlish' : 'gu';
  } else {
    // Hindi-dominant
    return mixRatio > 0.3 ? 'hinglish' : 'hi';
  }
}

// ─────────────────────────────────────────────────────────────
// Detect from conversation history (last 3 messages from lead)
// More accurate than single-message detection
// ─────────────────────────────────────────────────────────────
export function detectLanguageFromHistory(
  messages: Array<{ direction: string; message: string }>,
): DetectedLanguage {
  // Only use inbound messages (from the lead, not our outreach)
  const inbound = messages
    .filter(m => m.direction === 'inbound')
    .slice(-3)
    .map(m => m.message)
    .join(' ');

  if (!inbound.trim()) return 'en';
  return detectLanguage(inbound);
}

// ─────────────────────────────────────────────────────────────
// Language display names (for admin panel)
// ─────────────────────────────────────────────────────────────
export const LANGUAGE_LABELS: Record<DetectedLanguage, string> = {
  en:       'English',
  hi:       'Hindi',
  gu:       'Gujarati',
  hinglish: 'Hinglish',
  gujlish:  'Gujlish',
};

// ─────────────────────────────────────────────────────────────
// Language-specific greeting helpers
// ─────────────────────────────────────────────────────────────
export function getGreeting(language: DetectedLanguage, ownerName: string | null): string {
  const name = ownerName ?? null;
  const greetings: Record<DetectedLanguage, string> = {
    en:       name ? `Hi ${name}!` : 'Hi there!',
    hi:       name ? `${name} ji,` : 'Namaste ji,',
    gu:       name ? `${name} saheb,` : 'Kem cho saheb,',
    hinglish: name ? `${name} bhai,` : 'Bhai,',
    gujlish:  name ? `${name} bhai,` : 'Are bhai,',
  };
  return greetings[language];
}
