import { createHash } from "node:crypto";
import { buildFixedQuote } from "./quote.ts";
import type {
  ApprovedPlan,
  ExecutionLimits,
  TestCase,
} from "./types.ts";

export const DEFAULT_LIMITS: ExecutionLimits = {
  max_attempts_total_per_case: 3,
  included_clarification_rounds: 2,
  case_timeout_seconds: 180,
  browser_active_seconds: 600,
  model_token_limit: 20000,
  paused_input_timeout_seconds: 300,
};

export type PlanDraftInput = {
  job_id: string;
  plan_version?: number;
  target: ApprovedPlan["target"];
  requirements: ApprovedPlan["requirements"];
  cases: TestCase[];
  base_fee_units: string;
  contingency_percent?: number;
  testing_budget?: ApprovedPlan["budgets"]["testing"];
  limits?: Partial<ExecutionLimits>;
  excluded_scope?: string[];
  requester_id?: string;
  approved_at?: string;
};

export function validatePlanStructure(plan: ApprovedPlan): string[] {
  const errors: string[] = [];
  const reqIds = new Set(plan.requirements.map((r) => r.id));
  const caseIds = new Set(plan.cases.map((c) => c.id));

  if (caseIds.size !== plan.cases.length) errors.push("duplicate case IDs");
  if (reqIds.size !== plan.requirements.length) errors.push("duplicate requirement IDs");
  if (!Number.isInteger(plan.limits.max_attempts_total_per_case) || plan.limits.max_attempts_total_per_case < 1) {
    errors.push("attempt limit must be a positive integer");
  }
  if (!plan.target.url) errors.push("target.url is required");
  if (!plan.target.chain_id) errors.push("target.chain_id is required");
  if (plan.cases.length === 0) errors.push("at least one case is required");

  for (const c of plan.cases) {
    if (new Set(c.steps.map(s => s.id)).size !== c.steps.length) errors.push(`duplicate step IDs in ${c.id}`);
    if (!reqIds.has(c.requirement_id)) {
      errors.push(`case ${c.id} references unknown requirement ${c.requirement_id}`);
    }
    if (c.steps.length === 0) errors.push(`case ${c.id} has no steps`);
    if (c.evidence.length === 0) {
      errors.push(`case ${c.id} must declare required evidence`);
    }
    for (const dep of c.depends_on) {
      if (!caseIds.has(dep)) {
        errors.push(`case ${c.id} depends on unknown case ${dep}`);
      }
    }
  }

  // Detect simple dependency cycles
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(plan.cases.map((c) => [c.id, c]));
  const visit = (id: string, stack: string[]) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      errors.push(`dependency cycle involving ${stack.join(" -> ")} -> ${id}`);
      return;
    }
    visiting.add(id);
    for (const dep of byId.get(id)?.depends_on ?? []) {
      visit(dep, [...stack, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const c of plan.cases) visit(c.id, []);

  return errors;
}

export function buildApprovedPlan(input: PlanDraftInput): ApprovedPlan {
  const service = buildFixedQuote({
    base_fee_units: input.base_fee_units,
    contingency_percent: input.contingency_percent,
  });

  const plan: ApprovedPlan = {
    schema_version: "0.1",
    job_id: input.job_id,
    plan_version: input.plan_version ?? 1,
    target: input.target,
    requirements: input.requirements,
    budgets: {
      service,
      testing: input.testing_budget ?? {},
    },
    limits: { ...DEFAULT_LIMITS, ...input.limits },
    deadlines: {
      require_live_masumi_timestamps: true,
    },
    approval: input.requester_id && input.approved_at
      ? {
          requester_id: input.requester_id,
          approved_at: input.approved_at,
          approved_plan_hash: null,
        }
      : undefined,
    cases: input.cases,
    evidence_policy: {
      record_all_attempts: true,
      structured_event_log: true,
      include_wallet_windows: true,
      omit_credentials_and_wallet_secrets: true,
      seal_before_result_submission: true,
    },
    refund_policy: {
      decision_maker: "human_operator",
      mvp_remedies: ["full_job_refund", "replacement_run"],
      partial_escrow_refund_supported: null,
    },
    excluded_scope: input.excluded_scope ?? [
      "mainnet",
      "other-wallets",
      "mobile-wallets",
      "whole-site-coverage",
      "external-agent-client",
      "telegram",
    ],
  };

  const errors = validatePlanStructure(plan);
  if (errors.length) {
    throw new Error(`Invalid plan: ${errors.join("; ")}`);
  }

  if (plan.approval) {
    plan.approval.approved_plan_hash = hashPlan(plan);
  }

  return plan;
}

export function hashPlan(plan: ApprovedPlan): string {
  const { approval, ...rest } = plan;
  const snapshot = {
    ...rest,
    approval: approval
      ? {
          requester_id: approval.requester_id,
          approved_at: approval.approved_at,
        }
      : undefined,
  };
  return createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");
}

/** Topological order of cases respecting depends_on. Independent cases stay runnable. */
export function orderCases(cases: TestCase[]): TestCase[] {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const ordered: TestCase[] = [];
  const seen = new Set<string>();

  const visit = (c: TestCase) => {
    if (seen.has(c.id)) return;
    for (const dep of c.depends_on) {
      const d = byId.get(dep);
      if (d) visit(d);
    }
    seen.add(c.id);
    ordered.push(c);
  };

  for (const c of cases) visit(c);
  return ordered;
}
