import type { Provider, ProviderResult } from "./types.js";

export interface FakeBehavior {
  delayMs?: number;
  fail?: string;
  reply?: (prompt: string) => string;
}

/** Stand-in provider for the demo and tests: no network, no API key, switchable delay and failure. */
export class FakeProvider implements Provider {
  calls = 0;
  aborted = 0;

  constructor(
    readonly name: string,
    readonly price: { input: number; output: number },
    public behavior: FakeBehavior = {},
  ) {}

  generate(prompt: string, maxOutputTokens: number, signal: AbortSignal): Promise<ProviderResult> {
    this.calls++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.behavior.fail) return reject(new Error(this.behavior.fail));
        const text = (this.behavior.reply ?? ((p) => `Idea for: ${p}`))(prompt);
        resolve({
          text,
          inputTokens: Math.ceil(prompt.length / 4),
          outputTokens: Math.min(maxOutputTokens, Math.ceil(text.length / 4)),
        });
      }, this.behavior.delayMs ?? 0);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        this.aborted++;
        reject(new Error("aborted"));
      });
    });
  }
}
