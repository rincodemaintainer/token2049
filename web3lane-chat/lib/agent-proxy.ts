type Environment = Record<string, string | undefined>;

type AgentProxyOptions = {
  request: Request;
  path: string[];
  env?: Environment;
  fetchImpl?: typeof fetch;
};

const SAFE_SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

function configuredBaseUrl(value: string | undefined): URL | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function pathIsAllowed(method: string, path: string[]): boolean {
  if (path[0] !== "eve" || path[1] !== "v1") return false;
  if (path.length === 3 && (path[2] === "health" || path[2] === "info")) return method === "GET";
  if (path.length === 3 && path[2] === "session") return method === "POST";

  const sessionId = path[3];
  if (path[2] !== "session" || !sessionId || !SAFE_SESSION_ID.test(sessionId)) return false;
  if (path.length === 4) return method === "POST";
  if (path.length === 5 && path[4] === "cancel") return method === "POST";
  return path.length === 5 && path[4] === "stream" && method === "GET";
}

function isStreamPath(path: string[]): boolean {
  return path.length === 5 && path[0] === "eve" && path[1] === "v1" && path[2] === "session" && path[4] === "stream";
}

function isSameOriginPost(request: Request): boolean {
  if (request.method !== "POST") return true;
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const expectedHost = request.headers.get("host") ?? requestUrl.host;
    return originUrl.protocol === requestUrl.protocol && originUrl.host === expectedHost;
  } catch {
    return false;
  }
}

function responseHeaders(source: Headers): Headers {
  const headers = new Headers({ "cache-control": "no-store" });
  // Node's fetch transparently decompresses upstream bodies, so forwarding
  // content-encoding would make browsers attempt to decode them a second time.
  for (const name of [
    "content-type",
    "content-language",
    "etag",
    "last-modified",
    "x-eve-session-id",
    "x-eve-stream-format",
    "x-eve-stream-tail-index",
    "x-eve-stream-version",
  ]) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

/**
 * Proxies the small Eve API surface needed by the chat UI.  Keeping this
 * independent from Next.js makes its request, authentication, and streaming
 * behavior directly testable.
 */
export async function proxyAgentRequest({
  request,
  path,
  env = process.env,
  fetchImpl = fetch,
}: AgentProxyOptions): Promise<Response> {
  if (!pathIsAllowed(request.method, path)) return error(404, "Agent endpoint not found.");
  if (!isSameOriginPost(request)) return error(403, "Cross-origin requests are not allowed.");

  const agentBaseUrl = configuredBaseUrl(env.QA_AGENT_URL);
  if (!agentBaseUrl) {
    return error(500, "QA_AGENT_URL must be an http(s) URL without credentials, query, or fragment.");
  }

  const target = new URL(agentBaseUrl);
  target.pathname = `${agentBaseUrl.pathname.replace(/\/+$/, "")}/${path.join("/")}`;
  if (isStreamPath(path)) target.search = new URL(request.url).search;

  const headers = new Headers();
  const accept = request.headers.get("accept");
  const contentType = request.headers.get("content-type");
  if (accept) headers.set("accept", accept);
  if (contentType) headers.set("content-type", contentType);

  if (env.QA_AGENT_BEARER_TOKEN) {
    headers.set("authorization", `Bearer ${env.QA_AGENT_BEARER_TOKEN}`);
  } else if (env.QA_AGENT_VERCEL_OIDC_TOKEN) {
    headers.set("authorization", `Bearer ${env.QA_AGENT_VERCEL_OIDC_TOKEN}`);
  }
  if (env.QA_AGENT_VERCEL_OIDC_TOKEN) {
    headers.set("x-vercel-trusted-oidc-idp-token", env.QA_AGENT_VERCEL_OIDC_TOKEN);
  }
  if (env.QA_AGENT_VERCEL_BYPASS_TOKEN) {
    headers.set("x-vercel-protection-bypass", env.QA_AGENT_VERCEL_BYPASS_TOKEN);
  }

  let body: ArrayBuffer | undefined;
  if (request.method === "POST") body = await request.arrayBuffer();
  const signal = isStreamPath(path)
    ? request.signal
    : AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);

  try {
    const upstream = await fetchImpl(target, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "error",
      signal,
    });
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders(upstream.headers) });
  } catch {
    return error(502, "Unable to reach the configured QA agent.");
  }
}
