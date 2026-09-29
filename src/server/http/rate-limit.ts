/*
 * Fixed-window limits that protect the free Gemini quota (FR-021, research R8).
 * Memory is per serverless instance, so this is best-effort: two instances each
 * count separately. It is a guardrail for the quota, not an enforcement of the
 * game's hint credits.
 */

export type Clock = { now(): number };

export type RateLimiter = { take(key: string): boolean };

const MAX_TRACKED_KEYS = 5_000;

export function createRateLimiter(options: { limit: number; windowMs: number; clock: Clock }): RateLimiter {
  const windows = new Map<string, { startedAt: number; count: number }>();

  return {
    take(key) {
      const now = options.clock.now();
      const current = windows.get(key);
      if (!current || now - current.startedAt >= options.windowMs) {
        if (windows.size >= MAX_TRACKED_KEYS) windows.clear();
        windows.set(key, { startedAt: now, count: 1 });
        return true;
      }
      if (current.count >= options.limit) return false;
      current.count += 1;
      return true;
    },
  };
}

/** A per-client limit and an instance-wide one; a request must pass both. */
export function createEndpointLimiter(options: { perClient: number; perInstance: number; windowMs: number; clock: Clock }) {
  const perClient = createRateLimiter({ limit: options.perClient, windowMs: options.windowMs, clock: options.clock });
  const perInstance = createRateLimiter({ limit: options.perInstance, windowMs: options.windowMs, clock: options.clock });
  return {
    take(key: string): boolean {
      return perClient.take(key) && perInstance.take("*");
    },
  };
}

export const systemClock: Clock = { now: () => Date.now() };
