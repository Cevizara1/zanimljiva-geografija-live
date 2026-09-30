import type { HealthResponse } from "../../contracts/api.schemas.js";
import { loadAiConfig, type AiEnv } from "../ai/config.js";
import { jsonResponse } from "../http/json-handler.js";

/** GET /api/health — whether the AI is configured; never the key, chain or limits. */
export function createHealthHandler(deps: { env: AiEnv }) {
  return {
    async fetch(request: Request): Promise<Response> {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return jsonResponse(405, { status: "method_not_allowed" }, { allow: "GET" });
      }
      const body: HealthResponse = {
        status: "ok",
        ai: loadAiConfig(deps.env).configured ? "configured" : "not_configured",
      };
      return jsonResponse(200, body);
    },
  };
}

