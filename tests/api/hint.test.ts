import { describe, expect, it } from "vitest";
import { hintSuccessSchema } from "@contracts/api.schemas";
import { createModelHealth } from "@server/ai/model-health";
import { memoryTelemetry } from "@server/ai/telemetry";
import { createHintHandler, type EndpointDeps } from "@server/handlers/ai-endpoints";
import { TEST_KEY, allowAll, fakeGemini, geminiJson, geminiStatus, userContent } from "../fakes/fake-gemini";

function handler(respond: Parameters<typeof fakeGemini>[0], overrides: Partial<EndpointDeps> = {}) {
  const gemini = fakeGemini(respond);
  const telemetry = memoryTelemetry();
  const handle = createHintHandler({
    env: { GEMINI_API_KEY: TEST_KEY },
    limiter: allowAll,
    fetchImpl: gemini.impl,
    telemetry,
    sleep: async () => {},
    random: () => 0,
    health: createModelHealth(),
    ...overrides,
  });
  return { gemini, telemetry, handle };
}

const post = (body: unknown) =>
  new Request("http://localhost/api/hint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const hint = (term: string, termEn: string, clue: string) => geminiJson({ term, termEn, clue, noKnownTerm: false });

describe("POST /api/hint", () => {
  it("H01 returns the clue, never the term, after one call", async () => {
    const { gemini, handle } = handler(() => hint("Dunav", "Danube", "Druga najduža reka Evrope; protiče kroz Beograd. Drugo slovo: U."));
    const response = await handle.fetch(post({ letter: "D", category: "river" }));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(hintSuccessSchema.parse(JSON.parse(text))).toEqual({
      ok: true,
      kind: "clue",
      category: "river",
      clue: "Druga najduža reka Evrope; protiče kroz Beograd. Drugo slovo: U.",
    });
    expect(text).not.toContain("Dunav");
    expect(text).not.toContain("Danube");
    expect(gemini.calls).toHaveLength(1);
    expect(userContent(gemini.calls[0]!)).toEqual({ letter: "D", category: "river", label: "Reka" });
  });

  it.each([
    ["the term itself", hint("Dunav", "Danube", "Reka Dunav teče kroz Beograd.")],
    ["the term in Cyrillic", hint("Dunav", "Danube", "Река Дунав тече кроз Београд.")],
    ["the English name", hint("Dunav", "Danube", "Na engleskom se zove Danube.")],
    ["a four-letter run", hint("Dunav", "Danube", "Počinje sa Duna i teče kroz Beograd.")],
    ["a term on the wrong letter", hint("Sava", "Sava", "Reka koja se kod Beograda uliva u drugu reku.")],
    ["a clue that is too short", hint("Dunav", "Danube", "Reka.")],
  ])("H02/H04 discards a hint with %s — safe failure, no credit", async (_label, reply) => {
    const { handle } = handler(() => reply);
    const response = await handle.fetch(post({ letter: "D", category: "river" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      code: "AI_UNAVAILABLE",
      retryable: false,
      message: "Hint trenutno nije dostupan. Kredit nije potrošen.",
    });
  });

  it("H03 reports that no known term exists", async () => {
    const { handle } = handler(() => geminiJson({ term: "", termEn: "", clue: "", noKnownTerm: true }));
    const response = await handle.fetch(post({ letter: "Ć", category: "sea" }));
    expect(await response.json()).toEqual({ ok: true, kind: "no_known_term", category: "sea" });
  });

  it("refuses a malformed request with 0 calls", async () => {
    const { gemini, handle } = handler(() => hint("Dunav", "Danube", "x"));
    for (const body of [{ letter: "D" }, { letter: "D", category: "lake" }, { letter: "Q", category: "river" }, { letter: "D", category: "river", credits: 9 }]) {
      expect((await handle.fetch(post(body))).status).toBe(400);
    }
    expect(gemini.calls).toHaveLength(0);
  });

  it("uses the hint budget: a transient failure is retried, then falls back", async () => {
    const { gemini, handle, telemetry } = handler((_call, index) =>
      index < 2 ? geminiStatus(503) : hint("Dunav", "Danube", "Druga najduža reka Evrope, teče kroz Beograd."),
    );
    const response = await handle.fetch(post({ letter: "D", category: "river" }));
    expect(response.status).toBe(200);
    expect(gemini.calls).toHaveLength(3);
    expect(telemetry.records[0]).toMatchObject({ operation: "hint", promptVersion: "hint.v1", fallbackUsed: true });
  });

  it("is refused without a key and over the rate limit, with 0 calls", async () => {
    const unconfigured = handler(() => hint("Dunav", "Danube", "x"), { env: {} });
    expect((await unconfigured.handle.fetch(post({ letter: "D", category: "river" }))).status).toBe(503);
    const limited = handler(() => hint("Dunav", "Danube", "x"), { limiter: { take: () => false } });
    expect((await limited.handle.fetch(post({ letter: "D", category: "river" }))).status).toBe(429);
    expect(unconfigured.gemini.calls.length + limited.gemini.calls.length).toBe(0);
  });
});
