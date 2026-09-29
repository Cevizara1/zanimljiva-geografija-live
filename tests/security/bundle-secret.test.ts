import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { afterAll, describe, expect, it } from "vitest";

/**
 * S03 (constitution I): build the client with a sentinel key in the environment
 * and prove no emitted file contains it. Vite only exposes VITE_* variables to
 * the bundle; this guards against anyone ever changing that.
 */
const SENTINEL = "AIzaSy-BUNDLE-SENTINEL-must-never-ship-0000";
const outDir = mkdtempSync(join(tmpdir(), "zg-bundle-"));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe("the client bundle", () => {
  it(
    "never contains the Gemini key",
    async () => {
      const previous = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = SENTINEL;
      try {
        await build({ logLevel: "silent", build: { outDir, emptyOutDir: true } });
      } finally {
        if (previous === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = previous;
      }

      const emitted = files(outDir);
      expect(emitted.some((path) => path.endsWith(".js"))).toBe(true);
      for (const path of emitted) {
        expect(readFileSync(path, "utf8").includes(SENTINEL), path).toBe(false);
        expect(readFileSync(path, "utf8").includes("GEMINI_API_KEY"), path).toBe(false);
      }
    },
    60_000,
  );
});
