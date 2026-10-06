import { Client } from "eve/client";
import { writeFileSync } from "node:fs";

const client = new Client({ host: process.env.EVE_URL });

export async function answer(input, journal, deadline) {
  if (Date.now() >= deadline) throw new Error("Result deadline expired");
  const { session } = await client.sessions.create();
  writeFileSync(journal, JSON.stringify({ sessionId: session.state.sessionId, phase: "sending" }), { mode: 0o600 });
  const result = await (await session.send(input)).result();
  if (result.status === "failed" || result.inputRequests.length || !result.message?.trim()) {
    throw new Error("Model did not return a final answer");
  }
  writeFileSync(journal, JSON.stringify({ sessionId: session.state.sessionId, phase: "answered", result: result.message }), { mode: 0o600 });
  return result.message;
}
