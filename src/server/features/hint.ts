import { hintOutputSchema, HINT_JSON_SCHEMA } from "../../contracts/ai-output.schemas";
import { MAX_CLUE_LENGTH, MIN_CLUE_LENGTH, type HintRequest, type HintSuccess } from "../../contracts/api.schemas";
import type { Category, Letter } from "../../contracts/game.schemas";
import { leaksTerm } from "../../domain/hint-leak";
import { matchesRecognised } from "../../domain/letter-match";
import { generate, type GatewayDeps } from "../ai/gateway";
import { BUDGETS } from "../ai/retry-policy";
import type { AiResult, Validation } from "../ai/types";
import { buildHintContent, HINT_PROMPT_VERSION, HINT_SYSTEM_INSTRUCTION } from "../prompts/hint.v1";

/**
 * GAME_SPEC §7. The described term is used only to validate the clue; it never
 * leaves the server.
 */
export function validateHint(text: string, letter: Letter, category: Category): Validation<HintSuccess> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: "invalid_output:json" };
  }

  const parsed = hintOutputSchema.safeParse(json);
  if (!parsed.success) return { ok: false, code: "invalid_output:schema" };
  const output = parsed.data;

  if (output.noKnownTerm) return { ok: true, value: { ok: true, kind: "no_known_term", category } };

  const term = output.term.trim();
  const clue = output.clue.trim();
  const names = [term, output.termEn.trim()].filter(Boolean);

  const valid =
    term !== "" &&
    matchesRecognised(term, letter) &&
    clue.length >= MIN_CLUE_LENGTH &&
    clue.length <= MAX_CLUE_LENGTH &&
    !leaksTerm(clue, names);

  return valid
    ? { ok: true, value: { ok: true, kind: "clue", category, clue } }
    : { ok: false, code: "invalid_output:semantic", notes: { leak: leaksTerm(clue, names) ? 1 : 0 } };
}

export async function runHint(
  request: HintRequest,
  deps: GatewayDeps & { interactionId: string },
  signal?: AbortSignal,
): Promise<AiResult<HintSuccess>> {
  return generate(
    {
      operation: "hint",
      promptVersion: HINT_PROMPT_VERSION,
      interactionId: deps.interactionId,
      systemInstruction: HINT_SYSTEM_INSTRUCTION,
      userContent: buildHintContent(request.letter, request.category),
      responseJsonSchema: HINT_JSON_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 300,
      budget: BUDGETS.hint,
      validate: (text) => validateHint(text, request.letter, request.category),
    },
    deps,
    signal,
  );
}
