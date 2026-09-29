import { checkRoundRequestSchema, hintRequestSchema } from "../../contracts/api.schemas";
import { loadAiConfig, type AiEnv } from "../ai/config";
import { createDebugSink, type DebugEnv } from "../ai/debug-log";
import { createGeminiAdapter } from "../ai/gemini-adapter";
import type { GatewayDeps } from "../ai/gateway";
import { consoleTelemetry, type TelemetrySink } from "../ai/telemetry";
import { createModelHealth, type ModelHealth } from "../ai/model-health";
import type { AiResult } from "../ai/types";
import { runCheckRound } from "../features/check-round";
import { runHint } from "../features/hint";
import { clientKey, failureResponse, jsonResponse, MESSAGES, readJsonBody } from "../http/json-handler";
import { createEndpointLimiter, systemClock } from "../http/rate-limit";

/*
 * Request → validate body → rate limit → configured? → feature → safe response.
 * Everything that can be refused is refused before the first AI call.
 */

export type EndpointDeps = {
  env: AiEnv & DebugEnv;
  limiter: { take(key: string): boolean };
  fetchImpl?: typeof fetch;
  telemetry?: TelemetrySink;
  now?: () => number;
  sleep?: GatewayDeps["sleep"];
  random?: () => number;
  newInteractionId?: () => string;
  /** Shared by both endpoints in one instance; tests pass their own. */
  health?: ModelHealth;
};

/** One memory of model health per serverless instance. */
const instanceHealth = createModelHealth();

type Prepared = { ok: true; gateway: GatewayDeps & { interactionId: string } } | { ok: false; response: Response };

function prepare(request: Request, deps: EndpointDeps): Prepared {
  if (!deps.limiter.take(clientKey(request))) return { ok: false, response: failureResponse("RATE_LIMITED", true) };

  const config = loadAiConfig(deps.env);
  if (!config.configured) return { ok: false, response: failureResponse("AI_NOT_CONFIGURED", false) };
  const debug = createDebugSink(deps.env);

  return {
    ok: true,
    gateway: {
      adapter: createGeminiAdapter({ apiKey: config.apiKey, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) }),
      modelChain: config.modelChain,
      thinkingLevel: config.thinkingLevel,
      telemetry: deps.telemetry ?? consoleTelemetry,
      ...(debug ? { debug } : {}),
      health: deps.health ?? instanceHealth,
      ...(deps.now ? { now: deps.now } : {}),
      ...(deps.sleep ? { sleep: deps.sleep } : {}),
      ...(deps.random ? { random: deps.random } : {}),
      interactionId: deps.newInteractionId?.() ?? `ai-${crypto.randomUUID()}`,
    },
  };
}

function respond<T>(result: AiResult<T>, unavailableMessage: string, quotaMessage: string): Response {
  if (result.ok) return jsonResponse(200, result.value);
  if (result.code === "quota_exhausted") return failureResponse("AI_QUOTA_EXHAUSTED", false, quotaMessage);
  return failureResponse("AI_UNAVAILABLE", result.retryable, unavailableMessage);
}

export function createCheckRoundHandler(deps: EndpointDeps) {
  return {
    async fetch(request: Request): Promise<Response> {
      const body = await readJsonBody(request, checkRoundRequestSchema);
      if (!body.ok) return body.response;
      const prepared = prepare(request, deps);
      if (!prepared.ok) return prepared.response;
      return respond(await runCheckRound(body.data, prepared.gateway, request.signal), MESSAGES.AI_UNAVAILABLE, MESSAGES.AI_QUOTA_EXHAUSTED);
    },
  };
}

export function createHintHandler(deps: EndpointDeps) {
  return {
    async fetch(request: Request): Promise<Response> {
      const body = await readJsonBody(request, hintRequestSchema);
      if (!body.ok) return body.response;
      const prepared = prepare(request, deps);
      if (!prepared.ok) return prepared.response;
      return respond(await runHint(body.data, prepared.gateway, request.signal), MESSAGES.HINT_UNAVAILABLE, MESSAGES.HINT_QUOTA_EXHAUSTED);
    },
  };
}

/** Production limits (research R8): per client per minute, and per instance. */
export const productionLimiters = {
  checkRound: () => createEndpointLimiter({ perClient: 12, perInstance: 60, windowMs: 60_000, clock: systemClock }),
  hint: () => createEndpointLimiter({ perClient: 6, perInstance: 60, windowMs: 60_000, clock: systemClock }),
};
