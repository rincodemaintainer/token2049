import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyCaseOutcome, evidencePresence } from "./outcomes.ts";

describe("classifyCaseOutcome", () => {
  it("forbids PASS when required evidence is missing", () => {
    const result = classifyCaseOutcome({
      assertion_met: true,
      evidence: evidencePresence(["trace", "receipt"], ["trace"]),
      attempt: 1,
      max_attempts: 3,
    });
    assert.equal(result.outcome, "INCONCLUSIVE");
  });

  it("returns PASS only with complete evidence", () => {
    const result = classifyCaseOutcome({
      assertion_met: true,
      evidence: evidencePresence(["trace"], ["trace"]),
      attempt: 1,
      max_attempts: 3,
    });
    assert.equal(result.outcome, "PASS");
    assert.equal(result.attribution_status, "not_applicable");
  });

  it("returns FLAKY after recoverable failures then success", () => {
    const result = classifyCaseOutcome({
      assertion_met: true,
      evidence: evidencePresence(["trace"], ["trace"]),
      attempt: 2,
      max_attempts: 3,
      prior_recoverable_failures: 1,
    });
    assert.equal(result.outcome, "FLAKY");
  });

  it("returns FAIL for conclusive app mismatch", () => {
    const result = classifyCaseOutcome({
      assertion_met: false,
      evidence: evidencePresence(["shot"], ["shot"]),
      attempt: 1,
      max_attempts: 3,
      recoverable: false,
      cause_category: "app_behavior",
    });
    assert.equal(result.outcome, "FAIL");
    assert.equal(result.cause_category, "app_behavior");
  });

  it("returns BLOCKED for missing prerequisites", () => {
    const result = classifyCaseOutcome({
      assertion_met: false,
      evidence: evidencePresence([], []),
      attempt: 1,
      max_attempts: 3,
      blocked: true,
    });
    assert.equal(result.outcome, "BLOCKED");
  });

  it("returns NOT_RUN when dependency failed", () => {
    const result = classifyCaseOutcome({
      assertion_met: false,
      evidence: evidencePresence([], []),
      attempt: 0,
      max_attempts: 3,
      dependency_failed: true,
    });
    assert.equal(result.outcome, "NOT_RUN");
  });

  it("returns INCONCLUSIVE when attempts exhausted without resolution", () => {
    const result = classifyCaseOutcome({
      assertion_met: false,
      evidence: evidencePresence(["trace"], ["trace"]),
      attempt: 3,
      max_attempts: 3,
      recoverable: true,
    });
    assert.equal(result.outcome, "INCONCLUSIVE");
  });

  it("returns RUNNER_ERROR for automation failure", () => {
    const result = classifyCaseOutcome({
      assertion_met: false,
      evidence: evidencePresence(["trace"], []),
      attempt: 3,
      max_attempts: 3,
      runner_error: true,
    });
    assert.equal(result.outcome, "RUNNER_ERROR");
    assert.equal(result.cause_category, "runner_automation");
  });
});
