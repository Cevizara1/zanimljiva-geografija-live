import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "@contracts/api.schemas";
import { createHealthHandler } from "@server/handlers/health";

const get = () => new Request("http://localhost/api/health");

describe("GET /api/health", () => {
  it("says AI is not configured when there is no key", async () => {
    const response = await createHealthHandler({ env: {} }).fetch(get());
    expect(response.status).toBe(200);
    const body = healthResponseSchema.parse(await response.json());
    expect(body).toEqual({ status: "ok", ai: "not_configured" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("says AI is configured with a key, and never reveals it", async () => {
    const key = "AIzaSy-health-sentinel-000000000000000";
    const response = await createHealthHandler({ env: { GEMINI_API_KEY: key } }).fetch(get());
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ status: "ok", ai: "configured" });
    expect(text).not.toContain(key);
    expect(text).not.toContain("gemini-");
  });

  it("refuses other methods", async () => {
    const response = await createHealthHandler({ env: {} }).fetch(
      new Request("http://localhost/api/health", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(405);
  });
});
