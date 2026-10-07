import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's native TypeScript runner requires an explicit extension.
import { proxyAgentRequest } from "../lib/agent-proxy.ts";

const baseEnv = { QA_AGENT_URL: "https://qa-agent.example/deployment" };

function request(path: string, init?: RequestInit) {
  return new Request(`https://chat.example/api/agent/${path}`, init);
}

test("proxies health through the configured base path with a bearer token", async () => {
  let receivedUrl = "";
  let receivedInit: RequestInit | undefined;
  const response = await proxyAgentRequest({
    request: request("eve/v1/health"),
    path: ["eve", "v1", "health"],
    env: { ...baseEnv, QA_AGENT_BEARER_TOKEN: "private-bearer", QA_AGENT_VERCEL_OIDC_TOKEN: "oidc-secret" },
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      receivedUrl = String(input);
      receivedInit = init;
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  });

  assert.equal(receivedUrl, "https://qa-agent.example/deployment/eve/v1/health");
  assert.equal(new Headers(receivedInit?.headers).get("authorization"), "Bearer private-bearer");
  assert.equal(new Headers(receivedInit?.headers).get("x-vercel-trusted-oidc-idp-token"), "oidc-secret");
  assert.equal(receivedInit?.cache, "no-store");
  assert.equal(receivedInit?.redirect, "error");
  assert.equal(receivedInit?.signal instanceof AbortSignal, true);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("uses the Host header for same-origin POSTs and cannot reinterpret trailing slashes as an origin", async () => {
  let receivedUrl = "";
  const response = await proxyAgentRequest({
    request: new Request("http://localhost:3001/api/agent/eve/v1/session", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3001", host: "127.0.0.1:3001" },
      body: "{}",
    }),
    path: ["eve", "v1", "session"],
    env: { QA_AGENT_URL: "https://qa-agent.example//" },
    fetchImpl: (async (input: RequestInfo | URL) => {
      receivedUrl = String(input);
      return new Response("accepted", { status: 202 });
    }) as typeof fetch,
  });

  assert.equal(response.status, 202);
  assert.equal(receivedUrl, "https://qa-agent.example/eve/v1/session");
});

test("keeps stream bytes and its cursor query", async () => {
  let receivedUrl = "";
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("event: update\\ndata: hello\\n\\n"));
      controller.close();
    },
  });
  const response = await proxyAgentRequest({
    request: request("eve/v1/session/run_123/stream?cursor=event-7"),
    path: ["eve", "v1", "session", "run_123", "stream"],
    env: baseEnv,
    fetchImpl: (async (input: RequestInfo | URL) => {
      receivedUrl = String(input);
      return new Response(stream, { headers: { "content-type": "text/event-stream" } });
    }) as typeof fetch,
  });

  assert.equal(receivedUrl, "https://qa-agent.example/deployment/eve/v1/session/run_123/stream?cursor=event-7");
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  assert.equal(await response.text(), "event: update\\ndata: hello\\n\\n");
});

test("forwards POST data and uses Vercel OIDC when no bearer token is configured", async () => {
  let receivedInit: RequestInit | undefined;
  const response = await proxyAgentRequest({
    request: request("eve/v1/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "test checkout" }),
    }),
    path: ["eve", "v1", "session"],
    env: { ...baseEnv, QA_AGENT_VERCEL_OIDC_TOKEN: "oidc-secret", QA_AGENT_VERCEL_BYPASS_TOKEN: "bypass-secret" },
    fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      receivedInit = init;
      return new Response("created", { status: 201 });
    }) as typeof fetch,
  });

  const headers = new Headers(receivedInit?.headers);
  assert.equal(new TextDecoder().decode(receivedInit?.body as ArrayBuffer), '{"prompt":"test checkout"}');
  assert.equal(headers.get("authorization"), "Bearer oidc-secret");
  assert.equal(headers.get("x-vercel-trusted-oidc-idp-token"), "oidc-secret");
  assert.equal(headers.get("x-vercel-protection-bypass"), "bypass-secret");
  assert.equal(response.status, 201);
});

test("preserves upstream result status while never exposing sensitive upstream headers", async () => {
  const response = await proxyAgentRequest({
    request: request("eve/v1/session/abc-123/cancel", { method: "POST", body: "{}" }),
    path: ["eve", "v1", "session", "abc-123", "cancel"],
    env: { ...baseEnv, QA_AGENT_BEARER_TOKEN: "private-bearer" },
    fetchImpl: (async () => new Response("already resolved", {
      status: 409,
      headers: {
        "content-type": "text/plain",
        "content-encoding": "gzip",
        "x-eve-session-id": "abc-123",
        "x-eve-stream-format": "ndjson",
        "x-eve-stream-tail-index": "42",
        "x-eve-stream-version": "26",
        authorization: "Bearer leaked",
        "set-cookie": "session=leaked",
      },
    })) as typeof fetch,
  });

  assert.equal(response.status, 409);
  assert.equal(await response.text(), "already resolved");
  assert.equal(response.headers.get("authorization"), null);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("content-encoding"), null);
  assert.equal(response.headers.get("x-eve-session-id"), "abc-123");
  assert.equal(response.headers.get("x-eve-stream-format"), "ndjson");
  assert.equal(response.headers.get("x-eve-stream-tail-index"), "42");
  assert.equal(response.headers.get("x-eve-stream-version"), "26");
});

test("rejects unsupported routes, unsafe IDs, cross-origin posts, and broken configuration", async () => {
  const unsupported = await proxyAgentRequest({ request: request("eve/v1/admin"), path: ["eve", "v1", "admin"], env: baseEnv });
  const unsafeId = await proxyAgentRequest({ request: request("eve/v1/session/a.b/stream"), path: ["eve", "v1", "session", "a.b", "stream"], env: baseEnv });
  const crossOrigin = await proxyAgentRequest({
    request: request("eve/v1/session", { method: "POST", headers: { origin: "https://attacker.example" }, body: "{}" }),
    path: ["eve", "v1", "session"],
    env: baseEnv,
  });
  const badConfig = await proxyAgentRequest({
    request: request("eve/v1/health"),
    path: ["eve", "v1", "health"],
    env: { QA_AGENT_URL: "https://token@qa-agent.example/?secret=value" },
  });

  assert.equal(unsupported.status, 404);
  assert.equal(unsafeId.status, 404);
  assert.equal(crossOrigin.status, 403);
  assert.equal(badConfig.status, 500);
  assert.equal((await badConfig.json() as { error: string }).error.includes("QA_AGENT_URL"), true);
});

test("returns a generic failure when the upstream cannot be reached", async () => {
  const controller = new AbortController();
  let upstreamSignal: AbortSignal | null | undefined;
  const response = await proxyAgentRequest({
    request: request("eve/v1/info", { signal: controller.signal }),
    path: ["eve", "v1", "info"],
    env: baseEnv,
    fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      upstreamSignal = init?.signal;
      controller.abort();
      assert.equal(upstreamSignal?.aborted, true);
      throw new Error("DNS failure: qa-agent.example");
    }) as typeof fetch,
  });

  assert.equal(upstreamSignal instanceof AbortSignal, true);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Unable to reach the configured QA agent." });
});
