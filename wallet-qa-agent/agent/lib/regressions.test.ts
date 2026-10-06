import assert from "node:assert/strict";
import { it } from "node:test";
import { buildSwapDemoPlan, swapDemoObservations } from "./fixtures/swap-demo.ts";
import { runPlanWithObservations } from "./runner.ts";
import { buildReport, artifactDigest } from "./report.ts";
import { validatePlanStructure } from "./plan.ts";

it("requires every planned step, even when evidence names are complete", () => {
  const plan = buildSwapDemoPlan();
  const observations = swapDemoObservations().filter(o => o.step_id !== "CONNECT");
  const run = runPlanWithObservations({ plan, observations });
  assert.equal(run.cases[0].outcome, "INCONCLUSIVE");
});
it("missing success evidence is inconclusive, not an app failure", () => {
  const plan = buildSwapDemoPlan();
  const observations = swapDemoObservations().map(o => ({ ...o, evidence_refs: [] }));
  assert.equal(runPlanWithObservations({ plan, observations }).cases[0].outcome, "INCONCLUSIVE");
});
it("does not erase runner errors when assertions happen to be true", () => {
  const plan = buildSwapDemoPlan();
  const observations = swapDemoObservations().map(o => ({ ...o, runner_error: true }));
  assert.equal(runPlanWithObservations({ plan, observations }).cases[0].outcome, "RUNNER_ERROR");
});
it("checks all transactions, including an unresolved swap after a successful approval", () => {
  const plan = buildSwapDemoPlan();
  const observations = swapDemoObservations().map(o => o.step_id === "SWAP" ? {
    ...o, transaction: { hash: "0xswap", status: "pending" as const },
  } : o);
  assert.equal(runPlanWithObservations({ plan, observations }).cases[0].outcome, "BLOCKED");
});
it("rejects observations outside the attempt budget and unknown steps", () => {
  const plan = buildSwapDemoPlan();
  assert.throws(() => runPlanWithObservations({ plan, observations: swapDemoObservations().map(o => ({ ...o, attempt: 4 })) }), /attempt/i);
  assert.throws(() => runPlanWithObservations({ plan, observations: swapDemoObservations().map(o => ({ ...o, step_id: "bogus" })) }), /step/i);
});
it("does not borrow evidence from a failed attempt to pass a later attempt", () => {
  const plan = buildSwapDemoPlan();
  const first = swapDemoObservations().filter(o => o.case_id === "SWAP-01");
  const observations = [
    ...first.map(o => ({ ...o, assertion_met: false, recoverable: true, transaction: undefined })),
    ...first.map(o => ({ ...o, attempt: 2, evidence_refs: [] })),
  ];
  assert.equal(runPlanWithObservations({ plan, observations }).cases[0].outcome, "INCONCLUSIVE");
});
it("requires actual hashed artifact manifest entries, not just references", () => {
  const plan = buildSwapDemoPlan();
  const run = runPlanWithObservations({ plan, observations: swapDemoObservations() });
  assert.equal(buildReport({ plan, cases: run.cases, artifacts: [{ id: "session-log", path: "log", sha256: artifactDigest("log") }] }).delivery_complete, false);
  const artifacts = [...new Set([...run.cases.flatMap(c => c.evidence_refs), "session-log"])].map(id => ({ id, path: id, sha256: null }));
  assert.equal(buildReport({ plan, cases: run.cases, artifacts }).delivery_complete, false);
});
it("rejects duplicate plan case IDs and cyclic execution", () => {
  const plan = buildSwapDemoPlan();
  plan.cases.push(plan.cases[0]);
  assert.ok(validatePlanStructure(plan).some(e => /duplicate/i.test(e)));
  const cyclic = buildSwapDemoPlan();
  cyclic.cases[0].depends_on = ["NOTIFY-01"];
  assert.throws(() => runPlanWithObservations({ plan: cyclic, observations: [] }), /cycle/i);
});
it("pending transaction blocks attempt history as well as the final result", () => {
  const plan = buildSwapDemoPlan();
  const observations = swapDemoObservations().map(o => o.step_id === "SWAP" ? { ...o, transaction: { status: "unknown" as const } } : o);
  const result = runPlanWithObservations({ plan, observations }).cases[0];
  assert.equal(result.attempt_history[0].outcome, result.outcome);
});
it("sealed report is independent of later changes to supplied results", () => {
  const plan = buildSwapDemoPlan();
  const run = runPlanWithObservations({ plan, observations: swapDemoObservations() });
  const report = buildReport({ plan, cases: run.cases, artifacts: [] });
  run.cases[0].observed = "modified";
  assert.notEqual(report.cases[0].observed, "modified");
});
