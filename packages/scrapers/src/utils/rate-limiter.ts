// ─────────────────────────────────────────────────────────────
// HSM Scrapers — Rate Limiter
// Per-domain request throttling to avoid bans
// ─────────────────────────────────────────────────────────────

interface RateLimiterOptions {
  requestsPerMinute: number;
  minDelayMs:        number;
  maxDelayMs:        number;
}

export class RateLimiter {
  private queue:       Array<() => void> = [];
  private timestamps:  number[] = [];
  private readonly rpm:    number;
  private readonly minMs:  number;
  private readonly maxMs:  number;

  constructor(opts: RateLimiterOptions) {
    this.rpm   = opts.requestsPerMinute;
    this.minMs = opts.minDelayMs;
    this.maxMs = opts.maxDelayMs;
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    // Remove timestamps older than 60s
    this.timestamps = this.timestamps.filter(t => now - t < 60000);

    if (this.timestamps.length >= this.rpm) {
      // Wait until oldest timestamp is > 60s ago
      const waitMs = 60000 - (now - this.timestamps[0]);
      if (waitMs > 0) {
        console.log(`[RateLimiter] Throttling ${waitMs}ms (${this.timestamps.length}/${this.rpm} rpm)`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }

    // Random human-like delay between requests
    const jitter = Math.floor(Math.random() * (this.maxMs - this.minMs)) + this.minMs;
    await new Promise(r => setTimeout(r, jitter));

    this.timestamps.push(Date.now());
  }
}

// Pre-configured limiters per source
export const limiters = {
  indiamart:       new RateLimiter({ requestsPerMinute: 12, minDelayMs: 3000, maxDelayMs: 7000 }),
  google_maps:     new RateLimiter({ requestsPerMinute: 20, minDelayMs: 2000, maxDelayMs: 5000 }),
  justdial:        new RateLimiter({ requestsPerMinute: 10, minDelayMs: 4000, maxDelayMs: 8000 }),
  linkedin:        new RateLimiter({ requestsPerMinute: 8,  minDelayMs: 5000, maxDelayMs: 10000 }),
  instagram:       new RateLimiter({ requestsPerMinute: 30, minDelayMs: 1000, maxDelayMs: 3000 }),
  facebook_groups: new RateLimiter({ requestsPerMinute: 20, minDelayMs: 2000, maxDelayMs: 5000 }),
};
