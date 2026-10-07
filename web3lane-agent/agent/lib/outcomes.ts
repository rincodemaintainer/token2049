import type {
  AttributionStatus,
  CaseAttemptRecord,
  CaseOutcome,
  CauseCategory,
  EvidencePresence,
} from "./types.ts";

export type ClassifyInput = {
  assertion_met: boolean;
  evidence: EvidencePresence;
  attempt: number;
  max_attempts: number;
  /** Earlier attempts failed recoverably before this success. */
  prior_recoverable_failures?: number;
  runner_error?: boolean;
  blocked?: boolean;
  policy_violated?: boolean;
  recoverable?: boolean;
  /** Dependency case did not PASS/FLAKY. */
  dependency_failed?: boolean;
  cause_category?: CauseCategory | null;
};

/**
 * Classify a case outcome. PASS is forbidden when required proof is missing.
 * Outcome, proposed cause, and delivery completeness stay separate concerns.
 */
export function classifyCaseOutcome(input: ClassifyInput): {
  outcome: CaseOutcome;
  cause_category: CauseCategory | null;
  attribution_status: AttributionStatus;
} {
  if (input.dependency_failed) {
    return {
      outcome: "NOT_RUN",
      cause_category: "missing_prerequisite",
      attribution_status: "supported_by_observation_human_review_available",
    };
  }

  if (input.policy_violated) {
    return {
      outcome: "BLOCKED",
      cause_category: "policy_violation",
      attribution_status: "supported_by_observation_human_review_available",
    };
  }

  if (input.blocked) {
    return {
      outcome: "BLOCKED",
      cause_category: input.cause_category ?? "missing_prerequisite",
      attribution_status: "supported_by_observation_human_review_available",
    };
  }

  if (input.runner_error) {
    if (input.attempt >= input.max_attempts) {
      return {
        outcome: "RUNNER_ERROR",
        cause_category: "runner_automation",
        attribution_status: "supported_by_observation_human_review_available",
      };
    }
    return {
      outcome: "RUNNER_ERROR",
      cause_category: "runner_automation",
      attribution_status: "supported_by_observation_human_review_available",
    };
  }

  const evidenceComplete = input.evidence.missing.length === 0;

  if (input.assertion_met) {
    if (!evidenceComplete) {
      return {
        outcome: "INCONCLUSIVE",
        cause_category: "specification_gap",
        attribution_status: "unknown",
      };
    }
    if ((input.prior_recoverable_failures ?? 0) > 0) {
      return {
        outcome: "FLAKY",
        cause_category: null,
        attribution_status: "not_applicable",
      };
    }
    return {
      outcome: "PASS",
      cause_category: null,
      attribution_status: "not_applicable",
    };
  }

  // Assertion not met
  if (!input.recoverable || input.attempt >= input.max_attempts) {
    if (input.recoverable && input.attempt >= input.max_attempts) {
      return {
        outcome: "INCONCLUSIVE",
        cause_category: input.cause_category ?? "unknown",
        attribution_status: "supported_by_observation_human_review_available",
      };
    }
    return {
      outcome: "FAIL",
      cause_category: input.cause_category ?? "app_behavior",
      attribution_status: "supported_by_observation_human_review_available",
    };
  }

  // Recoverable failure under attempt budget — not a final outcome yet.
  return {
    outcome: "INCONCLUSIVE",
    cause_category: input.cause_category ?? "unknown",
    attribution_status: "unknown",
  };
}

export function evidencePresence(
  required: string[],
  captured: string[],
): EvidencePresence {
  const present = required.filter((id) => captured.includes(id));
  const missing = required.filter((id) => !captured.includes(id));
  return { present, missing };
}

export function summarizeAttemptHistory(
  history: CaseAttemptRecord[],
): { prior_recoverable_failures: number; last: CaseAttemptRecord | null } {
  const prior_recoverable_failures = history.filter(
    (h) => h.recoverable && h.outcome !== "PASS" && h.outcome !== "FLAKY",
  ).length;
  return {
    prior_recoverable_failures,
    last: history.at(-1) ?? null,
  };
}
