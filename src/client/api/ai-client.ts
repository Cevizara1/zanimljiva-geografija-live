import {
  checkRoundResponseSchema,
  healthResponseSchema,
  hintResponseSchema,
  type CheckRoundRequest,
  type HintRequest,
} from "@contracts/api.schemas";
import type { RoundResult } from "@domain/score-round";
import type { UnverifiedReason } from "@client/state/game-reducer";

/*
 * The browser's only way to the AI: our own `/api/*`. Every function resolves —
 * a network error, a timeout, a non-JSON body or an unexpected shape all become
 * a failure outcome, so the game can always fall back to local scoring.
 * The browser never retries on its own (W04 PDF §7).
 */

/** Above the server deadlines (18 s / 9 s), so a hung function still ends in the fallback. */
export const CHECK_CLIENT_TIMEOUT_MS = 22_000;
export const HINT_CLIENT_TIMEOUT_MS = 11_000;

export type CheckOutcome =
  | { ok: true; result: RoundResult }
  | { ok: false; reason: UnverifiedReason; retryable: boolean };

export type HintOutcome =
  | { ok: true; kind: "clue"; clue: string }
  | { ok: true; kind: "no_known_term" }
  | { ok: false; quotaExhausted: boolean };

export type AiStatus = "configured" | "not_configured" | "unknown";

type FetchLike = typeof fetch;

function withTimeout(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  return typeof AbortSignal.any === "function" ? AbortSignal.any([timeout, signal]) : timeout;
}

async function postJson(
  path: string,
  body: unknown,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const response = await fetchImpl(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: withTimeout(timeoutMs, signal),
  });
  return response.json();
}

export async function checkRound(
  request: CheckRoundRequest,
  signal?: AbortSignal,
  fetchImpl: FetchLike = fetch,
): Promise<CheckOutcome> {
  try {
    const parsed = checkRoundResponseSchema.safeParse(
      await postJson("/api/check-round", request, CHECK_CLIENT_TIMEOUT_MS, signal, fetchImpl),
    );
    if (!parsed.success) return { ok: false, reason: "temporary", retryable: true };

    const body = parsed.data;
    if (body.ok) return { ok: true, result: { lines: body.lines, points: body.points, verified: true } };
    return {
      ok: false,
      reason:
        body.code === "AI_NOT_CONFIGURED" ? "not_configured" : body.code === "AI_QUOTA_EXHAUSTED" ? "quota_exhausted" : "temporary",
      retryable: body.retryable,
    };
  } catch {
    // Offline, timed out, or not JSON: the same safe outcome as a server failure.
    return { ok: false, reason: "temporary", retryable: true };
  }
}

export async function requestHint(
  request: HintRequest,
  signal?: AbortSignal,
  fetchImpl: FetchLike = fetch,
): Promise<HintOutcome> {
  try {
    const parsed = hintResponseSchema.safeParse(
      await postJson("/api/hint", request, HINT_CLIENT_TIMEOUT_MS, signal, fetchImpl),
    );
    if (!parsed.success) return { ok: false, quotaExhausted: false };
    if (!parsed.data.ok) return { ok: false, quotaExhausted: parsed.data.code === "AI_QUOTA_EXHAUSTED" };
    const body = parsed.data;
    return body.kind === "clue" ? { ok: true, kind: "clue", clue: body.clue } : { ok: true, kind: "no_known_term" };
  } catch {
    return { ok: false, quotaExhausted: false };
  }
}

export async function fetchAiStatus(fetchImpl: FetchLike = fetch): Promise<AiStatus> {
  try {
    const response = await fetchImpl("/api/health", { signal: AbortSignal.timeout(5_000) });
    const parsed = healthResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.ai : "unknown";
  } catch {
    return "unknown";
  }
}
