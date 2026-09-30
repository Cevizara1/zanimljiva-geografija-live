import { describe, expect, it } from "vitest";
import type { HintRequest } from "@contracts/api.schemas";
import { gateHintToolCall } from "@server/features/hint";
import { executeShowHint, HINT_TOOLS, showHintTool, type HintTool } from "@server/tools/show-hint";

/*
 * docs/TOOL_CONTRACT.md test matrix: every refusal happens before the tool
 * runs, so the executor's call count stays 0.
 */

const REQUEST: HintRequest = { letter: "D", category: "river" };
const GOOD = {
  letter: "D",
  category: "river",
  term: "Dunav",
  termEn: "Danube",
  clue: "Druga najduža reka Evrope; protiče kroz Beograd. Drugo slovo: U.",
  noKnownTerm: false,
};

function countingRegistry() {
  let callCount = 0;
  const tool: HintTool = {
    ...showHintTool,
    execute: (args) => {
      callCount++;
      return showHintTool.execute(args);
    },
  };
  return { registry: new Map([[tool.name, tool]]), calls: () => callCount };
}

describe("show_hint gate — refused before execution (callCount = 0)", () => {
  it.each([
    ["no tool call", [], "tool:missing_call"],
    ["two tool calls", [{ name: "show_hint", args: GOOD }, { name: "show_hint", args: GOOD }], "tool:too_many_calls"],
    ["an unsupported tool", [{ name: "get_game_state", args: { detail: "everything" } }], "tool:unknown"],
    ["an empty tool name", [{ name: "", args: GOOD }], "tool:unknown"],
    ["the PDF example: extra keys", [{ name: "show_hint", args: { ...GOOD, detail: "everything", executeCode: "..." } }], "tool:invalid_args"],
    ["a missing argument", [{ name: "show_hint", args: { ...GOOD, clue: undefined } }], "tool:invalid_args"],
    ["a wrong type", [{ name: "show_hint", args: { ...GOOD, noKnownTerm: "no" } }], "tool:invalid_args"],
    ["arguments that are not an object", [{ name: "show_hint", args: "Dunav" }], "tool:invalid_args"],
    ["an unknown category", [{ name: "show_hint", args: { ...GOOD, category: "lake" } }], "tool:invalid_args"],
    ["another letter than the request", [{ name: "show_hint", args: { ...GOOD, letter: "S" } }], "tool:out_of_scope"],
    ["another category than the request", [{ name: "show_hint", args: { ...GOOD, category: "city" } }], "tool:out_of_scope"],
  ] as const)("%s → %s", (_label, calls, code) => {
    const { registry, calls: executed } = countingRegistry();
    expect(gateHintToolCall(calls, REQUEST, registry)).toMatchObject({ ok: false, code });
    expect(executed()).toBe(0);
  });

  it("a write tool in the registry is never executed", () => {
    let executed = 0;
    const writer = { ...showHintTool, mode: "write", execute: () => { executed++; return showHintTool.execute(GOOD as never); } } as unknown as HintTool;
    const result = gateHintToolCall([{ name: "show_hint", args: GOOD }], REQUEST, new Map([["show_hint", writer]]));
    expect(result).toMatchObject({ ok: false, code: "tool:out_of_scope" });
    expect(executed).toBe(0);
  });
});

describe("show_hint gate — a valid call runs the read-only tool once", () => {
  it("returns the clue", () => {
    const { registry, calls } = countingRegistry();
    expect(gateHintToolCall([{ name: "show_hint", args: GOOD }], REQUEST, registry)).toEqual({
      ok: true,
      value: { ok: true, kind: "clue", category: "river", clue: GOOD.clue },
    });
    expect(calls()).toBe(1);
  });

  it("the default registry is the allowlist: exactly show_hint", () => {
    expect([...HINT_TOOLS.keys()]).toEqual(["show_hint"]);
    expect(showHintTool.mode).toBe("read-only");
  });
});

describe("show_hint execution — the final output is validated (GAME_SPEC §7)", () => {
  it.each([
    ["the clue names the term", { ...GOOD, clue: "Reka Dunav teče kroz Beograd." }],
    ["the term is on another letter", { ...GOOD, term: "Sava", termEn: "Sava", clue: "Reka koja se kod Beograda uliva u drugu." }],
    ["the clue is too short", { ...GOOD, clue: "Reka." }],
    ["no term", { ...GOOD, term: "" }],
  ])("%s → invalid_output:semantic", (_label, args) => {
    expect(executeShowHint(args as typeof GOOD & { letter: "D"; category: "river" })).toMatchObject({
      ok: false,
      code: "invalid_output:semantic",
    });
  });

  it("no known term is a valid answer", () => {
    expect(executeShowHint({ ...GOOD, letter: "D", category: "river", term: "", termEn: "", clue: "", noKnownTerm: true })).toEqual({
      ok: true,
      value: { ok: true, kind: "no_known_term", category: "river" },
    });
  });
});
