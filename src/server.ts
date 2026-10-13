import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { Budget } from "./budget.js";
import { FakeProvider } from "./fakeProvider.js";
import { Gateway } from "./gateway.js";
import type { Outcome } from "./types.js";

const HTTP_STATUS: Record<Outcome["status"], number> = { ok: 200, blocked: 422, over_budget: 429, unavailable: 503 };

function send(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, maxBytes = 64_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createApp(gateway: Gateway) {
  return createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/metrics") return send(res, 200, gateway.summary());
    if (req.method === "POST" && req.url === "/generate") {
      let body: { userId?: unknown; prompt?: unknown; maxOutputTokens?: unknown };
      try {
        body = (await readJson(req)) as typeof body;
      } catch {
        return send(res, 400, { error: "body must be JSON under 64 KB" });
      }
      if (typeof body?.userId !== "string" || typeof body?.prompt !== "string") {
        return send(res, 400, { error: "userId and prompt are required strings" });
      }
      const max = typeof body.maxOutputTokens === "number" ? Math.min(Math.max(1, body.maxOutputTokens), 2000) : undefined;
      const outcome = await gateway.generate({ userId: body.userId, prompt: body.prompt, maxOutputTokens: max });
      return send(res, HTTP_STATUS[outcome.status], outcome);
    }
    send(res, 404, { error: "not found" });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const gateway = new Gateway({
    providers: [
      new FakeProvider("primary-demo", { input: 0.003, output: 0.015 }),
      new FakeProvider("fallback-demo", { input: 0.0005, output: 0.0015 }),
    ],
    budget: new Budget(0.5),
  });
  const port = Number(process.env.PORT ?? 8787);
  createApp(gateway).listen(port, () => console.log(`genai-gateway (demo providers) on http://localhost:${port}`));
}
