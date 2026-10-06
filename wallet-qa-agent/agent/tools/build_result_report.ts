import { defineTool } from "eve/tools";
import { z } from "zod";
import { buildReport, assessReportDelivery } from "../lib/report.ts";
import { proposeReviewRemedy, hasAppDefect } from "../lib/delivery.ts";
import { buildSwapDemoPlan, swapDemoObservations } from "../lib/fixtures/swap-demo.ts";
import { runPlanWithObservations } from "../lib/runner.ts";
import type { ApprovedPlan, CaseResult, ArtifactManifestEntry } from "../lib/types.ts";

const caseResultSchema = z.object({
  case_id: z.string(),
  outcome: z.enum([
    "PASS",
    "FLAKY",
    "FAIL",
    "BLOCKED",
    "INCONCLUSIVE",
    "RUNNER_ERROR",
    "NOT_RUN",
  ]),
  attempts: z.number().int().nonnegative(),
  expected: z.string(),
  observed: z.string(),
  cause_category: z
    .enum([
      "app_behavior",
      "missing_prerequisite",
      "runner_automation",
      "external_dependency",
      "specification_gap",
      "policy_violation",
      "unknown",
    ])
    .nullable(),
  attribution_status: z.enum([
    "not_applicable",
    "supported_by_observation_human_review_available",
    "unknown",
    "human_decided",
  ]),
  event_ids: z.array(z.string()),
  evidence_refs: z.array(z.string()),
  attempt_history: z.array(z.unknown()).default([]),
});

export default defineTool({
  description:
    "Build a sealed Wallet QA result report from an approved plan and case results, or run the built-in swap demo observation fixture to produce the illustrative missing-notification report. Separates delivery completeness from app PASS/FAIL.",
  inputSchema: z.object({
    mode: z.enum(["from_results", "swap_demo_fixture"]).default("from_results"),
    plan: z.unknown().optional(),
    cases: z.array(caseResultSchema).optional(),
    artifacts: z
      .array(
        z.object({
          id: z.string(),
          path: z.string(),
          sha256: z.string().nullable(),
        }),
      )
      .optional(),
    summary: z.string().optional(),
    payment_state: z.string().nullable().optional(),
  }),
  async execute(input) {
    if (input.mode === "swap_demo_fixture") {
      const plan = buildSwapDemoPlan();
      const run = runPlanWithObservations({
        plan,
        observations: swapDemoObservations(),
        session_id: "demo-session-001",
        now: () => "2026-10-06T10:01:00Z",
      });
      const artifacts: ArtifactManifestEntry[] = [
        ...new Set(run.cases.flatMap((c) => c.evidence_refs)),
        "session-log",
      ].map((id) => ({
        id,
        path: `artifacts/${id}`,
        sha256: null,
      }));
      const report = buildReport({
        plan,
        cases: run.cases,
        artifacts,
        summary:
          "Finite approval and one swap succeeded. Approval cancellation recovered correctly. The confirmed swap did not produce the required success notification.",
        payment_state: "ResultSubmitted",
      });
      const delivery = assessReportDelivery({
        cases: run.cases,
        plan,
        artifacts,
      });
      const remedy = proposeReviewRemedy({
        delivery_complete: delivery.delivery_complete,
        has_reproducible_app_defect: hasAppDefect(run.cases),
        promised_critical_work_unexecuted: false,
        required_evidence_missing: !delivery.delivery_complete,
        inconclusive_attribution: false,
        new_requested_work: false,
      });
      return {
        report,
        delivery,
        remedy,
        event_count: run.events.length,
        note: "Fixture uses injected observations; it is not a live browser run.",
      };
    }

    if (!input.plan || !input.cases) {
      throw new Error("from_results mode requires plan and cases");
    }

    const plan = input.plan as ApprovedPlan;
    const cases = input.cases as CaseResult[];
    const artifacts = (input.artifacts ?? []) as ArtifactManifestEntry[];
    const report = buildReport({
      plan,
      cases,
      artifacts,
      summary: input.summary,
      payment_state: input.payment_state,
    });
    const delivery = assessReportDelivery({
      cases,
      plan,
      artifacts,
    });
    const remedy = proposeReviewRemedy({
      delivery_complete: delivery.delivery_complete,
      has_reproducible_app_defect: hasAppDefect(cases),
      promised_critical_work_unexecuted: delivery.reasons.some((r) =>
        r.includes("critical"),
      ),
      required_evidence_missing: delivery.reasons.some((r) =>
        r.includes("evidence"),
      ),
      inconclusive_attribution: cases.some(
        (c) => c.attribution_status === "unknown",
      ),
      new_requested_work: false,
    });
    return { report, delivery, remedy };
  },
});
