import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  classifyCaseOutcome,
  evidencePresence,
} from "../lib/outcomes.ts";
import { decideRecovery } from "../lib/recovery.ts";

export default defineTool({
  description:
    "Classify a case outcome from approved expectations, observed evidence, and recovery state. Never label PASS when required proof is missing. Keeps outcome separate from cause and delivery completeness.",
  inputSchema: z.object({
    required_evidence: z.array(z.string()),
    captured_evidence: z.array(z.string()),
    assertion_met: z.boolean(),
    attempt: z.number().int().positive(),
    max_attempts: z.number().int().positive().default(3),
    prior_recoverable_failures: z.number().int().nonnegative().default(0),
    runner_error: z.boolean().optional(),
    blocked: z.boolean().optional(),
    policy_violated: z.boolean().optional(),
    recoverable: z.boolean().optional(),
    dependency_failed: z.boolean().optional(),
    conclusive_app_mismatch: z.boolean().optional(),
    pending_transaction_status: z
      .enum(["submitted", "pending", "success", "failed", "unknown"])
      .nullable()
      .optional(),
    pending_transaction_hash: z.string().nullable().optional(),
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
      .nullable()
      .optional(),
  }),
  async execute(input) {
    const evidence = evidencePresence(
      input.required_evidence,
      input.captured_evidence,
    );
    const classification = classifyCaseOutcome({
      assertion_met: input.assertion_met,
      evidence,
      attempt: input.attempt,
      max_attempts: input.max_attempts,
      prior_recoverable_failures: input.prior_recoverable_failures,
      runner_error: input.runner_error,
      blocked: input.blocked,
      policy_violated: input.policy_violated,
      recoverable: input.recoverable,
      dependency_failed: input.dependency_failed,
      cause_category: input.cause_category,
    });
    const recovery = decideRecovery({
      attempt: input.attempt,
      max_attempts: input.max_attempts,
      assertion_met: input.assertion_met && evidence.missing.length === 0,
      recoverable: Boolean(input.recoverable),
      runner_error: Boolean(input.runner_error),
      blocked: Boolean(input.blocked),
      policy_violated: Boolean(input.policy_violated),
      conclusive_app_mismatch: Boolean(input.conclusive_app_mismatch),
      pending_transaction:
        input.pending_transaction_hash || input.pending_transaction_status
          ? {
              hash: input.pending_transaction_hash,
              status: input.pending_transaction_status ?? "unknown",
            }
          : null,
    });
    return { evidence, classification, recovery };
  },
});
