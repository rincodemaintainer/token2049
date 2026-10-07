import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import planTool from "../tools/build_test_plan.ts";
import commentaryTool from "../tools/draft_result_commentary.ts";
import cypressTool from "../tools/generate_cypress_spec.ts";
import { probeTargetChainPerformance } from "./chain-performance.ts";
import { persistApprovedPlan } from "./approved-plan-store.ts";
import { buildFixedQuote } from "./quote.ts";

const targetChainPerformance = {
  chain: "Base Sepolia",
  chain_id: 84532,
  observed_at: "2026-10-07T00:00:00.000Z",
  source: "rpc-probe" as const,
  rpc_latency_ms: 120,
  confirmation_wait_seconds: 180,
  wallet_interaction_buffer_seconds: 120,
};

it("swap template fixes the quote at 1 tUSDM without inventing buyer approval", async () => {
  const input = planTool.inputSchema.parse({ template: "swap_demo", job_id: "test", url: "https://test.example", chain: "Other test chain", chain_id: 123, wallet: "TestWallet", requester_id: "buyer", target_chain_performance: { ...targetChainPerformance, chain: "Other test chain", chain_id: 123 } });
  const result = await planTool.execute(input);
  assert.equal(result.plan.target.chain_id, 123);
  assert.equal(result.plan.target.wallet, "TestWallet");
  assert.equal(result.plan.target.domain, "test.example");
  assert.equal(result.quote.asset, "USDM");
  assert.equal(result.quote.base_fee_units, "1000000");
  assert.equal(result.quote.contingency_percent, 0);
  assert.equal(result.quote.contingency_units, "0");
  assert.equal(result.quote.fixed_total_units, "1000000");
  assert.equal(result.plan.approval, undefined);
});
it("model drafts commentary without packing authoritative results", async () => {
  const result = await commentaryTool.execute(commentaryTool.inputSchema.parse({ summary: "Observed run needs review." }));
  assert.equal(result.summary, "Observed run needs review.");
  assert.equal(result.schemaVersion, 1);
  assert.deepEqual(result.comments, []);
  assert.equal("cases" in result, false);
  assert.throws(() => commentaryTool.inputSchema.parse({ summary: "Claim", cases: [] }));
});
it("rejects negative fees and fractional contingency explicitly", () => {
  assert.throws(() => buildFixedQuote({ base_fee_units: "-1" }), /base_fee_units/);
  assert.throws(() => buildFixedQuote({ base_fee_units: "100", contingency_percent: 2.5 }), /contingency_percent/);
});
it("custom draft does not treat requester identity as approval", async () => {
  const { buildSwapDemoPlan } = await import("./fixtures/swap-demo.ts");
  const template = buildSwapDemoPlan();
  const result = await planTool.execute(planTool.inputSchema.parse({
    job_id: "draft", requester_id: "buyer", url: template.target.url,
    chain: template.target.chain, chain_id: template.target.chain_id,
    wallet: template.target.wallet, requirements: template.requirements, cases: template.cases,
    target_chain_performance: targetChainPerformance,
  }));
  assert.equal(result.plan.approval, undefined);
  assert.equal(result.quote.asset, "USDM");
  assert.equal(result.quote.fixed_total_units, "1000000");
  assert.equal(result.quote.contingency_units, "0");
});

it("rejects plan quote overrides", () => {
  const common = {
    template: "swap_demo" as const,
    job_id: "fixed-quote",
    url: "https://test.example",
    chain: "Base Sepolia",
    chain_id: 84532,
    wallet: "TestWallet",
    target_chain_performance: targetChainPerformance,
  };
  assert.throws(
    () => planTool.inputSchema.parse({ ...common, base_fee_units: "999999" }),
    /1000000/,
  );
  assert.throws(
    () => planTool.inputSchema.parse({ ...common, contingency_percent: 1 }),
    /0/,
  );
});

it("generates Cypress source only for an exact approved plan", async () => {
  const { buildSwapDemoPlan } = await import("./fixtures/swap-demo.ts");
  const plan = buildSwapDemoPlan();
  const approved_plan_hash = plan.approval!.approved_plan_hash!;
  await withApprovedPlanStore(async () => {
    await persistApprovedPlan(plan);
    const result = await cypressTool.execute(cypressTool.inputSchema.parse({
      job_id: plan.job_id,
      approved_plan_hash,
      plan_version: plan.plan_version,
      assertions: [{
        case_id: "NOTIFY-01",
        selector: '[data-qa="swap-success"]',
        expected_text: "Swap complete",
      }],
    }));
    assert.equal(result.filename, "web3lane-demo-job-001-v1.cy.ts");
    assert.match(result.source, /cy\.visit/);
    assert.match(result.source, /swap-success/);
    assert.match(result.source, /Wallet popups and signing are intentionally out of scope/);
  });
});

it("refuses Cypress generation without a stored artifact or matching hash", async () => {
  const { buildSwapDemoPlan } = await import("./fixtures/swap-demo.ts");
  const plan = buildSwapDemoPlan();
  await withApprovedPlanStore(async () => {
    const input = {
      job_id: plan.job_id,
      approved_plan_hash: plan.approval!.approved_plan_hash!,
      plan_version: plan.plan_version,
      assertions: [{ case_id: "NOTIFY-01", selector: "[data-qa=swap-success]" }],
    };
    await assert.rejects(() => cypressTool.execute(input), /No approved plan artifact/);
    await persistApprovedPlan(plan);
    await assert.rejects(
      () => cypressTool.execute({ ...input, approved_plan_hash: "0".repeat(64) }),
      /hash does not match/,
    );
  });
});

it("ignores forged plan JSON supplied to the model-exposed Cypress tool", async () => {
  const { buildSwapDemoPlan } = await import("./fixtures/swap-demo.ts");
  const plan = buildSwapDemoPlan();
  await withApprovedPlanStore(async () => {
    await persistApprovedPlan(plan);
    const parsed = cypressTool.inputSchema.parse({
      job_id: plan.job_id,
      approved_plan_hash: plan.approval!.approved_plan_hash,
      plan_version: plan.plan_version,
      assertions: [{ case_id: "NOTIFY-01", selector: "[data-qa=swap-success]" }],
      plan: { ...plan, limits: { ...plan.limits, case_timeout_seconds: 999 } },
    });
    const result = await cypressTool.execute(parsed);
    assert.match(result.source, /timeout: 360000/);
    assert.doesNotMatch(result.source, /999000/);
  });
});

it("samples recent target blocks to estimate a conservative confirmation wait", async () => {
  const observation = await probeTargetChainPerformance({
    rpc_url: "https://rpc.example",
    chain: "Base Sepolia",
    chain_id: 84532,
    wallet_interaction_buffer_seconds: 120,
    sample_size: 3,
    confirmations_required: 2,
    now: () => new Date("2026-10-07T00:00:00.000Z"),
    fetcher: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { method: string; params: string[] };
      if (request.method === "eth_chainId") return jsonRpc("0x14a34");
      if (request.method === "eth_blockNumber") return jsonRpc("0x64");
      const block = Number.parseInt(request.params[0], 16);
      return jsonRpc({ timestamp: `0x${(1_000 - (100 - block) * 12).toString(16)}` });
    },
  });
  assert.equal(observation.chain_id, 84532);
  assert.equal(observation.source, "rpc-probe");
  assert.equal(observation.block_interval_p95_seconds, 12);
  assert.equal(observation.confirmation_wait_seconds, 180);
  assert.equal(observation.confirmation_wait_source, "observed-block-p95");
});

it("uses a buyer-confirmed confirmation wait over the observed estimate", async () => {
  const observation = await probeTargetChainPerformance({
    rpc_url: "https://rpc.example",
    chain: "Base Sepolia",
    chain_id: 84532,
    wallet_interaction_buffer_seconds: 120,
    sample_size: 3,
    buyer_confirmed_confirmation_wait_seconds: 900,
    fetcher: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { method: string; params: string[] };
      if (request.method === "eth_chainId") return jsonRpc("0x14a34");
      if (request.method === "eth_blockNumber") return jsonRpc("0x64");
      const block = Number.parseInt(request.params[0], 16);
      return jsonRpc({ timestamp: `0x${(1_000 - (100 - block) * 12).toString(16)}` });
    },
  });
  assert.equal(observation.confirmation_wait_seconds, 900);
  assert.equal(observation.confirmation_wait_source, "buyer-confirmed");
});

function jsonRpc(result: unknown): Response {
  return new Response(JSON.stringify({ result }), { status: 200 });
}

async function withApprovedPlanStore(run: () => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "web3lane-approved-plan-"));
  const previous = process.env.WEB3LANE_APPROVED_PLAN_STORE;
  process.env.WEB3LANE_APPROVED_PLAN_STORE = directory;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.WEB3LANE_APPROVED_PLAN_STORE;
    else process.env.WEB3LANE_APPROVED_PLAN_STORE = previous;
    await rm(directory, { recursive: true, force: true });
  }
}
