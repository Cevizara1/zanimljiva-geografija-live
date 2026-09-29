import { describe, expect, it } from "vitest";
import { createDebugSink, formatDebugEntry, isDebugLogEnabled } from "@server/ai/debug-log";
import { createModelHealth } from "@server/ai/model-health";
import { createCheckRoundHandler } from "@server/handlers/ai-endpoints";
import { emptyAnswers } from "@contracts/game.schemas";
import { TEST_KEY, allowAll, fakeGemini, geminiStatus, geminiText } from "../fakes/fake-gemini";

describe("AI_DEBUG_LOG — local raw logging (constitution 1.1.0 exception)", () => {
  it("is on only when asked for, and never on Vercel or in production", () => {
    expect(isDebugLogEnabled({})).toBe(false);
    expect(isDebugLogEnabled({ AI_DEBUG_LOG: "true" })).toBe(false);
    expect(isDebugLogEnabled({ AI_DEBUG_LOG: "1" })).toBe(true);
    expect(isDebugLogEnabled({ AI_DEBUG_LOG: "1", VERCEL: "1" })).toBe(false);
    expect(isDebugLogEnabled({ AI_DEBUG_LOG: "1", NODE_ENV: "production" })).toBe(false);
    expect(createDebugSink({})).toBeUndefined();
  });

  it("formats what was sent and the model's reply, pretty-printing JSON", () => {
    const text = formatDebugEntry({
      operation: "check-round",
      promptVersion: "check-round.v2",
      n: 1,
      model: "gemini-3.5-flash-lite",
      kind: "initial",
      latencyMs: 812,
      sent: '{"letter":"N"}',
      reply: '{"items":[]}',
      result: "ok",
    });
    expect(text).toContain("[ai.debug] check-round (check-round.v2) attempt 1 initial gemini-3.5-flash-lite → ok in 812 ms");
    expect(text).toContain('sent:  {"letter":"N"}');
    expect(text).toContain('"items": []');
  });

  const post = () =>
    new Request("http://localhost/api/check-round", {
      method: "POST",
      body: JSON.stringify({ letter: "S", answers: { ...emptyAnswers(), country: "Srbija" } }),
    });

  it("prints every attempt of a real handler call — and never the key or the system prompt", async () => {
    const lines: string[] = [];
    const original = console.info;
    console.info = (line: string) => void lines.push(line);
    try {
      const gemini = fakeGemini((_call, index) => (index === 0 ? geminiStatus(503) : geminiText('{"items":"bad"}')));
      const handle = createCheckRoundHandler({
        env: { GEMINI_API_KEY: TEST_KEY, AI_DEBUG_LOG: "1" },
        limiter: allowAll,
        fetchImpl: gemini.impl,
        telemetry: () => {},
        sleep: async () => {},
        random: () => 0,
        health: createModelHealth(),
      });
      await handle.fetch(post());
    } finally {
      console.info = original;
    }

    const debug = lines.filter((line) => line.startsWith("[ai.debug]"));
    expect(debug).toHaveLength(2);
    expect(debug[0]).toContain("provider_transient (HTTP 503)");
    expect(debug[0]).toContain("reply: (none)");
    expect(debug[1]).toContain("invalid_output:schema");
    expect(debug[1]).toContain('"items": "bad"');
    expect(debug[1]).toContain("Srbija"); // the player's own answer, locally only
    const all = lines.join("\n");
    expect(all).not.toContain(TEST_KEY);
    expect(all).not.toContain("You are the referee");
  });

  it("prints nothing when the flag is off", async () => {
    const lines: string[] = [];
    const original = console.info;
    console.info = (line: string) => void lines.push(line);
    try {
      const gemini = fakeGemini(() => geminiText("{}"));
      await createCheckRoundHandler({ env: { GEMINI_API_KEY: TEST_KEY }, limiter: allowAll, fetchImpl: gemini.impl, telemetry: () => {}, health: createModelHealth() }).fetch(post());
    } finally {
      console.info = original;
    }
    expect(lines.some((line) => line.startsWith("[ai.debug]"))).toBe(false);
  });
});
