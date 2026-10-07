import type {
  ApprovedPlan,
  CaseOutcome,
  CaseResult,
  CauseCategory,
  ResultReport,
} from "./types.ts";

export type DeliveryAssessment = {
  delivery_complete: boolean;
  reasons: string[];
  refund_review_eligible: boolean;
};

/**
 * Delivery completeness is separate from case PASS/FAIL.
 * An app defect with required proof can be fully delivered.
 * Missing critical execution or unusable evidence can be incomplete.
 */
export function assessDelivery(input: {
  cases: CaseResult[];
  plan: ApprovedPlan;
  required_artifacts_present: boolean;
}): DeliveryAssessment {
  const reasons: string[] = [];
  const byId = new Map(input.cases.map((c) => [c.case_id, c]));

  for (const planned of input.plan.cases) {
    const result = byId.get(planned.id);
    if (!result) {
      reasons.push(`missing result for case ${planned.id}`);
      continue;
    }
    if (planned.priority === "critical") {
      if (
        result.outcome === "NOT_RUN" ||
        result.outcome === "RUNNER_ERROR" ||
        result.outcome === "INCONCLUSIVE" ||
        result.outcome === "BLOCKED"
      ) {
        reasons.push(
          `critical case ${planned.id} ended ${result.outcome} without conclusive delivery`,
        );
      }
      if (
        result.outcome === "PASS" ||
        result.outcome === "FLAKY" ||
        result.outcome === "FAIL"
      ) {
        const missingProof =
          planned.evidence.filter((e) => !result.evidence_refs.includes(e))
            .length > 0;
        if (missingProof) {
          reasons.push(`critical case ${planned.id} is missing required evidence`);
        }
      }
    }
  }

  if (!input.required_artifacts_present) {
    reasons.push("required evidence artifacts missing or unusable");
  }

  const delivery_complete = reasons.length === 0;
  const refund_review_eligible = !delivery_complete;

  return { delivery_complete, reasons, refund_review_eligible };
}

export type ReviewDecisionInput = {
  delivery_complete: boolean;
  has_reproducible_app_defect: boolean;
  promised_critical_work_unexecuted: boolean;
  required_evidence_missing: boolean;
  inconclusive_attribution: boolean;
  new_requested_work: boolean;
};

export type ReviewRemedy =
  | "no_refund_testing_delivered"
  | "full_job_refund"
  | "replacement_run"
  | "new_plan_and_quote"
  | "human_review_required";

/**
 * Proposed MVP remedies from the handoff refund policy.
 * App defects alone do not imply failed QA delivery.
 */
export function proposeReviewRemedy(input: ReviewDecisionInput): {
  remedy: ReviewRemedy;
  note: string;
} {
  if (input.new_requested_work) {
    return {
      remedy: "new_plan_and_quote",
      note: "New requested work requires a revised plan and quote.",
    };
  }
  if (input.required_evidence_missing || input.promised_critical_work_unexecuted) {
    return {
      remedy: "human_review_required",
      note: "Incomplete promised delivery; human refund or replacement-run review.",
    };
  }
  if (input.inconclusive_attribution) {
    return {
      remedy: "human_review_required",
      note: "Attribution disputed or inconclusive; review agreed scope and evidence.",
    };
  }
  if (input.has_reproducible_app_defect && input.delivery_complete) {
    return {
      remedy: "no_refund_testing_delivered",
      note: "Reproducible app defect with required proof; testing delivered.",
    };
  }
  if (input.delivery_complete) {
    return {
      remedy: "no_refund_testing_delivered",
      note: "Agreed testing and evidence delivered.",
    };
  }
  return {
    remedy: "human_review_required",
    note: "Delivery incomplete; human operator decides refund or replacement.",
  };
}

export function hasAppDefect(cases: CaseResult[]): boolean {
  return cases.some(
    (c) =>
      c.outcome === "FAIL" &&
      (c.cause_category as CauseCategory | null) === "app_behavior",
  );
}

export function unfinishedCriticalOutcomes(
  cases: CaseResult[],
  plan: ApprovedPlan,
): CaseOutcome[] {
  const critical = new Set(
    plan.cases.filter((c) => c.priority === "critical").map((c) => c.id),
  );
  return cases
    .filter((c) => critical.has(c.case_id))
    .map((c) => c.outcome)
    .filter((o) =>
      ["NOT_RUN", "BLOCKED", "INCONCLUSIVE", "RUNNER_ERROR"].includes(o),
    );
}
