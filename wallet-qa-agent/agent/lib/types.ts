/** Shared Wallet QA domain types aligned with wallet-qa-handoff. */

export type ContextSource =
  | "user-confirmed"
  | "documented"
  | "observed"
  | "assumed";

export type CasePriority = "critical" | "high" | "normal";

export type CaseOutcome =
  | "PASS"
  | "FLAKY"
  | "FAIL"
  | "BLOCKED"
  | "INCONCLUSIVE"
  | "RUNNER_ERROR"
  | "NOT_RUN";

export type CauseCategory =
  | "app_behavior"
  | "missing_prerequisite"
  | "runner_automation"
  | "external_dependency"
  | "specification_gap"
  | "policy_violation"
  | "unknown";

export type AttributionStatus =
  | "not_applicable"
  | "supported_by_observation_human_review_available"
  | "unknown"
  | "human_decided";

export type ApplicationState =
  | "draft"
  | "inspecting"
  | "awaiting_clarification"
  | "plan_ready"
  | "awaiting_funding"
  | "running"
  | "paused"
  | "report_ready"
  | "under_human_review"
  | "closed"
  | "canceled";

export type Requirement = {
  id: string;
  text: string;
};

export type PlanStep = {
  id: string;
  action: string;
  expected: string;
};

export type TestCase = {
  id: string;
  requirement_id: string;
  priority: CasePriority;
  fixture: string;
  depends_on: string[];
  preconditions: string[];
  steps: PlanStep[];
  evidence: string[];
};

export type ServiceBudget = {
  network: string;
  asset: string;
  decimals: number;
  base_fee_units: string;
  contingency_percent: number;
  contingency_units: string;
  fixed_total_units: string;
};

export type TestingBudget = {
  max_native_gas_units?: string;
  max_successful_swaps?: number;
  allowance_type?: "finite" | "none";
  return_address?: string | null;
  [key: string]: string | number | null | undefined;
};

export type ExecutionLimits = {
  max_attempts_total_per_case: number;
  included_clarification_rounds: number;
  case_timeout_seconds: number;
  browser_active_seconds: number;
  model_token_limit: number;
  paused_input_timeout_seconds: number;
};

export type ApprovedPlan = {
  schema_version: string;
  job_id: string;
  plan_version: number;
  target: {
    url: string;
    build_id?: string | null;
    chain: string;
    chain_id: number;
    wallet: string;
    wallet_address?: string | null;
    router_address?: string | null;
    domain?: string | null;
    contracts?: Record<string, string | null | undefined>;
    tokens?: Record<
      string,
      { address?: string | null; decimals?: number; symbol?: string }
    >;
  };
  requirements: Requirement[];
  budgets: {
    service: ServiceBudget;
    testing: TestingBudget;
  };
  limits: ExecutionLimits;
  deadlines?: Record<string, string | boolean | null | undefined>;
  approval?: {
    requester_id: string;
    approved_at: string;
    approved_plan_hash?: string | null;
  };
  cases: TestCase[];
  evidence_policy?: Record<string, boolean | string | undefined>;
  refund_policy?: Record<string, unknown>;
  excluded_scope?: string[];
};

export type EssentialQuestion = {
  id: string;
  field: string;
  question: string;
  why_needed: string;
  options?: string[];
  required: boolean;
  affected_case_ids: string[];
  answer?: string | number | boolean | null;
  source?: ContextSource;
};

export type SessionEvent = {
  seq: number;
  event_id: string;
  job_id: string;
  plan_version: number;
  timestamp: string;
  case_id: string | null;
  step_id: string | null;
  attempt: number | null;
  actor: string;
  action: string;
  details: Record<string, unknown>;
  evidence_refs: string[];
  recording_offset_seconds?: number | null;
  recording_id?: string | null;
  session_id: string;
  usage_snapshot?: Record<string, unknown>;
};

export type EvidencePresence = {
  /** Required evidence IDs from the case that were actually captured. */
  present: string[];
  /** Required evidence IDs that are missing. */
  missing: string[];
};

export type CaseAttemptRecord = {
  attempt: number;
  outcome: CaseOutcome;
  expected: string;
  observed: string;
  evidence: EvidencePresence;
  cause_category?: CauseCategory | null;
  stop_reason?: string;
  recoverable?: boolean;
  policy_violated?: boolean;
  transaction?: {
    hash?: string | null;
    nonce?: number | null;
    status?: "submitted" | "pending" | "success" | "failed" | "unknown";
  };
};

export type CaseResult = {
  case_id: string;
  outcome: CaseOutcome;
  attempts: number;
  expected: string;
  observed: string;
  cause_category: CauseCategory | null;
  attribution_status: AttributionStatus;
  event_ids: string[];
  evidence_refs: string[];
  attempt_history: CaseAttemptRecord[];
};

export type ArtifactManifestEntry = {
  id: string;
  path: string;
  sha256: string | null;
  byte_size?: number | null;
  linked_case_ids?: string[];
};

export type ResultReport = {
  schema_version: string;
  job_id: string;
  plan_version: number;
  approved_plan_hash: string | null;
  execution_bundle_hash: string | null;
  application_state: ApplicationState;
  payment_state?: string | null;
  delivery_complete: boolean;
  summary: string;
  cases: CaseResult[];
  usage: Record<string, unknown>;
  review: {
    human_reviewer_id: string | null;
    refund_request_deadline: string | null;
    require_live_protocol_deadline: boolean;
    decision: string | null;
    note: string;
  };
  artifacts: ArtifactManifestEntry[];
};

export type SigningRequest = {
  chain_id: number;
  domain: string;
  action_type: "connect" | "approve" | "swap" | "sign" | "other";
  contract?: string | null;
  spender?: string | null;
  token_amount_units?: string | null;
  unlimited_approval?: boolean;
  gas_cap_units?: string | null;
  remaining_tx_count?: number;
};

export type SigningPolicy = {
  chain_id: number;
  allowed_domains: string[];
  allowed_contracts: string[];
  allowed_spenders: string[];
  allowed_action_types: SigningRequest["action_type"][];
  max_token_amount_units?: string | null;
  allow_unlimited_approval: boolean;
  max_gas_units?: string | null;
  max_transactions: number;
  transactions_used: number;
};

export type PreflightCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

export type StepObservation = {
  case_id: string;
  step_id: string;
  attempt: number;
  /** Whether the step's approved expectation was met. */
  assertion_met: boolean;
  observed: string;
  evidence_refs: string[];
  /** Infrastructure/browser failure rather than app mismatch. */
  runner_error?: boolean;
  /** Missing prerequisite discovered at runtime. */
  blocked?: boolean;
  /** Policy denied the action. */
  policy_violated?: boolean;
  /** Temporary failure eligible for retry. */
  recoverable?: boolean;
  transaction?: CaseAttemptRecord["transaction"];
};
