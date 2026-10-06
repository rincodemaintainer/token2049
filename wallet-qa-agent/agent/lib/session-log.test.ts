import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SessionLog, sanitizeDetails } from "./session-log.ts";

describe("session log", () => {
  it("appends monotonic sequence ids", () => {
    const log = new SessionLog("job-1", "session-1");
    const a = log.append({
      job_id: "job-1",
      plan_version: 1,
      timestamp: "2026-10-06T10:00:00Z",
      case_id: null,
      step_id: null,
      attempt: null,
      actor: "buyer",
      action: "intake.submitted",
      details: { goal: "test" },
      evidence_refs: [],
      session_id: "session-1",
    });
    const b = log.append({
      job_id: "job-1",
      plan_version: 1,
      timestamp: "2026-10-06T10:00:01Z",
      case_id: "SWAP-01",
      step_id: "CONNECT",
      attempt: 1,
      actor: "runner",
      action: "step.observed",
      details: {},
      evidence_refs: ["trace"],
      session_id: "session-1",
    });
    assert.equal(a.seq, 1);
    assert.equal(b.seq, 2);
    assert.equal(log.forCase("SWAP-01").length, 1);
  });

  it("redacts credential-like fields", () => {
    const cleaned = sanitizeDetails({
      private_key: "0xdead",
      mnemonic: "abandon abandon",
      password: "secret",
      allowance: "0",
      nested: { api_key: "x", ok: true },
    });
    assert.equal(cleaned.private_key, "omitted");
    assert.equal(cleaned.mnemonic, "omitted");
    assert.equal(cleaned.password, "omitted");
    assert.equal(cleaned.allowance, "0");
    assert.deepEqual(cleaned.nested, { api_key: "omitted", ok: true });
  });

  it("redacts normalized secret keys and secrets nested in arrays", () => {
    const cleaned = sanitizeDetails({
      privateKey: "0xdead",
      "x-api-key": "x",
      token_amount_units: "100",
      records: [{ accessToken: "token", ok: true }],
    });
    assert.equal(cleaned.privateKey, "omitted");
    assert.equal(cleaned["x-api-key"], "omitted");
    assert.equal(cleaned.token_amount_units, "100");
    assert.deepEqual(cleaned.records, [{ accessToken: "omitted", ok: true }]);
  });

  it("binds events to the log identity and does not expose mutable stored events", () => {
    const log = new SessionLog("job-1", "session-1");
    const evidence_refs = ["trace-original"];
    const usage_snapshot = { browser_seconds: 1 };
    const appended = log.append({
      job_id: "other-job",
      plan_version: 1,
      timestamp: "2026-10-06T10:00:00Z",
      case_id: null,
      step_id: null,
      attempt: null,
      actor: "runner",
      action: "step.observed",
      details: { observed: "original" },
      evidence_refs,
      session_id: "other-session",
      usage_snapshot,
    });
    appended.details.observed = "tampered";
    evidence_refs[0] = "trace-tampered";
    usage_snapshot.browser_seconds = 99;
    const stored = log.list()[0];
    assert.equal(stored.job_id, "job-1");
    assert.equal(stored.session_id, "session-1");
    assert.equal(stored.details.observed, "original");
    assert.deepEqual(stored.evidence_refs, ["trace-original"]);
    assert.deepEqual(stored.usage_snapshot, { browser_seconds: 1 });
  });
});
