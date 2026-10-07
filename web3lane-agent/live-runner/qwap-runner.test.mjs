import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { QWAP, artifactsFromManifest, createTrustedRunnerAdapter, qwapPlanDefinition, signingPolicyFor, supportsQwapPlan, waitForRpcConfirmation } from './qwap-runner.mjs';

function plan() {
  const definition = qwapPlanDefinition();
  return {
    schema_version: '0.1', job_id: 'qwap-demo', plan_version: 1,
    approval: { approved_plan_hash: 'a'.repeat(64) },
    target: { url: QWAP.url, chain_id: QWAP.chainId, wallet: QWAP.wallet, domain: QWAP.domain,
      wallet_address: QWAP.walletAddress, router_address: QWAP.router,
      tokens: { QMS: { address: QWAP.inputToken, decimals: 18 }, USDC: { address: QWAP.outputToken, decimals: 6 } } },
    requirements: definition.requirements, budgets: { testing: definition.testing_budget },
    limits: { max_attempts_total_per_case: 1 },
    cases: [definition.test_case],
  };
}

function context(outputDir) {
  const approved = plan();
  return { outputDir, plan: approved, job: { id: 'payment-id', inputHash: 'input-hash' }, authorization: {
    payment_job_id: 'payment-id', input_hash: 'input-hash', approved_job_id: approved.job_id, plan_version: approved.plan_version,
    approved_plan_hash: approved.approval.approved_plan_hash, session_id: 'session-id', started_at: '2026-10-07T12:00:00.000Z', escrow_state: 'FundsLocked',
  } };
}

test('supports only the fixed one-attempt Qwap journey and ceilings', () => {
  const approved = plan();
  assert.equal(supportsQwapPlan(approved), true);
  const reordered = structuredClone(approved);
  reordered.budgets.testing = Object.fromEntries(Object.entries(reordered.budgets.testing).reverse());
  reordered.cases[0].steps[0] = Object.fromEntries(Object.entries(reordered.cases[0].steps[0]).reverse());
  assert.equal(supportsQwapPlan(reordered), true);
  for (const mutate of [
    item => { item.target.chain_id = 1; },
    item => { item.budgets.testing.qwap_native_value_units = '1'; },
    item => { item.budgets.testing.max_successful_swaps = 2; },
    item => { item.limits.max_attempts_total_per_case = 2; },
    item => { item.cases[0].steps.push({ id: 'APPROVE' }); },
    item => { item.cases[0].steps[2].expected = 'Any successful transaction'; },
    item => { item.requirements[0].text = 'Swap some tokens'; },
    item => { item.cases[0].preconditions.push('An unrelated requirement'); },
  ]) {
    const changed = structuredClone(approved);
    mutate(changed);
    assert.equal(supportsQwapPlan(changed), false);
  }
});

test('derives the immutable signing policy from the approved plan', () => {
  assert.deepEqual(signingPolicyFor(plan()), {
    wallet_address: QWAP.walletAddress, domain: QWAP.domain, chain_id: 19480, router_address: QWAP.router,
    input_token: QWAP.inputToken, output_token: QWAP.outputToken, value: QWAP.value,
    minimum_output_units: QWAP.minimumOutput, gas_limit: QWAP.gasLimit,
    max_fee_per_gas: QWAP.maxFeePerGas, max_total_fee_wei: QWAP.maxGasUnits, max_deadline_seconds: 1200,
  });
});

test('writes a 0600 host context then launches exactly one Playwright attempt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qwap-runner-'));
  const output = join(root, '.local', 'runner-artifacts', 'payment-id');
  const calls = [];
  const adapter = createTrustedRunnerAdapter({ projectRoot: root, now: () => '2026-10-07T12:01:00.000Z', exec: async (...args) => {
    calls.push(args);
    if (calls.length !== 1) return { stdout: '' };
    const env = args[2].env;
    const saved = JSON.parse(await readFile(env.WEB3LANE_RUN_CONTEXT_FILE, 'utf8'));
    assert.equal(saved.schemaVersion, 1);
    assert.equal(saved.signingPolicy.value, QWAP.value);
    await mkdir(join(output, 'playwright'), { recursive: true });
    return { stdout: JSON.stringify({ suites: [{ specs: [{ tests: [{ results: [{ status: 'failed' }] }] }] }] }) };
  } });
  try {
    await assert.rejects(adapter.run(context(output)), /Expected exactly one submitted.json/);
    assert.equal(calls.length, 1);
    assert.match(calls[0][1].join(' '), /playwright test/);
    const contextFile = join(output, 'run-context.json');
    assert.equal((await stat(contextFile)).mode & 0o777, 0o600);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('requires distinct, manifest-backed evidence paths', () => {
  const paths = ['recordings/recording-1.webm', 'assets/wallet-transaction.png', 'logs/swap-recovery.json', 'logs/rpc-proof.json', 'logs/execution-record.json', 'logs/playwright-swap.json'];
  const artifacts = artifactsFromManifest({ files: paths.map((path, index) => ({ path, sha256: `${index}`.repeat(64), bytes: index })) });
  assert.deepEqual(artifacts.map(item => item.id), QWAP.evidence);
  assert.throws(() => artifactsFromManifest({ files: [] }), /missing/);
});

test('polls read-only RPC until a submitted transaction has a receipt', async () => {
  let calls = 0;
  const client = {
    getTransaction: async () => ({ hash: '0xabc' }),
    getTransactionReceipt: async () => { if (++calls < 3) throw new Error('not indexed'); return { status: 'success' }; },
  };
  const received = await waitForRpcConfirmation({ client, hash: '0xabc', attempts: 3, sleep: async () => {} });
  assert.equal(received.receipt.status, 'success');
  await assert.rejects(waitForRpcConfirmation({ client: { getTransaction: async () => { throw new Error('missing'); }, getTransactionReceipt: async () => ({}) }, hash: '0xabc', attempts: 1 }), /timed out; requires inspection/);
});
