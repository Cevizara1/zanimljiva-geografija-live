import { describe, expect, it } from "vitest";
import { createEndpointLimiter, createRateLimiter } from "@server/http/rate-limit";
import { clientKey } from "@server/http/json-handler";

describe("rate limiter (FR-021)", () => {
  it("allows the limit per window, then refuses until the window passes", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, clock: { now: () => now } });
    expect([limiter.take("a"), limiter.take("a"), limiter.take("a")]).toEqual([true, true, false]);
    expect(limiter.take("b")).toBe(true);
    now = 60_000;
    expect(limiter.take("a")).toBe(true);
  });

  it("also caps the whole instance", () => {
    const limiter = createEndpointLimiter({ perClient: 5, perInstance: 3, windowMs: 60_000, clock: { now: () => 0 } });
    expect(["a", "b", "c", "d"].map((key) => limiter.take(key))).toEqual([true, true, true, false]);
  });
});

describe("clientKey", () => {
  it("prefers Vercel's header, then the first forwarded address", () => {
    const request = (headers: Record<string, string>) => new Request("http://x/api", { headers });
    expect(clientKey(request({ "x-vercel-forwarded-for": "198.51.100.1", "x-forwarded-for": "10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientKey(request({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientKey(request({}))).toBe("unknown");
  });
});
