/**
 * Rule-based checks that run before a prompt is sent and before output is shown.
 * These are cheap first-line rules, not a replacement for a provider's moderation API.
 */
const BLOCKED_INPUT: [RegExp, string][] = [
  [/ignore (all|any|previous|prior) (instructions|rules)/i, "prompt injection attempt"],
  [/\b(?:\d[ -]?){13,16}\b/, "looks like a payment card number"],
  [/\b\d{3}-\d{2}-\d{4}\b/, "looks like a social security number"],
];

const BLOCKED_OUTPUT: [RegExp, string][] = [
  [/\b(?:\d[ -]?){13,16}\b/, "output contains a card-like number"],
  [/\b\d{3}-\d{2}-\d{4}\b/, "output contains an SSN-like number"],
];

function firstMatch(text: string, rules: [RegExp, string][]): string | null {
  for (const [pattern, reason] of rules) if (pattern.test(text)) return reason;
  return null;
}

export function checkInput(prompt: string, maxChars = 4000): string | null {
  if (!prompt.trim()) return "empty prompt";
  if (prompt.length > maxChars) return `prompt longer than ${maxChars} characters`;
  return firstMatch(prompt, BLOCKED_INPUT);
}

export function checkOutput(text: string): string | null {
  if (!text.trim()) return "empty output";
  return firstMatch(text, BLOCKED_OUTPUT);
}
