import { createHash } from "node:crypto";
import { assessDelivery } from "./delivery.ts";
import type {
  ApprovedPlan,
  ArtifactManifestEntry,
  CaseResult,
  ResultReport,
} from "./types.ts";

export function buildReport(input: {
  plan: ApprovedPlan;
  cases: CaseResult[];
  artifacts: ArtifactManifestEntry[];
  summary?: string;
  payment_state?: string | null;
  approved_plan_hash?: string | null;
}): ResultReport {
  const delivery = assessReportDelivery(input);

  const report: ResultReport = {
    schema_version: "0.1",
    job_id: input.plan.job_id,
    plan_version: input.plan.plan_version,
    approved_plan_hash:
      input.approved_plan_hash ??
      input.plan.approval?.approved_plan_hash ??
      null,
    execution_bundle_hash: null,
    application_state: "report_ready",
    payment_state: input.payment_state ?? null,
    delivery_complete: delivery.delivery_complete,
    summary: input.summary ?? defaultSummary(input.cases),
    cases: structuredClone(input.cases),
    usage: {
      attempt_limit_total_per_case:
        input.plan.limits.max_attempts_total_per_case,
      clarification_rounds_used: null,
      service_fixed_fee_units: input.plan.budgets.service.fixed_total_units,
      asset: input.plan.budgets.service.asset,
      test_funds_accounted_separately: true,
      delivery_notes: delivery.reasons,
    },
    review: {
      human_reviewer_id: null,
      refund_request_deadline: null,
      require_live_protocol_deadline: true,
      decision: null,
      note: delivery.refund_review_eligible
        ? "Incomplete promised delivery may be eligible for human refund review."
        : "App defects do not alone imply failed QA delivery.",
    },
    artifacts: structuredClone(input.artifacts),
  };

  report.execution_bundle_hash = sealReport(report);
  return report;
}

function defaultSummary(cases: CaseResult[]): string {
  const parts = cases.map((c) => `${c.case_id}=${c.outcome}`);
  return parts.join("; ");
}

/**
 * Seal the execution bundle digest over stable report bytes.
 * Follow-ups must not mutate a sealed artifact; amend as a new version.
 */
export function sealReport(report: ResultReport): string {
  const { execution_bundle_hash: _ignored, ...rest } = report;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

export function artifactDigest(bytes: Uint8Array | string): string {
  const data = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
  return createHash("sha256").update(data).digest("hex");
}

/** References alone do not establish that evidence was delivered. */
export function assessReportDelivery(input: {
  plan: ApprovedPlan;
  cases: CaseResult[];
  artifacts: ArtifactManifestEntry[];
}) {
  const required = new Set([...input.plan.cases.flatMap(c => c.evidence), "session-log"]);
  const present = new Set(input.artifacts.filter(a =>
    a.path.trim() && a.sha256 && /^[a-f0-9]{64}$/i.test(a.sha256),
  ).map(a => a.id));
  return assessDelivery({ ...input, required_artifacts_present: [...required].every(id => present.has(id)) });
}
