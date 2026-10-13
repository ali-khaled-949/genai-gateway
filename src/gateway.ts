import { Budget } from "./budget.js";
import { Cache } from "./cache.js";
import { checkInput, checkOutput } from "./safety.js";
import type { GenerateRequest, Outcome, Provider, ProviderResult } from "./types.js";

export interface GatewayOptions {
  /** Tried in order: put the preferred provider first and a fallback after it. */
  providers: Provider[];
  budget: Budget;
  timeoutMs?: number;
  defaultMaxOutputTokens?: number;
  cache?: Cache<{ text: string; provider: string }>;
}

export interface Metrics {
  requests: number;
  ok: number;
  blocked: number;
  overBudget: number;
  unavailable: number;
  cacheHits: number;
  fallbacks: number;
  timeouts: number;
  totalCostUsd: number;
  latenciesMs: number[];
}

/** Rough token estimate (about 4 characters per token) used only to reserve budget before a call. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export const costUsd = (p: Provider, inputTokens: number, outputTokens: number): number =>
  (inputTokens * p.price.input + outputTokens * p.price.output) / 1000;

export class Gateway {
  readonly metrics: Metrics = {
    requests: 0, ok: 0, blocked: 0, overBudget: 0, unavailable: 0,
    cacheHits: 0, fallbacks: 0, timeouts: 0, totalCostUsd: 0, latenciesMs: [],
  };
  private timeoutMs: number;
  private defaultMax: number;
  private cache: Cache<{ text: string; provider: string }>;

  constructor(private opts: GatewayOptions) {
    if (opts.providers.length === 0) throw new Error("at least one provider is required");
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.defaultMax = opts.defaultMaxOutputTokens ?? 400;
    this.cache = opts.cache ?? new Cache();
  }

  async generate(req: GenerateRequest): Promise<Outcome> {
    const started = Date.now();
    this.metrics.requests++;
    const maxOut = req.maxOutputTokens ?? this.defaultMax;

    const inputProblem = checkInput(req.prompt);
    if (inputProblem) {
      this.metrics.blocked++;
      return { status: "blocked", reason: inputProblem };
    }

    const key = Cache.key(req.prompt, maxOut);
    const cached = this.cache.get(key);
    if (cached) {
      this.metrics.cacheHits++;
      this.metrics.ok++;
      return { status: "ok", ...cached, cached: true, costUsd: 0, latencyMs: Date.now() - started };
    }

    const errors: string[] = [];
    for (const [index, provider] of this.opts.providers.entries()) {
      const reserve = costUsd(provider, estimateTokens(req.prompt), maxOut);
      if (!this.opts.budget.reserve(req.userId, reserve)) {
        this.metrics.overBudget++;
        return {
          status: "over_budget",
          spentUsd: this.opts.budget.spentBy(req.userId),
          limitUsd: this.opts.budget.dailyLimitUsd,
        };
      }
      let result: ProviderResult;
      try {
        result = await this.callWithTimeout(provider, req.prompt, maxOut);
      } catch (e) {
        this.opts.budget.settle(req.userId, reserve, 0);
        errors.push(`${provider.name}: ${(e as Error).message}`);
        continue;
      }
      const actual = costUsd(provider, result.inputTokens, result.outputTokens);
      this.opts.budget.settle(req.userId, reserve, actual);  // the call was paid for even if we block it
      this.metrics.totalCostUsd += actual;

      const outputProblem = checkOutput(result.text);
      if (outputProblem) {
        this.metrics.blocked++;
        return { status: "blocked", reason: outputProblem };
      }
      if (index > 0) this.metrics.fallbacks++;
      this.cache.set(key, { text: result.text, provider: provider.name });
      const latencyMs = Date.now() - started;
      this.metrics.ok++;
      this.metrics.latenciesMs.push(latencyMs);
      return { status: "ok", text: result.text, provider: provider.name, cached: false, costUsd: actual, latencyMs };
    }
    this.metrics.unavailable++;
    return { status: "unavailable", errors };
  }

  private async callWithTimeout(provider: Provider, prompt: string, maxOut: number): Promise<ProviderResult> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        this.metrics.timeouts++;
        controller.abort();
        reject(new Error(`timed out after ${this.timeoutMs} ms`));
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([provider.generate(prompt, maxOut, controller.signal), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  summary() {
    const sorted = [...this.metrics.latenciesMs].sort((a, b) => a - b);
    const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
    const { latenciesMs: _omit, ...counts } = this.metrics;
    return { ...counts, totalCostUsd: Number(this.metrics.totalCostUsd.toFixed(6)), p50Ms: pick(0.5), p95Ms: pick(0.95) };
  }
}
