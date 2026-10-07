import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFixedQuote } from "./quote.ts";
import {
  essentialQuestions,
  mergeRequiredQuestions,
  swapJourneyQuestions,
} from "./questions.ts";
import {
  buildApprovedPlan,
  approvePlan,
  hashPlan,
  limitsFromChainPerformance,
  validatePlanStructure,
} from "./plan.ts";
import {
  assessDelivery,
  proposeReviewRemedy,
  hasAppDefect,
} from "./delivery.ts";
import { buildReport, artifactDigest } from "./report.ts";
import { runPlanWithObservations } from "./runner.ts";
import {
  buildSwapDemoPlan,
  swapDemoObservations,
} from "./fixtures/swap-demo.ts";
import type { CaseResult } from "./types.ts";

describe("quote", () => {
  it("publishes fixed fee with ~25% contingency", () => {
    const quote = buildFixedQuote({ base_fee_units: "12000000" });
    assert.equal(quote.contingency_percent, 25);
    assert.equal(quote.contingency_units, "3000000");
    assert.equal(quote.fixed_total_units, "15000000");
  });
});

describe("essential questions", () => {
  it("does not mark a complete required intake as blocked by optional candidates", () => {
    const qs = essentialQuestions({
      url: "https://app.example",
      goal: "Check the swap journey",
      chain: "Base Sepolia",
      chain_id: 84532,
      wallet: "MetaMask",
      transactions_permitted: true,
      budget_ceiling_units: "1000000",
      target_chain_performance_collected: true,
      confirmed: { expected_result: "Output balance increases after confirmation" },
    });
    assert.equal(qs.filter((q) => q.required).length, 0);
    assert.ok(qs.length > 0);
  });

  it("includes swap journey extras when fields are missing", () => {
    const qs = essentialQuestions(
      { url: null },
      swapJourneyQuestions({}),
    );
    assert.ok(qs.some((q) => q.field === "url"));
    assert.ok(qs.some((q) => q.field === "notification_timeout_seconds"));
    assert.ok(qs.length > 10);
    assert.ok(qs.every((q) => q.question.endsWith("?")));
  });

  it("asks for the chain ID and spend ceiling before a signed transaction plan", () => {
    const qs = essentialQuestions({
      chain: "Base Sepolia",
      transactions_permitted: true,
    });
    assert.ok(qs.some((q) => q.id === "Q-CHAIN"));
    assert.ok(qs.some((q) => q.id === "Q-SPEND-LIMIT"));
    assert.ok(!qs.some((q) => q.field === "target_chain_performance"));
  });

  it("does not accept invalid required answers or repeat a false access answer", () => {
    const qs = essentialQuestions({
      url: "  ",
      goal: "Check the swap",
      chain: "Base Sepolia",
      chain_id: 84532,
      wallet: "MetaMask",
      transactions_permitted: true,
      budget_ceiling_units: "-1",
      confirmed: { expected_result: true, access_prerequisites: false },
    });
    assert.ok(qs.some((q) => q.id === "Q-URL"));
    assert.ok(qs.some((q) => q.id === "Q-EXPECTED"));
    assert.ok(qs.some((q) => q.id === "Q-SPEND-LIMIT"));
    assert.ok(!qs.some((q) => q.id === "Q-ACCESS"));
  });

  it("keeps invalid swap answers open and carries custom required fields into later rounds", () => {
    const confirmed = {
      expected_result: "Output balance increases",
      input_token: "   ",
      output_token: "0xOutput",
      router_or_spender: " ",
      input_amount_units: -1,
      minimum_output_units: false,
      notification_timeout_seconds: 0,
    };
    const custom = {
      id: "Q-DEST",
      field: "destination_chain",
      question: "Which destination chain should receive the asset?",
      why_needed: "Needed to verify the bridge result",
      required: true,
      affected_case_ids: [],
    };
    const saved = mergeRequiredQuestions([custom], []);
    const qs = essentialQuestions({
      url: "https://app.example",
      goal: "Bridge a token",
      chain: "Base Sepolia",
      chain_id: 84532,
      wallet: "MetaMask",
      transactions_permitted: false,
      confirmed,
    }, [...swapJourneyQuestions(confirmed), ...saved]);
    for (const id of ["Q-TOKEN-IN", "Q-SPENDER", "Q-AMOUNT", "Q-MIN-OUT", "Q-NOTIFY", "Q-DEST"]) {
      assert.ok(qs.some((q) => q.id === id), `${id} must remain unanswered`);
    }
  });
});

describe("plan validation", () => {
  it("rejects cases without evidence or unknown requirements", () => {
    const errors = validatePlanStructure({
      schema_version: "0.1",
      job_id: "j",
      plan_version: 1,
      target: {
        url: "https://x",
        chain: "Base Sepolia",
        chain_id: 84532,
        wallet: "MetaMask",
      },
      requirements: [{ id: "REQ-A", text: "a" }],
      budgets: {
        service: buildFixedQuote({ base_fee_units: "1" }),
        testing: {},
      },
      limits: {
        max_attempts_total_per_case: 3,
        included_clarification_rounds: 2,
        case_timeout_seconds: 180,
        browser_active_seconds: 600,
        model_token_limit: 20000,
        paused_input_timeout_seconds: 300,
      },
      cases: [
        {
          id: "C1",
          requirement_id: "MISSING",
          priority: "critical",
          fixture: "f",
          depends_on: [],
          preconditions: [],
          steps: [],
          evidence: [],
        },
      ],
    });
    assert.ok(errors.some((e) => e.includes("unknown requirement")));
    assert.ok(errors.some((e) => e.includes("no steps")));
    assert.ok(errors.some((e) => e.includes("evidence")));
  });

  it("hashes an approved plan snapshot", () => {
    const draft = buildApprovedPlan({
      job_id: "j1",
      base_fee_units: "100",
      target: {
        url: "https://app.example",
        chain: "Base Sepolia",
        chain_id: 84532,
        wallet: "MetaMask",
      },
      requirements: [{ id: "R1", text: "connect" }],
      cases: [
        {
          id: "CONNECT-01",
          requirement_id: "R1",
          priority: "critical",
          fixture: "main",
          depends_on: [],
          preconditions: [],
          steps: [{ id: "C", action: "connect", expected: "account shown" }],
          evidence: ["trace"],
        },
      ],
    });
    const plan = approvePlan(draft, {
      requester_id: "buyer",
      approved_at: "2026-10-07T00:00:00Z",
    });
    assert.ok(plan.approval?.approved_plan_hash);
    assert.equal(hashPlan(plan), plan.approval?.approved_plan_hash);
  });

  it("uses only target-chain observations to relax wallet execution timeouts", () => {
    const limits = limitsFromChainPerformance({
      target: {
        chain: "Base Sepolia",
        chain_id: 84532,
        observed_at: "2026-10-07T00:00:00.000Z",
        source: "rpc-probe",
        rpc_latency_ms: 150,
        confirmation_wait_seconds: 240,
        wallet_interaction_buffer_seconds: 120,
      },
      payment: {
        chain: "Cardano Preprod",
        chain_id: 0,
        observed_at: "2026-10-07T00:00:00.000Z",
        source: "explorer",
        rpc_latency_ms: 200,
        confirmation_wait_seconds: 840,
        wallet_interaction_buffer_seconds: 120,
      },
    });
    assert.equal(limits.case_timeout_seconds, 420);
    assert.equal(limits.browser_active_seconds, 600);
  });

  it("rejects performance data collected from another target chain", () => {
    const errors = validatePlanStructure({
      schema_version: "0.1",
      job_id: "j",
      plan_version: 1,
      target: { url: "https://x", chain: "Base Sepolia", chain_id: 84532, wallet: "MetaMask" },
      requirements: [{ id: "R", text: "connect" }],
      budgets: { service: buildFixedQuote({ base_fee_units: "1" }), testing: {} },
      limits: { max_attempts_total_per_case: 1, included_clarification_rounds: 1, case_timeout_seconds: 180, browser_active_seconds: 600, model_token_limit: 1, paused_input_timeout_seconds: 1 },
      chain_performance: {
        target: { chain: "Other", chain_id: 1, observed_at: "2026-10-07T00:00:00.000Z", source: "rpc-probe", rpc_latency_ms: 1, confirmation_wait_seconds: 180, wallet_interaction_buffer_seconds: 120 },
      },
      cases: [{ id: "C", requirement_id: "R", priority: "critical", fixture: "f", depends_on: [], preconditions: [], steps: [{ id: "S", action: "connect", expected: "shown" }], evidence: ["trace"] }],
    });
    assert.ok(errors.some((error) => error.includes("performance")));
  });
});

describe("swap demo fixture end-to-end", () => {
  it("reproduces PASS swap, FAIL notification, PASS cancel", () => {
    const plan = buildSwapDemoPlan();
    const run = runPlanWithObservations({
      plan,
      observations: swapDemoObservations(),
    });
    const byId = Object.fromEntries(run.cases.map((c) => [c.case_id, c]));
    assert.equal(byId["SWAP-01"].outcome, "PASS");
    assert.equal(byId["NOTIFY-01"].outcome, "FAIL");
    assert.equal(byId["NOTIFY-01"].cause_category, "app_behavior");
    assert.equal(byId["CANCEL-01"].outcome, "PASS");
    assert.ok(run.events.length > 0);

    const artifacts = [
      ...new Set([
        ...run.cases.flatMap((c) => c.evidence_refs),
        "session-log",
      ]),
    ].map((id) => ({ id, path: id, sha256: artifactDigest(id) }));

    const report = buildReport({
      plan,
      cases: run.cases,
      artifacts,
      summary: "swap ok; notification missing; cancel ok",
    });
    assert.equal(report.delivery_complete, true);
    assert.ok(report.execution_bundle_hash);
    assert.equal(hasAppDefect(run.cases), true);

    const remedy = proposeReviewRemedy({
      delivery_complete: true,
      has_reproducible_app_defect: true,
      promised_critical_work_unexecuted: false,
      required_evidence_missing: false,
      inconclusive_attribution: false,
      new_requested_work: false,
    });
    assert.equal(remedy.remedy, "no_refund_testing_delivered");
  });

  it("marks dependent notify NOT_RUN when swap fails", () => {
    const plan = buildSwapDemoPlan();
    const observations = swapDemoObservations().map((o) =>
      o.case_id === "SWAP-01" && o.step_id === "SWAP"
        ? {
            ...o,
            assertion_met: false,
            observed: "swap reverted",
            recoverable: false,
          }
        : o,
    );
    // Drop notify observations to show dependency gate
    const withoutNotify = observations.filter((o) => o.case_id !== "NOTIFY-01");
    const run = runPlanWithObservations({ plan, observations: withoutNotify });
    const byId = Object.fromEntries(run.cases.map((c) => [c.case_id, c]));
    assert.equal(byId["SWAP-01"].outcome, "FAIL");
    assert.equal(byId["NOTIFY-01"].outcome, "NOT_RUN");
    assert.equal(byId["CANCEL-01"].outcome, "PASS");
  });

  it("flags incomplete delivery when critical evidence is missing", () => {
    const plan = buildSwapDemoPlan();
    const cases: CaseResult[] = [
      {
        case_id: "SWAP-01",
        outcome: "PASS",
        attempts: 1,
        expected: "swap",
        observed: "swap",
        cause_category: null,
        attribution_status: "not_applicable",
        event_ids: [],
        evidence_refs: ["trace"],
        attempt_history: [],
      },
      {
        case_id: "NOTIFY-01",
        outcome: "FAIL",
        attempts: 1,
        expected: "notify",
        observed: "missing",
        cause_category: "app_behavior",
        attribution_status: "supported_by_observation_human_review_available",
        event_ids: [],
        evidence_refs: ["notification-screenshot"],
        attempt_history: [],
      },
      {
        case_id: "CANCEL-01",
        outcome: "PASS",
        attempts: 1,
        expected: "cancel",
        observed: "cancel",
        cause_category: null,
        attribution_status: "not_applicable",
        event_ids: [],
        evidence_refs: ["cancel-recording"],
        attempt_history: [],
      },
    ];
    const delivery = assessDelivery({
      cases,
      plan,
      required_artifacts_present: false,
    });
    assert.equal(delivery.delivery_complete, false);
    assert.equal(delivery.refund_review_eligible, true);
  });
});

describe("flaky recovery path", () => {
  it("records FLAKY when a case passes after a recoverable failure", () => {
    const plan = buildApprovedPlan({
      job_id: "flaky-job",
      base_fee_units: "100",
      target: {
        url: "https://app.example",
        chain: "Base Sepolia",
        chain_id: 84532,
        wallet: "MetaMask",
      },
      requirements: [{ id: "R1", text: "connect" }],
      cases: [
        {
          id: "CONNECT-01",
          requirement_id: "R1",
          priority: "critical",
          fixture: "main",
          depends_on: [],
          preconditions: [],
          steps: [{ id: "C", action: "connect", expected: "connected" }],
          evidence: ["trace"],
        },
      ],
    });

    const run = runPlanWithObservations({
      plan,
      observations: [
        {
          case_id: "CONNECT-01",
          step_id: "C",
          attempt: 1,
          assertion_met: false,
          observed: "extension timeout",
          evidence_refs: ["trace"],
          recoverable: true,
          runner_error: true,
        },
        {
          case_id: "CONNECT-01",
          step_id: "C",
          attempt: 2,
          assertion_met: true,
          observed: "connected",
          evidence_refs: ["trace"],
        },
      ],
    });
    assert.equal(run.cases[0].outcome, "FLAKY");
    assert.equal(run.cases[0].attempts, 2);
  });
});
