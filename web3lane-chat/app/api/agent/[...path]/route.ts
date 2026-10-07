import { proxyAgentRequest } from "@/lib/agent-proxy";

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyAgentRequest({ request, path });
}

export const GET = proxy;
export const POST = proxy;
