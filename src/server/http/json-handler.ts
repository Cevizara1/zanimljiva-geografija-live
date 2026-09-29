import type { z } from "zod";
import { MAX_BODY_BYTES, type ApiFailure, type ApiFailureCode } from "../../contracts/api.schemas";

/*
 * The only way our functions answer: JSON, never cached, never a stack trace,
 * provider text, model id or key (contracts/http-api.md).
 */

export const MESSAGES = {
  INVALID_REQUEST: "Zahtev nije ispravan.",
  METHOD_NOT_ALLOWED: "Metoda nije dozvoljena.",
  RATE_LIMITED: "Previše zahteva za kratko vreme. Sačekaj malo.",
  AI_NOT_CONFIGURED: "AI provera nije podešena.",
  AI_UNAVAILABLE: "AI provera trenutno nije dostupna. Runda je bodovana bez provere.",
  HINT_UNAVAILABLE: "Hint trenutno nije dostupan. Kredit nije potrošen.",
  AI_QUOTA_EXHAUSTED:
    "Dnevni limit AI provera je potrošen. Igra radi dalje, a odgovori se boduju samo po početnom slovu do sutra oko 9h.",
  HINT_QUOTA_EXHAUSTED: "Dnevni limit za hintove je potrošen. Kredit nije potrošen.",
} as const;

const STATUS: Record<ApiFailureCode, number> = {
  INVALID_REQUEST: 400,
  METHOD_NOT_ALLOWED: 405,
  RATE_LIMITED: 429,
  AI_NOT_CONFIGURED: 503,
  AI_UNAVAILABLE: 503,
  AI_QUOTA_EXHAUSTED: 503,
};

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

export function failureResponse(code: ApiFailureCode, retryable: boolean, message: string = MESSAGES[code]): Response {
  const body: ApiFailure = { ok: false, code, retryable, message };
  return jsonResponse(STATUS[code], body, code === "METHOD_NOT_ALLOWED" ? { allow: "POST" } : {});
}

export type BodyResult<T> = { ok: true; data: T } | { ok: false; response: Response };

/**
 * POST only, at most MAX_BODY_BYTES, valid JSON, and the strict schema. Every
 * failure here happens before — and instead of — any AI call.
 */
export async function readJsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<BodyResult<T>> {
  if (request.method !== "POST") return { ok: false, response: failureResponse("METHOD_NOT_ALLOWED", false) };

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return { ok: false, response: failureResponse("INVALID_REQUEST", false) };

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: failureResponse("INVALID_REQUEST", false) };
  }
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return { ok: false, response: failureResponse("INVALID_REQUEST", false) };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, response: failureResponse("INVALID_REQUEST", false) };
  }

  const parsed = schema.safeParse(json);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, response: failureResponse("INVALID_REQUEST", false) };
}

/** Best-effort client address for rate limiting only; never logged or sent anywhere. */
export function clientKey(request: Request): string {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}
