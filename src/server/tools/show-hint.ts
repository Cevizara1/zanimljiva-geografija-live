import { SHOW_HINT_PARAMETERS_SCHEMA, showHintArgsSchema, type ShowHintArgs } from "../../contracts/ai-output.schemas.js";
import { MAX_CLUE_LENGTH, MIN_CLUE_LENGTH, type HintSuccess } from "../../contracts/api.schemas.js";
import { leaksTerm } from "../../domain/hint-leak.js";
import { matchesRecognised } from "../../domain/letter-match.js";
import type { ToolDeclaration, Validation } from "../ai/types.js";

/*
 * The one tool the hint model may call (docs/TOOL_CONTRACT.md). The model's
 * call is a proposal; `gateHintToolCall` in features/hint.ts checks the name,
 * the arguments and the scope, and only then runs `execute`.
 *
 * Read-only: `execute` is a pure function of its arguments. It reads nothing
 * outside them and writes nothing — no credits, no game state, no storage.
 */

export type HintTool = {
  name: string;
  description: string;
  mode: "read-only";
  argsSchema: typeof showHintArgsSchema;
  parametersJsonSchema: object;
  execute(args: ShowHintArgs): Validation<HintSuccess>;
};

export const SHOW_HINT_TOOL_NAME = "show_hint";

/**
 * GAME_SPEC §7. The described term is used only to check the clue; it never
 * leaves the server.
 */
export function executeShowHint(args: ShowHintArgs): Validation<HintSuccess> {
  if (args.noKnownTerm) return { ok: true, value: { ok: true, kind: "no_known_term", category: args.category } };

  const term = args.term.trim();
  const clue = args.clue.trim();
  const names = [term, args.termEn.trim()].filter(Boolean);
  const leak = leaksTerm(clue, names);

  const valid =
    term !== "" &&
    matchesRecognised(term, args.letter) &&
    clue.length >= MIN_CLUE_LENGTH &&
    clue.length <= MAX_CLUE_LENGTH &&
    !leak;

  return valid
    ? { ok: true, value: { ok: true, kind: "clue", category: args.category, clue } }
    : { ok: false, code: "invalid_output:semantic", notes: { leak: leak ? 1 : 0 } };
}

export const showHintTool: HintTool = {
  name: SHOW_HINT_TOOL_NAME,
  description:
    "Shows the player a clue for the best-known real term of the given category that starts with the round letter. " +
    "Call it exactly once. The clue must describe the term without naming it.",
  mode: "read-only",
  argsSchema: showHintArgsSchema,
  parametersJsonSchema: SHOW_HINT_PARAMETERS_SCHEMA,
  execute: executeShowHint,
};

/** The allowlist: a proposed name that is not a key here is refused. */
export const HINT_TOOLS: ReadonlyMap<string, HintTool> = new Map([[showHintTool.name, showHintTool]]);

export const declarationOf = (tool: HintTool): ToolDeclaration => ({
  name: tool.name,
  description: tool.description,
  parametersJsonSchema: tool.parametersJsonSchema,
});
