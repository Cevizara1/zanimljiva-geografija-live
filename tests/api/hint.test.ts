import { describe, expect, it } from "vitest";
import { hintSuccessSchema } from "@contracts/api.schemas";
import { createModelHealth } from "@server/ai/model-health";
import { memoryTelemetry } from "@server/ai/telemetry";
import { createHintHandler, type EndpointDeps } from "@server/handlers/ai-endpoints";
import { TEST_KEY, allowAll, fakeGemini, geminiJson, geminiStatus, geminiToolCalls, userContent } from "../fakes/fake-gemini";

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

const args = (term: string, termEn: string, clue: string, scope = { letter: "D", category: "river" }) => ({
  ...scope,
  term,
  termEn,
  clue,
  noKnownTerm: false,
});
const hint = (term: string, termEn: string, clue: string) => geminiToolCalls({ name: "show_hint", args: args(term, termEn, clue) });
const GOOD_CLUE = "Druga najduža reka Evrope; protiče kroz Beograd. Drugo slovo: U.";
const UNAVAILABLE = { ok: false, code: "AI_UNAVAILABLE", retryable: false, message: "Hint trenutno nije dostupan. Kredit nije potrošen." };

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

  it("declares exactly one forced tool and asks for no JSON reply", async () => {
    const { gemini, handle } = handler(() => hint("Dunav", "Danube", GOOD_CLUE));
    await handle.fetch(post({ letter: "D", category: "river" }));
    const body = gemini.calls[0]!.body;
    expect(body.tools?.[0]?.functionDeclarations.map((declaration) => declaration.name)).toEqual(["show_hint"]);
    expect(body.toolConfig).toEqual({ functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["show_hint"] } });
    expect(body.generationConfig).not.toHaveProperty("responseMimeType");
    expect(body.generationConfig).not.toHaveProperty("responseJsonSchema");
  });

  it.each([
    ["no tool call (plain text)", geminiJson({ term: "Dunav", termEn: "Danube", clue: GOOD_CLUE, noKnownTerm: false }), "tool:missing_call"],
    ["an unknown tool", geminiToolCalls({ name: "run_code", args: args("Dunav", "Danube", GOOD_CLUE) }), "tool:unknown"],
    ["extra arguments", geminiToolCalls({ name: "show_hint", args: { ...args("Dunav", "Danube", GOOD_CLUE), detail: "everything", executeCode: "rm -rf /" } }), "tool:invalid_args"],
    ["another letter", geminiToolCalls({ name: "show_hint", args: args("Sava", "Sava", "Reka koja se kod Beograda uliva u drugu reku.", { letter: "S", category: "river" }) }), "tool:out_of_scope"],
    ["two calls", geminiToolCalls({ name: "show_hint", args: args("Dunav", "Danube", GOOD_CLUE) }, { name: "show_hint", args: args("Drina", "Drina", "Reka na granici Srbije i Bosne.") }), "tool:too_many_calls"],
  ])("T-tool refuses %s: safe failure after one call, no retry, no fallback", async (_label, reply, outcome) => {
    const { gemini, handle, telemetry } = handler(() => reply);
    const response = await handle.fetch(post({ letter: "D", category: "river" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(UNAVAILABLE);
    expect(gemini.calls).toHaveLength(1);
    expect(telemetry.records[0]).toMatchObject({ outcome, fallbackUsed: false });
    expect(JSON.stringify(telemetry.records)).not.toContain("Dunav"); // tool arguments are never logged
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
    expect(await response.json()).toEqual(UNAVAILABLE);
  });

  it("H03 reports that no known term exists", async () => {
    const { handle } = handler(() =>
      geminiToolCalls({ name: "show_hint", args: { letter: "Ć", category: "sea", term: "", termEn: "", clue: "", noKnownTerm: true } }),
    );
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
    expect(telemetry.records[0]).toMatchObject({ operation: "hint", promptVersion: "hint.v2", fallbackUsed: true });
  });

  it("is refused without a key and over the rate limit, with 0 calls", async () => {
    const unconfigured = handler(() => hint("Dunav", "Danube", "x"), { env: {} });
    expect((await unconfigured.handle.fetch(post({ letter: "D", category: "river" }))).status).toBe(503);
    const limited = handler(() => hint("Dunav", "Danube", "x"), { limiter: { take: () => false } });
    expect((await limited.handle.fetch(post({ letter: "D", category: "river" }))).status).toBe(429);
    expect(unconfigured.gemini.calls.length + limited.gemini.calls.length).toBe(0);
  });
});
