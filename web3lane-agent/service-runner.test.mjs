import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildSwapDemoPlan, swapDemoObservations } from './agent/lib/fixtures/swap-demo.ts';
import { persistApprovedPlan } from './agent/lib/approved-plan-store.ts';
import { paymentQuoteForPlan, x402QuoteForPlan } from './paid-finalization.mjs';
import { runPlanWithObservations } from './agent/lib/runner.ts';
import { assertRunnerSupports, createServiceRunner, loadTrustedRunnerAdapter } from './service-runner.mjs';

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'web3lane-runner-'));
  const oldData = process.env.WEB3LANE_DATA_ROOT;
  const oldPlans = process.env.WEB3LANE_APPROVED_PLAN_STORE;
  process.env.WEB3LANE_DATA_ROOT = join(root, 'data');
  process.env.WEB3LANE_APPROVED_PLAN_STORE = join(root, 'plans');
  try {
    const plan = buildSwapDemoPlan();
    await persistApprovedPlan(plan);
    const job = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', nonce: '1234567890abcd', inputHash: 'bound-input',
      phase: 'waiting-payment', input: { prompt: 'test', approved_job_id: plan.job_id, plan_version: plan.plan_version, approved_plan_hash: plan.approval.approved_plan_hash },
      payment: { blockchainIdentifier: 'escrow-1' }, quote: paymentQuoteForPlan(plan, 'registered-agent') };
    const payment = { inputHash: job.inputHash, agentIdentifier: job.quote.agentIdentifier, RequestedFunds: job.quote.RequestedFunds,
      PaymentSource: { network: 'Preprod' }, blockchainIdentifier: 'escrow-1', onChainState: 'FundsLocked',
      submitResultTime: Date.now() + 3_600_000, CurrentTransaction: { status: 'Confirmed', newOnChainState: 'FundsLocked' } };
    await run({ root, plan, job, payment });
  } finally {
    if (oldData === undefined) delete process.env.WEB3LANE_DATA_ROOT; else process.env.WEB3LANE_DATA_ROOT = oldData;
    if (oldPlans === undefined) delete process.env.WEB3LANE_APPROVED_PLAN_STORE; else process.env.WEB3LANE_APPROVED_PLAN_STORE = oldPlans;
    await rm(root, { recursive: true, force: true });
  }
}

const adapter = (run, supports = () => true) => ({ supports, run });

test('admission fails closed without a configured or supported adapter', async () => {
  const plan = buildSwapDemoPlan();
  await assert.rejects(assertRunnerSupports(plan), /not configured/);
  await assert.rejects(assertRunnerSupports(plan, { adapter: adapter(async () => {}, () => false) }), /does not support/);
});

test('operator adapter modules must be absolute and outside the data volume', async () => fixture(async ({ root, plan }) => {
  await assert.rejects(loadTrustedRunnerAdapter('adapter.mjs'), /absolute host path/);
  const inside = join(process.env.WEB3LANE_DATA_ROOT, 'adapter.mjs');
  await mkdir(process.env.WEB3LANE_DATA_ROOT, { recursive: true });
  await writeFile(inside, 'export default { supports: () => true, run: async () => ({}) }');
  await assert.rejects(loadTrustedRunnerAdapter(inside), /must not be loaded/);
  const hostModule = join(root, 'trusted-adapter.mjs');
  await writeFile(hostModule, 'export default { supports: () => true, run: async () => ({}) }');
  const loaded = await loadTrustedRunnerAdapter(hostModule);
  await assertRunnerSupports(plan, { adapter: loaded });
  const linked = join(root, 'linked-adapter.mjs');
  await symlink(inside, linked);
  await assert.rejects(loadTrustedRunnerAdapter(linked), /must not be loaded/);
}));

test('runner persists inspection state before a failed adapter and never reruns it', async () => fixture(async ({ job, payment }) => {
  let calls = 0;
  const runner = createServiceRunner({ adapter: adapter(async () => { calls++; throw new Error('browser interrupted'); }),
    getFunding: async () => ({ payment }) });
  await assert.rejects(runner.dispatch(job), /browser interrupted/);
  assert.equal(calls, 1);
  await assert.rejects(runner.dispatch(job), /needs-inspection/);
  assert.equal(calls, 1);
  const state = JSON.parse(await readFile(join(process.env.WEB3LANE_DATA_ROOT, 'runner-jobs', `${job.id}.json`), 'utf8'));
  assert.equal(state.status, 'needs-inspection');
}));

test('runner requires fresh funding before begin and rejects it before browser execution', async () => fixture(async ({ job, payment }) => {
  let adapterCalls = 0;
  const stale = { ...payment, CurrentTransaction: { status: 'Pending' } };
  const runner = createServiceRunner({ adapter: adapter(async () => { adapterCalls++; return {}; }),
    getFunding: async () => ({ payment: stale }) });
  await assert.rejects(runner.dispatch(job), /Execution requires confirmed FundsLocked/);
  assert.equal(adapterCalls, 0);
}));

test('runner reads funding again before recording and finalization', async () => fixture(async ({ job, payment }) => {
  let reads = 0;
  let adapterCalls = 0;
  const runner = createServiceRunner({ adapter: adapter(async () => { adapterCalls++; return {}; }),
    getFunding: async () => ({ payment: ++reads === 1 ? payment : { ...payment, onChainState: 'ResultSubmitted' } }) });
  await assert.rejects(runner.dispatch(job), /Execution requires confirmed FundsLocked/);
  assert.equal(reads, 2);
  assert.equal(adapterCalls, 1);
}));

function recordingFor({ job, plan, authorization, outputDir }) {
  return { payment_job_id: job.id, input_hash: job.inputHash,
    approved_job_id: plan.job_id, plan_version: plan.plan_version,
    approved_plan_hash: plan.approval.approved_plan_hash, bundle_dir: outputDir,
    started_at: authorization.started_at, recorded_at: new Date().toISOString(),
    session_id: authorization.session_id, observations: swapDemoObservations(),
    artifacts: [...new Set([...plan.cases.flatMap(item => item.evidence), 'session-log'])]
      .map(id => ({ id, path: `evidence/${id}`, sha256: 'a'.repeat(64), byte_size: 10 })) };
}

function verifiedBundle(plan, run) {
  const executionRecord = { schemaVersion: 1 };
  for (const key of ['payment_job_id', 'input_hash', 'approved_job_id', 'plan_version', 'approved_plan_hash', 'session_id', 'started_at', 'recorded_at', 'observations']) {
    executionRecord[key] = structuredClone(run[key]);
  }
  return { executionRecord,
    report: { caseResults: JSON.parse(JSON.stringify(runPlanWithObservations({ plan, observations: run.observations,
      session_id: run.session_id, now: () => run.recorded_at }).cases)),
    run: { startedAt: run.started_at, endedAt: run.recorded_at },
    job: { job_id: plan.job_id, plan_version: plan.plan_version, approved_plan_hash: plan.approval.approved_plan_hash } },
    manifestHash: 'b'.repeat(64),
    manifest: { files: run.artifacts.map(item => ({ path: item.path, sha256: item.sha256, bytes: item.byte_size })) } };
}

test('Masumi pipeline records and finalizes once without submitting an external payment', async () => fixture(async ({ job, payment, plan }) => {
  let recorded;
  const runner = createServiceRunner({
    adapter: adapter(async context => (recorded = recordingFor(context))),
    getFunding: async () => ({ payment }),
    verifyBundle: async () => verifiedBundle(plan, recorded),
  });
  const result = await runner.dispatch(job);
  assert.equal(result.resultHash.length, 64);
  assert.equal(job.phase, 'waiting-payment');
  assert.equal(job.result, undefined);
  const state = JSON.parse(await readFile(join(process.env.WEB3LANE_DATA_ROOT, 'runner-jobs', `${job.id}.json`), 'utf8'));
  assert.equal(state.status, 'complete');
  await assert.rejects(runner.dispatch(job), /complete; requires inspection/);
}));

test('x402 pipeline persists canonical authorization, recording, and completion', async () => fixture(async ({ job, plan }) => {
  const quote = x402QuoteForPlan(plan);
  const transaction = 'a'.repeat(64);
  let canonical = { ...structuredClone(job), paymentProtocol: 'x402', quote, phase: 'x402-ready', status: 'awaiting_execution', x402: {
    requirements: { scheme: 'exact', network: quote.network, amount: quote.amount, asset: quote.asset,
      payTo: 'addr_test1seller', extra: { confirmationPolicy: { l1Confirmations: 1 }, qa: { jobId: job.id,
        inputHash: job.inputHash, approvedJobId: job.input.approved_job_id, planVersion: job.input.plan_version,
        approvedPlanHash: job.input.approved_plan_hash } } }, transaction,
    settlement: { success: true, network: quote.network, transaction, extra: { status: 'confirmed', confirmations: 1 } } } };
  let recorded;
  let saves = 0;
  const runner = createServiceRunner({
    adapter: adapter(async context => (recorded = recordingFor(context))),
    getFunding: async () => ({ settlement: structuredClone(canonical.x402.settlement) }),
    loadJob: async id => { assert.equal(id, canonical.id); return structuredClone(canonical); },
    saveJob: async value => { saves++; canonical = structuredClone(value); },
    verifyBundle: async () => verifiedBundle(plan, recorded),
  });
  const result = await runner.dispatch(canonical);
  assert.equal(result.resultHash.length, 64);
  assert.equal(canonical.status, 'completed');
  assert.equal(canonical.phase, 'x402-complete');
  assert.equal(canonical.x402Execution.session_id, recorded.session_id);
  assert.deepEqual(canonical.x402RecordedRun, recorded);
  assert.equal(canonical.resultHash, result.resultHash);
  assert.ok(saves >= 3);
}));
