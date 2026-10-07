import { createHash, timingSafeEqual } from "node:crypto";

export const qaAgentBearerAuth = (
  authorization: string | null,
  expected = process.env.QA_AGENT_BEARER_TOKEN,
) => {
  const received = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!expected || !received) return null;

  const expectedHash = createHash("sha256").update(expected).digest();
  const receivedHash = createHash("sha256").update(received).digest();
  if (!timingSafeEqual(expectedHash, receivedHash)) return null;

  return {
    attributes: {},
    authenticator: "qa-agent-bearer",
    principalId: "qa-agent-client",
    principalType: "service" as const,
  };
};
