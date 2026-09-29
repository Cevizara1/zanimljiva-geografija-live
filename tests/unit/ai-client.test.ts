import { describe, expect, it } from "vitest";
import { CATEGORIES, emptyAnswers } from "@contracts/game.schemas";
import { checkRound, fetchAiStatus, requestHint } from "@client/api/ai-client";

const request = { letter: "S" as const, answers: emptyAnswers() };
const respondWith = (body: unknown, status = 200) =>
  (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })) as unknown as typeof fetch;

const lines = CATEGORIES.map((category) => ({
  category,
  written: "",
  status: "empty",
  recognizedName: null,
  reason: null,
  example: "Sava",
  noKnownTerm: false,
  points: 0,
}));

describe("the browser's AI client never throws and always yields a usable outcome (C02)", () => {
  it("turns a verified response into a verified round result", async () => {
    const outcome = await checkRound(request, undefined, respondWith({ ok: true, verified: true, points: 0, lines }));
    expect(outcome).toMatchObject({ ok: true, result: { verified: true, points: 0 } });
  });

  it.each([
    ["the network fails", (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch],
    ["the body is not JSON", respondWith("<html>502</html>", 502)],
    ["the body has an unexpected shape", respondWith({ ok: true, lines: "?" })],
    ["the server says unavailable", respondWith({ ok: false, code: "AI_UNAVAILABLE", retryable: true, message: "x" }, 503)],
  ])("falls back when %s", async (_label, fetchImpl) => {
    expect(await checkRound(request, undefined, fetchImpl)).toEqual({ ok: false, reason: "temporary", retryable: true });
  });

  it("distinguishes 'not configured' so the player is told the right thing", async () => {
    const outcome = await checkRound(request, undefined, respondWith({ ok: false, code: "AI_NOT_CONFIGURED", retryable: false, message: "x" }, 503));
    expect(outcome).toEqual({ ok: false, reason: "not_configured", retryable: false });
  });

  it("maps hint responses and failures", async () => {
    const clue = "Ljudi iz ove zemlje prvi su sleteli na Mesec.";
    expect(await requestHint({ letter: "A", category: "country" }, undefined, respondWith({ ok: true, kind: "clue", category: "country", clue }))).toEqual({ ok: true, kind: "clue", clue });
    expect(await requestHint({ letter: "A", category: "sea" }, undefined, respondWith({ ok: true, kind: "no_known_term", category: "sea" }))).toEqual({ ok: true, kind: "no_known_term" });
    expect(await requestHint({ letter: "A", category: "sea" }, undefined, respondWith("oops", 500))).toEqual({ ok: false, quotaExhausted: false });
    expect(
      await requestHint({ letter: "A", category: "sea" }, undefined, respondWith({ ok: false, code: "AI_QUOTA_EXHAUSTED", retryable: false, message: "x" }, 503)),
    ).toEqual({ ok: false, quotaExhausted: true });
  });

  it("reports AI status, or unknown when health cannot be read", async () => {
    expect(await fetchAiStatus(respondWith({ status: "ok", ai: "configured" }))).toBe("configured");
    expect(await fetchAiStatus(respondWith("nope", 500))).toBe("unknown");
  });
});
