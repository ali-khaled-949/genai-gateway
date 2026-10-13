# genai-gateway

A small **TypeScript / Node.js** service that sits between a product and its generative
AI providers and handles the four things that go wrong in production: output
**quality and safety**, **latency**, **cost**, and provider outages.

**This is a demo I built to show how I approach AI integration in a product.**
The providers in this repo are stand-ins (no network, no API key). It is not
client or production code.

## What it does

| Concern | How it is handled |
|---|---|
| Safety, input | Empty, oversized, prompt-injection, and card / SSN-like prompts are rejected before any provider is called. |
| Safety, output | Output is checked before it is returned or cached. Blocked output is never cached. |
| Latency | Each provider call has a timeout and is aborted when it passes it. Metrics report p50 and p95. |
| Outages | Providers are tried in order; a timeout or error falls through to the next one. If all fail, the caller gets every reason. |
| Cost | Per-user daily limit. The worst-case cost is reserved before the call and replaced with the real cost after, so parallel requests cannot overshoot. A failed call costs nothing. |
| Repeat prompts | Normalised prompts are cached with expiry and a size cap; a cache hit costs nothing. |
| API | `POST /generate` returns 200 / 422 blocked / 429 over budget / 503 unavailable. `GET /metrics` returns counts, cost, and latency. |

## Run it

```bash
npm install
npm test      # 12 tests (node:test), including the HTTP API
npm start     # http://localhost:8787 with the stand-in providers
```

```bash
curl -s localhost:8787/generate -d '{"userId":"u1","prompt":"three titles for a short cooking show"}'
```

## Layout

`src/gateway.ts` orchestration · `src/safety.ts` rules · `src/budget.ts` spend limit ·
`src/cache.ts` cache · `src/types.ts` the `Provider` interface a real adapter implements ·
`src/server.ts` HTTP API · `src/fakeProvider.ts` stand-in used by the demo and tests.

## Limits

- No real provider adapters are included; `Provider` is the seam for them.
- Safety rules are simple patterns, a first line of defence, not a moderation service.
- Budget, cache, and metrics live in memory: one process, lost on restart. A real deployment would use Redis or a database.
- No authentication on the HTTP API, and no streaming responses.

TypeScript (strict), Node 20, no runtime dependencies.
