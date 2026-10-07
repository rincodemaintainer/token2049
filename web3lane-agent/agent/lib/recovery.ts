import type { CaseAttemptRecord, CaseOutcome } from "./types.ts";

export type RecoveryDecision =
  | { action: "stop"; outcome: CaseOutcome; reason: string }
  | { action: "retry"; reason: string }
  | { action: "pause"; reason: string }
  | { action: "continue"; reason: string };

export type RecoveryInput = {
  attempt: number;
  max_attempts: number;
  assertion_met: boolean;
  recoverable: boolean;
  runner_error: boolean;
  blocked: boolean;
  policy_violated: boolean;
  conclusive_app_mismatch: boolean;
  /** Prior signed tx for this step, if any. */
  pending_transaction?: CaseAttemptRecord["transaction"] | null;
};

/**
 * Bounded recovery: default three attempts total. Never resubmit a signed
 * transaction while confirmation status is unknown.
 */
export function decideRecovery(input: RecoveryInput): RecoveryDecision {
  if (input.policy_violated) {
    return {
      action: "stop",
      outcome: "BLOCKED",
      reason: "signing policy violated",
    };
  }

  if (input.blocked) {
    return {
      action: "pause",
      reason: "missing prerequisite; open a targeted checkpoint",
    };
  }

  const tx = input.pending_transaction;
  if (
    tx &&
    tx.status !== "success" &&
    tx.status !== "failed"
  ) {
    return {
      action: "pause",
      reason:
        "transaction confirmation unresolved; reconcile before another signature",
    };
  }

  if (input.assertion_met) {
    return { action: "continue", reason: "assertion met" };
  }

  if (input.conclusive_app_mismatch) {
    return {
      action: "stop",
      outcome: "FAIL",
      reason: "reproducible app mismatch against confirmed expectation",
    };
  }

  if (input.attempt >= input.max_attempts) {
    return {
      action: "stop",
      outcome: input.runner_error ? "RUNNER_ERROR" : "INCONCLUSIVE",
      reason: "attempt budget exhausted",
    };
  }

  if (input.recoverable || input.runner_error) {
    return {
      action: "retry",
      reason: input.runner_error
        ? "temporary runner/infrastructure issue"
        : "recoverable failure within attempt budget",
    };
  }

  return {
    action: "stop",
    outcome: "FAIL",
    reason: "non-recoverable assertion failure",
  };
}

export function dependencyOutcomeAllowsRun(
  dependencyOutcomes: Record<string, CaseOutcome | undefined>,
  dependsOn: string[],
): { ok: boolean; blocking: string[] } {
  const blocking: string[] = [];
  for (const id of dependsOn) {
    const outcome = dependencyOutcomes[id];
    if (outcome !== "PASS" && outcome !== "FLAKY") {
      blocking.push(id);
    }
  }
  return { ok: blocking.length === 0, blocking };
}
