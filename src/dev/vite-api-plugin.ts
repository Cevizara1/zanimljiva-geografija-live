import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { createServer as createViteServer, loadEnv, type Plugin, type ViteDevServer } from "vite";

/*
 * Local stand-in for Vercel Functions (specs/001-singleplayer-vercel/research.md R3):
 * `/api/<name>` runs the very same `api/<name>.ts` file Vercel deploys, through
 * Vite's SSR loader, so `npm run dev` stays one process with no Vercel CLI.
 *
 * `.env` values are copied into `process.env` for these handlers only. They are
 * never exposed through `import.meta.env`, which only carries `VITE_*` variables,
 * and none are defined — so the key cannot reach the browser bundle.
 */

type Handler = { fetch(request: Request): Promise<Response> | Response };
type Loader = (file: string) => Promise<Record<string, unknown>>;

const API_NAME = /^[a-z][a-z-]*$/;

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function toRequest(req: IncomingMessage, body: Buffer, signal: AbortSignal): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(", "));
  }
  // Vercel sets this in production; locally the socket address stands in for it.
  if (!headers.has("x-forwarded-for") && req.socket.remoteAddress) {
    headers.set("x-forwarded-for", req.socket.remoteAddress);
  }
  const method = req.method ?? "GET";
  return new Request(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : new Uint8Array(body),
    signal,
  });
}

function apiMiddleware(root: string, load: Loader) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    if (!path.startsWith("/api/")) return next();

    const name = path.slice("/api/".length);
    if (!API_NAME.test(name) || !existsSync(join(root, "api", `${name}.ts`))) {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, code: "NOT_FOUND" }));
      return;
    }

    // A player who leaves cancels the provider call too (abort propagation).
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const module = await load(`/api/${name}.ts`);
      const handler = module.default as Handler;
      const response = await handler.fetch(toRequest(req, await readBody(req), controller.signal));
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      // Development only: the name of the failure, never the request or the environment.
      console.error(`[dev-api] /api/${name} failed:`, error instanceof Error ? error.name : "unknown");
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, code: "AI_UNAVAILABLE", retryable: true, message: "Greška na serveru." }));
    }
  };
}

function loadServerEnv(mode: string, root: string): void {
  const fileEnv = loadEnv(mode, root, ["GEMINI_", "AI_DEBUG_"]);
  for (const [name, value] of Object.entries(fileEnv)) {
    if (process.env[name] === undefined) process.env[name] = value;
  }
}

export function apiDevPlugin(): Plugin {
  let root = process.cwd();

  return {
    name: "zg-api-dev",
    configResolved(config) {
      root = config.root;
      loadServerEnv(config.mode, root);
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use(apiMiddleware(root, (file) => server.ssrLoadModule(file)));
    },
    configurePreviewServer(server) {
      // `vite preview` has no module loader of its own; borrow one, lazily.
      let loader: Promise<ViteDevServer> | null = null;
      const load: Loader = async (file) => {
        loader ??= createViteServer({ root, configFile: false, server: { middlewareMode: true }, appType: "custom" });
        return (await loader).ssrLoadModule(file);
      };
      server.middlewares.use(apiMiddleware(root, load));
    },
  };
}
