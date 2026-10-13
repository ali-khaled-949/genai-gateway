import { createHash } from "node:crypto";

/** Small in-memory cache with expiry and a size cap (oldest entry dropped first). */
export class Cache<V> {
  private items = new Map<string, { value: V; expires: number }>();

  constructor(
    private maxItems = 500,
    private ttlMs = 10 * 60_000,
    private now: () => number = Date.now,
  ) {}

  static key(prompt: string, maxOutputTokens: number): string {
    return createHash("sha256").update(`${maxOutputTokens}\n${prompt.trim().toLowerCase()}`).digest("hex");
  }

  get(key: string): V | undefined {
    const hit = this.items.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) {
      this.items.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    this.items.delete(key);
    if (this.items.size >= this.maxItems) {
      const oldest = this.items.keys().next().value;
      if (oldest !== undefined) this.items.delete(oldest);
    }
    this.items.set(key, { value, expires: this.now() + this.ttlMs });
  }
}
