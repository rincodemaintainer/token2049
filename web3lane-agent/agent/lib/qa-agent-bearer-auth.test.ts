import assert from "node:assert/strict";
import test from "node:test";
import { qaAgentBearerAuth } from "./qa-agent-bearer-auth.ts";

test("rejects bearer authentication without configured token", () => {
  assert.equal(qaAgentBearerAuth("Bearer configured-token", ""), null);
});

test("rejects missing, malformed, and incorrect bearer authentication", () => {
  for (const authorization of [null, "Basic configured-token", "Bearer ", "Bearer wrong-token"]) {
    assert.equal(qaAgentBearerAuth(authorization, "configured-token"), null);
  }
});

test("accepts the configured bearer token as the QA service principal", () => {
  assert.deepEqual(qaAgentBearerAuth("Bearer configured-token", "configured-token"), {
    attributes: {},
    authenticator: "qa-agent-bearer",
    principalId: "qa-agent-client",
    principalType: "service",
  });
});
