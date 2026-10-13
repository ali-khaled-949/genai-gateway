export interface GenerateRequest {
  userId: string;
  prompt: string;
  maxOutputTokens?: number;
}

export interface ProviderResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** One generative AI backend. Real adapters (OpenAI, Anthropic, ...) implement this. */
export interface Provider {
  name: string;
  /** USD per 1,000 tokens. */
  price: { input: number; output: number };
  generate(prompt: string, maxOutputTokens: number, signal: AbortSignal): Promise<ProviderResult>;
}

export type Outcome =
  | { status: "ok"; text: string; provider: string; cached: boolean; costUsd: number; latencyMs: number }
  | { status: "blocked"; reason: string }
  | { status: "over_budget"; spentUsd: number; limitUsd: number }
  | { status: "unavailable"; errors: string[] };
