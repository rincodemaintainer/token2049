import {
  classifyCaseOutcome,
  evidencePresence,
} from "./outcomes.ts";
import { dependencyOutcomeAllowsRun, decideRecovery } from "./recovery.ts";
import { orderCases, validatePlanStructure } from "./plan.ts";
import { SessionLog } from "./session-log.ts";
import type {
  ApprovedPlan,
  CaseAttemptRecord,
  CaseOutcome,
  CaseResult,
  StepObservation,
} from "./types.ts";

export type RunnerResult = {
  cases: CaseResult[];
  events: ReturnType<SessionLog["list"]>;
  session: SessionLog;
};

/**
 * Deterministic plan executor. Browser/wallet adapters supply StepObservation
 * rows; this module applies approved expectations, evidence gates, recovery,
 * and dependency rules without inventing passes.
 */
export function runPlanWithObservations(input: {
  plan: ApprovedPlan;
  observations: StepObservation[];
  session_id?: string;
  now?: () => string;
}): RunnerResult {
  const errors = validatePlanStructure(input.plan);
  if (errors.length) throw new Error(`Invalid plan: ${errors.join("; ")}`);
  const seenRows = new Set<string>();
  for (const row of input.observations) {
    const testCase = input.plan.cases.find(c => c.id === row.case_id);
    if (!testCase?.steps.some(s => s.id === row.step_id)) {
      throw new Error(`Unknown case/step: ${row.case_id}/${row.step_id}`);
    }
    if (!Number.isInteger(row.attempt) || row.attempt < 1 ||
        row.attempt > input.plan.limits.max_attempts_total_per_case) {
      throw new Error(`Invalid attempt: ${row.attempt}`);
    }
    const key = JSON.stringify([row.case_id, row.step_id, row.attempt]);
    if (seenRows.has(key)) throw new Error(`Duplicate step observation: ${key}`);
    seenRows.add(key);
  }
  const now = input.now ?? (() => new Date().toISOString());
  const session = new SessionLog(input.plan.job_id, input.session_id);
  const maxAttempts = input.plan.limits.max_attempts_total_per_case;
  const outcomes: Record<string, CaseOutcome> = {};
  const results: CaseResult[] = [];

  const byCase = groupObservations(input.observations);

  for (const testCase of orderCases(input.plan.cases)) {
    const dep = dependencyOutcomeAllowsRun(outcomes, testCase.depends_on);
    if (!dep.ok) {
      const event = session.append({
        job_id: input.plan.job_id,
        plan_version: input.plan.plan_version,
        timestamp: now(),
        case_id: testCase.id,
        step_id: null,
        attempt: null,
        actor: "runner",
        action: "case.result",
        details: {
          outcome: "NOT_RUN",
          depends_on: dep.blocking,
        },
        evidence_refs: [],
        session_id: session.session_id,
      });
      const result: CaseResult = {
        case_id: testCase.id,
        outcome: "NOT_RUN",
        attempts: 0,
        expected: testCase.steps.map((s) => s.expected).join("; "),
        observed: `Blocked by dependency: ${dep.blocking.join(", ")}`,
        cause_category: "missing_prerequisite",
        attribution_status: "supported_by_observation_human_review_available",
        event_ids: [event.event_id],
        evidence_refs: [],
        attempt_history: [],
      };
      results.push(result);
      outcomes[testCase.id] = "NOT_RUN";
      continue;
    }

    const caseObs = byCase.get(testCase.id) ?? [];
    const attemptHistory: CaseAttemptRecord[] = [];
    const eventIds: string[] = [];
    const evidenceRefs = new Set<string>();
    let finalOutcome: CaseOutcome = "INCONCLUSIVE";
    let finalExpected = testCase.steps.map((s) => s.expected).join("; ");
    let finalObserved = "No observations supplied";
    let cause = classifyCaseOutcome({
      assertion_met: false,
      evidence: evidencePresence(testCase.evidence, []),
      attempt: 0,
      max_attempts: maxAttempts,
      blocked: caseObs.length === 0,
      cause_category: caseObs.length === 0 ? "missing_prerequisite" : "unknown",
    });

    if (caseObs.length === 0) {
      const event = session.append({
        job_id: input.plan.job_id,
        plan_version: input.plan.plan_version,
        timestamp: now(),
        case_id: testCase.id,
        step_id: null,
        attempt: null,
        actor: "runner",
        action: "case.result",
        details: { outcome: "BLOCKED", reason: "no observations" },
        evidence_refs: [],
        session_id: session.session_id,
      });
      eventIds.push(event.event_id);
      finalOutcome = "BLOCKED";
    } else {
      const attempts = [...new Set(caseObs.map((o) => o.attempt))].sort(
        (a, b) => a - b,
      );
      let prior_recoverable_failures = 0;

      for (const attempt of attempts) {
        const stepRows = caseObs.filter((o) => o.attempt === attempt);
        const stepsComplete = testCase.steps.every(s => stepRows.some(o => o.step_id === s.id));
        const assertion_met = stepsComplete && stepRows.every((o) => o.assertion_met);
        const runner_error = stepRows.some((o) => o.runner_error);
        const blocked = stepRows.some((o) => o.blocked);
        const policy_violated = stepRows.some((o) => o.policy_violated);
        const recoverable = stepRows.some((o) => o.recoverable) || runner_error;
        const captured = stepRows.flatMap((o) => o.evidence_refs);
        for (const ref of captured) evidenceRefs.add(ref);
        const evidence = evidencePresence(testCase.evidence, captured);
        const observed = stepRows.map((o) => o.observed).join("; ");
        finalExpected = testCase.steps.map((s) => s.expected).join("; ");
        finalObserved = observed;

        const transactions = stepRows.flatMap(o => o.transaction ? [o.transaction] : []);
        const pending = transactions.find(tx => tx.status !== "success" && tx.status !== "failed")
          ?? transactions.at(-1);

        cause = classifyCaseOutcome({
          assertion_met,
          evidence,
          attempt,
          max_attempts: maxAttempts,
          prior_recoverable_failures,
          runner_error,
          blocked,
          policy_violated,
          recoverable: recoverable || !stepsComplete,
          cause_category: assertion_met
            ? null
            : runner_error
              ? "runner_automation"
              : blocked
                ? "missing_prerequisite"
                : "app_behavior",
        });

        const recovery = decideRecovery({
          attempt,
          max_attempts: maxAttempts,
          assertion_met: assertion_met && evidence.missing.length === 0 && !runner_error,
          recoverable,
          runner_error,
          blocked,
          policy_violated,
          conclusive_app_mismatch:
            stepsComplete && !assertion_met && !recoverable && !runner_error && !blocked,
          pending_transaction: pending,
        });

        if (recovery.action === "pause") {
          cause = { outcome: "BLOCKED", cause_category: "missing_prerequisite",
            attribution_status: "supported_by_observation_human_review_available" };
        }

        const record: CaseAttemptRecord = {
          attempt,
          outcome: cause.outcome,
          expected: finalExpected,
          observed,
          evidence,
          cause_category: cause.cause_category,
          stop_reason:
            recovery.action === "stop" || recovery.action === "pause"
              ? recovery.reason
              : undefined,
          recoverable,
          policy_violated,
          transaction: pending,
        };
        attemptHistory.push(record);

        for (const row of stepRows) {
          const ev = session.append({
            job_id: input.plan.job_id,
            plan_version: input.plan.plan_version,
            timestamp: now(),
            case_id: testCase.id,
            step_id: row.step_id,
            attempt,
            actor: "runner",
            action: "step.observed",
            details: {
              assertion_met: row.assertion_met,
              observed: row.observed,
              runner_error: row.runner_error ?? false,
              blocked: row.blocked ?? false,
            },
            evidence_refs: row.evidence_refs,
            session_id: session.session_id,
          });
          eventIds.push(ev.event_id);
        }

        finalOutcome = cause.outcome;
        // Recovery controls retries; it must not turn missing proof into an app defect.
        if (recovery.action === "retry" && (!assertion_met || runner_error)) {
          prior_recoverable_failures += 1;
          continue;
        }
        break;
      }

      const resultEvent = session.append({
        job_id: input.plan.job_id,
        plan_version: input.plan.plan_version,
        timestamp: now(),
        case_id: testCase.id,
        step_id: null,
        attempt: attemptHistory.at(-1)?.attempt ?? null,
        actor: "runner",
        action: "case.result",
        details: {
          outcome: finalOutcome,
          attempts: attemptHistory.length,
        },
        evidence_refs: [...evidenceRefs],
        session_id: session.session_id,
      });
      eventIds.push(resultEvent.event_id);
    }

    const result: CaseResult = {
      case_id: testCase.id,
      outcome: finalOutcome,
      attempts: attemptHistory.length,
      expected: finalExpected,
      observed: finalObserved,
      cause_category: cause.cause_category,
      attribution_status: cause.attribution_status,
      event_ids: eventIds,
      evidence_refs: [...evidenceRefs],
      attempt_history: attemptHistory,
    };
    results.push(result);
    outcomes[testCase.id] = finalOutcome;
  }

  return { cases: results, events: session.list(), session };
}

function groupObservations(
  observations: StepObservation[],
): Map<string, StepObservation[]> {
  const map = new Map<string, StepObservation[]>();
  for (const obs of observations) {
    const list = map.get(obs.case_id) ?? [];
    list.push(obs);
    map.set(obs.case_id, list);
  }
  return map;
}
