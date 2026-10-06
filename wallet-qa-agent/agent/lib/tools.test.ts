import assert from "node:assert/strict";
import { it } from "node:test";
import planTool from "../tools/build_test_plan.ts";
import reportTool from "../tools/build_result_report.ts";
import { buildFixedQuote } from "./quote.ts";

it("template respects supplied target and quote without inventing buyer approval", async () => {
  const input = planTool.inputSchema.parse({ template: "swap_demo", job_id: "test", url: "https://test.example", chain: "Other test chain", chain_id: 123, wallet: "TestWallet", base_fee_units: "100", contingency_percent: 10, requester_id: "buyer" });
  const result = await planTool.execute(input);
  assert.equal(result.plan.target.chain_id, 123);
  assert.equal(result.plan.target.wallet, "TestWallet");
  assert.equal(result.plan.target.domain, "test.example");
  assert.equal(result.quote.fixed_total_units, "110");
  assert.equal(result.plan.approval, undefined);
});
it("fixture report and delivery assessment agree that synthetic artifacts are incomplete", async () => {
  const result = await reportTool.execute(reportTool.inputSchema.parse({ mode: "swap_demo_fixture" }));
  assert.equal(result.report.delivery_complete, false);
  assert.equal(result.delivery.delivery_complete, result.report.delivery_complete);
  assert.equal(result.remedy.remedy, "human_review_required");
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
  }));
  assert.equal(result.plan.approval, undefined);
});
