/** Per-user daily spend limit. Spend is reserved before a call so parallel requests cannot overshoot. */
export class Budget {
  private spent = new Map<string, number>();

  constructor(
    readonly dailyLimitUsd: number,
    private today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {}

  private key(userId: string): string {
    return `${this.today()}:${userId}`;
  }

  spentBy(userId: string): number {
    return this.spent.get(this.key(userId)) ?? 0;
  }

  /** Hold the worst-case cost. Returns false when it would pass the limit. */
  reserve(userId: string, amountUsd: number): boolean {
    const now = this.spentBy(userId);
    if (now + amountUsd > this.dailyLimitUsd + 1e-12) return false;
    this.spent.set(this.key(userId), now + amountUsd);
    return true;
  }

  /** Replace a reservation with what the call really cost (0 when it failed). */
  settle(userId: string, reservedUsd: number, actualUsd: number): void {
    this.spent.set(this.key(userId), Math.max(0, this.spentBy(userId) - reservedUsd + actualUsd));
  }
}
