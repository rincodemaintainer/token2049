import { defineTool } from "eve/tools";
import { z } from "zod";
import { loadApprovedPlan } from "../lib/approved-plan-store.ts";
import { generateCypressSpec } from "../lib/cypress-script.ts";

export default defineTool({
  description:
    "Generate a plan-specific Cypress dApp assertion script from a buyer-approved plan artifact already persisted by the trusted host. This generates source only and never runs Cypress, opens a wallet, signs, or submits a transaction.",
  inputSchema: z.object({
    job_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    approved_plan_hash: z.string().regex(/^[a-f0-9]{64}$/),
    plan_version: z.number().int().positive(),
    assertions: z.array(z.object({
      case_id: z.string().min(1),
      selector: z.string().min(1),
      expected_text: z.string().min(1).optional(),
    })).min(1),
  }),
  async execute(input) {
    const plan = await loadApprovedPlan(input.job_id, input.plan_version);
    if (plan.approval!.approved_plan_hash !== input.approved_plan_hash) {
      throw new Error("Requested approved plan hash does not match the stored artifact");
    }
    return generateCypressSpec({
      plan,
      approved_plan_hash: input.approved_plan_hash,
      plan_version: input.plan_version,
      assertions: input.assertions,
    });
  },
});
