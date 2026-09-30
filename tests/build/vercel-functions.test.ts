import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

/*
 * Regression guard for the first Vercel deploy (2026-09-30): every function
 * failed with FUNCTION_INVOCATION_FAILED because Node ESM does not resolve
 * extensionless relative imports, while Vite and Vitest silently do.
 *
 * This compiles each server-side file on its own, without bundling — the way
 * Vercel's Node runtime does — and loads the functions with plain Node.
 */

const ROOT = process.cwd();
const OUT = join(ROOT, ".vercel-sim");
const SOURCES = ["api", "src/server", "src/domain", "src/contracts"];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? tsFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

afterAll(() => rmSync(OUT, { recursive: true, force: true }));

describe("Vercel functions load under plain Node ESM", () => {
  it(
    "every api/*.ts compiles file by file and answers",
    async () => {
      rmSync(OUT, { recursive: true, force: true });
      for (const source of SOURCES.flatMap((dir) => tsFiles(join(ROOT, dir)))) {
        const { outputText: code } = ts.transpileModule(readFileSync(source, "utf8"), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
        });
        const target = join(OUT, relative(ROOT, source)).replace(/\.ts$/, ".js");
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, code);
      }
      writeFileSync(join(OUT, "package.json"), JSON.stringify({ type: "module" }));

      // A separate, plain Node process: no Vite resolver to paper over missing extensions.
      const probe = `
        const load = async (name) => (await import("./api/" + name + ".js")).default;
        const health = await (await load("health")).fetch(new Request("http://x/api/health"));
        const check = await (await load("check-round")).fetch(new Request("http://x/api/check-round", { method: "POST", body: "{}" }));
        const hint = await (await load("hint")).fetch(new Request("http://x/api/hint", { method: "POST", body: "{}" }));
        console.log(JSON.stringify([health.status, check.status, hint.status]));
      `;
      const output = execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
        cwd: OUT,
        encoding: "utf8",
        env: { PATH: process.env.PATH ?? "" }, // no GEMINI_API_KEY: nothing can reach the provider
      });
      // health 200; malformed bodies are answered by our code before any provider call.
      expect(JSON.parse(output.trim())).toEqual([200, 400, 400]);
    },
    60_000,
  );
});
