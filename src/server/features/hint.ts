import type { HintRequest, HintSuccess } from "../../contracts/api.schemas.js";
import { generate, type GatewayDeps } from "../ai/gateway.js";
import { BUDGETS } from "../ai/retry-policy.js";
import type { AiResult, ToolProposal, Validation } from "../ai/types.js";
import { buildHintContent, HINT_PROMPT_VERSION, HINT_SYSTEM_INSTRUCTION } from "../prompts/hint.v2.js";
import { declarationOf, HINT_TOOLS, showHintTool, type HintTool } from "../tools/show-hint.js";

/**
 * The server-side gate for the model's tool call (docs/TOOL_CONTRACT.md,
 * W04 addendum §6.3). In order, and before the tool runs:
 * exactly one call → allowlisted name → strict arguments → the request's own
 * letter and category → read-only. Any refusal is final: no retry, no fallback.
 */
export function gateHintToolCall(
  toolCalls: readonly ToolProposal[],
  request: HintRequest,
  registry: ReadonlyMap<string, HintTool> = HINT_TOOLS,
): Validation<HintSuccess> {
  if (toolCalls.length === 0) return { ok: false, code: "tool:missing_call" };
  if (toolCalls.length > 1) return { ok: false, code: "tool:too_many_calls", notes: { toolCalls: toolCalls.length } };

  const [proposal] = toolCalls as [ToolProposal];
  const tool = registry.get(proposal.name);
  if (!tool) return { ok: false, code: "tool:unknown" };

  const args = tool.argsSchema.safeParse(proposal.args);
  if (!args.success) return { ok: false, code: "tool:invalid_args" };

  if (args.data.letter !== request.letter || args.data.category !== request.category) {
    return { ok: false, code: "tool:out_of_scope" };
  }
  if (tool.mode !== "read-only") return { ok: false, code: "tool:out_of_scope" };

  return tool.execute(args.data);
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
      tool: declarationOf(showHintTool),
      temperature: 0.2,
      maxOutputTokens: 300,
      budget: BUDGETS.hint,
      // Text next to the call is ignored: only the gated tool call can become a hint.
      validate: (_text, toolCalls) => gateHintToolCall(toolCalls, request),
    },
    deps,
    signal,
  );
}
