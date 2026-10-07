import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideRecovery,
  dependencyOutcomeAllowsRun,
} from "./recovery.ts";

describe("recovery", () => {
  it("pauses instead of resubmitting an unresolved transaction", () => {
    const decision = decideRecovery({
      attempt: 1,
      max_attempts: 3,
      assertion_met: false,
      recoverable: true,
      runner_error: false,
      blocked: false,
      policy_violated: false,
      conclusive_app_mismatch: false,
      pending_transaction: { hash: "0xabc", status: "unknown" },
    });
    assert.equal(decision.action, "pause");
    assert.match(decision.reason, /reconcile/);
  });

  it("pauses for a submitted or hashless unknown transaction before accepting success", () => {
    for (const pending_transaction of [
      { hash: "0xabc", status: "submitted" as const },
      { status: "unknown" as const },
    ]) {
      const decision = decideRecovery({
        attempt: 1,
        max_attempts: 3,
        assertion_met: true,
        recoverable: false,
        runner_error: false,
        blocked: false,
        policy_violated: false,
        conclusive_app_mismatch: false,
        pending_transaction,
      });
      assert.equal(decision.action, "pause");
    }
  });

  it("retries recoverable infrastructure failures within budget", () => {
    const decision = decideRecovery({
      attempt: 1,
      max_attempts: 3,
      assertion_met: false,
      recoverable: false,
      runner_error: true,
      blocked: false,
      policy_violated: false,
      conclusive_app_mismatch: false,
    });
    assert.equal(decision.action, "retry");
  });

  it("stops after attempt budget is exhausted", () => {
    const decision = decideRecovery({
      attempt: 3,
      max_attempts: 3,
      assertion_met: false,
      recoverable: true,
      runner_error: false,
      blocked: false,
      policy_violated: false,
      conclusive_app_mismatch: false,
    });
    assert.equal(decision.action, "stop");
    assert.equal(decision.action === "stop" && decision.outcome, "INCONCLUSIVE");
  });

  it("stops on conclusive app mismatch without retrying spend", () => {
    const decision = decideRecovery({
      attempt: 1,
      max_attempts: 3,
      assertion_met: false,
      recoverable: false,
      runner_error: false,
      blocked: false,
      policy_violated: false,
      conclusive_app_mismatch: true,
    });
    assert.equal(decision.action, "stop");
    assert.equal(decision.action === "stop" && decision.outcome, "FAIL");
  });

  it("blocks dependent cases when dependency did not pass", () => {
    const check = dependencyOutcomeAllowsRun(
      { "SWAP-01": "FAIL" },
      ["SWAP-01"],
    );
    assert.equal(check.ok, false);
    assert.deepEqual(check.blocking, ["SWAP-01"]);
  });

  it("allows dependents after PASS or FLAKY", () => {
    assert.equal(
      dependencyOutcomeAllowsRun({ "SWAP-01": "PASS" }, ["SWAP-01"]).ok,
      true,
    );
    assert.equal(
      dependencyOutcomeAllowsRun({ "SWAP-01": "FLAKY" }, ["SWAP-01"]).ok,
      true,
    );
  });
});
