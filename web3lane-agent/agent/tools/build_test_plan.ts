import { defineTool } from "eve/tools";
import { z } from "zod";
import { buildApprovedPlan, DEFAULT_LIMITS } from "../lib/plan.ts";
import { buildSwapDemoPlan } from "../lib/fixtures/swap-demo.ts";

const caseSchema = z.object({
  id: z.string(),
  requirement_id: z.string(),
  priority: z.enum(["critical", "high", "normal"]),
  fixture: z.string(),
  depends_on: z.array(z.string()).default([]),
  preconditions: z.array(z.string()),
  steps: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      expected: z.string(),
    }),
  ),
  evidence: z.array(z.string()).min(1),
});

const chainPerformanceSchema = z.object({
  chain: z.string().min(1),
  chain_id: z.number().int().positive(),
  observed_at: z.string().datetime(),
  source: z.enum(["rpc-probe", "explorer", "buyer-confirmed"]),
  rpc_latency_ms: z.number().nonnegative(),
  confirmation_wait_seconds: z.number().int().positive(),
  wallet_interaction_buffer_seconds: z.number().int().nonnegative(),
  sampled_block_count: z.number().int().positive().optional(),
  block_interval_p95_seconds: z.number().nonnegative().optional(),
  confirmation_wait_source: z.enum(["observed-block-p95", "buyer-confirmed"]).optional(),
  note: z.string().optional(),
});

export default defineTool({
  description:
    "Build a versioned, reviewable web3lane test plan with fixed quote, target-chain performance observations, result-focused execution limits, requirements, and cases. Use template 'swap_demo' for the standard Base Sepolia swap journey, or 'custom' with explicit cases. The plan freezes expectations before paid execution.",
  inputSchema: z.object({
    template: z.enum(["swap_demo", "custom"]).default("custom"),
    job_id: z.string().min(1),
    base_fee_units: z.string().default("12000000"),
    contingency_percent: z.number().default(25),
    url: z.string().url().or(z.string().min(1)),
    chain: z.string(),
    chain_id: z.number().int().positive(),
    wallet: z.string(),
    target_chain_performance: chainPerformanceSchema,
    payment_chain_performance: chainPerformanceSchema.optional(),
    wallet_address: z.string().nullable().optional(),
    router_address: z.string().nullable().optional(),
    domain: z.string().optional(),
    requirements: z
      .array(z.object({ id: z.string(), text: z.string() }))
      .optional(),
    cases: z.array(caseSchema).optional(),
    testing_budget: z.record(z.string(), z.unknown()).optional(),
  }),
  async execute(input) {
    if (input.template === "swap_demo") {
      const template = buildSwapDemoPlan();
      const plan = buildApprovedPlan({
        job_id: input.job_id,
        base_fee_units: input.base_fee_units,
        contingency_percent: input.contingency_percent,
        target: {
          url: ensureUrl(input.url),
          chain: input.chain,
          chain_id: input.chain_id,
          wallet: input.wallet,
          wallet_address: input.wallet_address ?? null,
          router_address: input.router_address ?? null,
          domain: input.domain ?? new URL(ensureUrl(input.url)).host,
        },
        requirements: template.requirements,
        cases: template.cases,
        testing_budget: (input.testing_budget ?? template.budgets.testing) as typeof template.budgets.testing,
        chain_performance: {
          target: input.target_chain_performance,
          payment: input.payment_chain_performance,
        },
      });
      return {
        plan,
        limits: plan.limits,
        quote: plan.budgets.service,
        note: "Swap is one journey template. Buyer must approve this exact plan version before escrow funding.",
      };
    }

    if (!input.requirements?.length || !input.cases?.length) {
      throw new Error(
        "custom template requires requirements and cases with explicit expected results",
      );
    }

    const plan = buildApprovedPlan({
      job_id: input.job_id,
      base_fee_units: input.base_fee_units,
      contingency_percent: input.contingency_percent,
      target: {
        url: input.url,
        chain: input.chain,
        chain_id: input.chain_id,
        wallet: input.wallet,
        wallet_address: input.wallet_address ?? null,
        router_address: input.router_address ?? null,
        domain: input.domain ?? new URL(ensureUrl(input.url)).host,
      },
      requirements: input.requirements,
      cases: input.cases,
      testing_budget: (input.testing_budget ?? {}) as Record<
        string,
        string | number | null | undefined
      >,
      chain_performance: {
        target: input.target_chain_performance,
        payment: input.payment_chain_performance,
      },
    });

    return {
      plan,
      limits: { ...DEFAULT_LIMITS, ...plan.limits },
      quote: plan.budgets.service,
      note: "Buyer must approve this exact plan version and quote before escrow funding and execution.",
    };
  },
});

function ensureUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://${url}`;
}
