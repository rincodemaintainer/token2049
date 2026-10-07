import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { buildSwapDemoPlan } from '../agent/lib/fixtures/swap-demo.ts';
import { approvePlan } from '../agent/lib/plan.ts';
import { persistApprovedPlan } from '../agent/lib/approved-plan-store.ts';
import { beginPaidExecution, registerRecordedRun, finalizeRecordedJob, paymentQuoteForPlan } from '../paid-finalization.mjs';
import { inputHash } from '../standard-hash.mjs';
import { verifyEvidenceBundle } from './evidence-bundle.mjs';

async function writeFixture(name) {
  const directory = `.local/${name}-fixture-${process.pid}`;
  const startedAt = '2026-10-07T01:00:00.000Z';
  const wallet = '0x6Ba7c2Cb493834d922028EE7B2c33aB99b0c6210';
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/report.json`, JSON.stringify({ suites: [{ specs: [{ tests: [{ results: [{ status: 'failed', startTime: startedAt, duration: 1_000, attachments: [], errors: [{ message: 'Timed out.' }] }] }] }] }] }));
  await writeFile(`${directory}/swap-result.json`, JSON.stringify({ amountQms: '0.01', minimumUsdcRaw: '9414', wallet }));
  await writeFile(`${directory}/swap-recovery.json`, JSON.stringify({ verifiedAt: '2026-10-07T01:01:00.000Z', amountQms: '0.01', minimumUsdcRaw: '9414', from: wallet, status: 'pending' }));
  await writeFile(`${directory}/error-context.md`, 'Timed out.');
  return { directory, input: { schemaVersion: 1, title: 'Evidence fixture', report: `${directory}/report.json`, runDirectory: directory, recovery: `${directory}/swap-recovery.json`, recordings: [], trace: null } };
}

async function rejectsRunnerLog(path, name) {
  const config = `.local/${name}-${process.pid}.json`;
  const { directory, input } = await writeFixture(name);
  try {
    await writeFile(config, JSON.stringify({ ...input, runnerLog: path }));
    const run = spawnSync(process.execPath, ['scripts/build-evidence-report.mjs', config, `${directory}/export`], { encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Unexpected evidence source|Unsafe evidence source/);
  } finally {
    await rm(config, { force: true });
    await rm(directory, { recursive: true, force: true });
  }
}

test('rejects an env file as a log', async () => {
  await rejectsRunnerLog('.env', 'reject-env');
});

test('rejects a symlink from the log allowlist to an env file', async () => {
  const link = `.local/runner-leak-${process.pid}.log`;
  await symlink('../.env', link);
  try { await rejectsRunnerLog(link, 'reject-link'); }
  finally { await rm(link, { force: true }); }
});

test('labels an unreconciled failed run inconclusive without claiming a retry outcome', async () => {
  const directory = `.local/verdict-fixture-${process.pid}`;
  const config = `.local/verdict-fixture-${process.pid}.json`;
  const startedAt = '2026-10-07T01:00:00.000Z';
  const wallet = '0x6Ba7c2Cb493834d922028EE7B2c33aB99b0c6210';
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/report.json`, JSON.stringify({ suites: [{ specs: [{ tests: [{ results: [{ status: 'failed', startTime: startedAt, duration: 1_000, attachments: [], errors: [{ message: 'Timed out.' }] }] }] }] }] }));
    await writeFile(`${directory}/swap-result.json`, JSON.stringify({ amountQms: '0.01', minimumUsdcRaw: '9414', wallet }));
    await writeFile(`${directory}/swap-recovery.json`, JSON.stringify({ verifiedAt: '2026-10-07T01:01:00.000Z', amountQms: '0.01', minimumUsdcRaw: '9414', from: wallet, status: 'pending' }));
    await writeFile(`${directory}/error-context.md`, 'Timed out.');
    await writeFile(config, JSON.stringify({ schemaVersion: 1, title: 'Verdict fixture', report: `${directory}/report.json`, runDirectory: directory, recovery: `${directory}/swap-recovery.json`, recordings: [], trace: null }));
    const run = spawnSync(process.execPath, ['scripts/build-evidence-report.mjs', config, `${directory}/export`], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(await readFile(`${directory}/export/report-data.json`, 'utf8'));
    assert.equal(report.verdict.label, 'INCONCLUSIVE');
    assert.equal(report.verdict.facts.find(fact => fact.label === 'Chain').value, 'Unverified');
    assert.equal(report.verdict.facts.find(fact => fact.label === 'Retry').value, 'Not recorded');
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(config, { force: true });
  }
});

test('separates a confirmed chain transaction from a failed browser case', async () => {
  const config = `.local/confirmed-verdict-fixture-${process.pid}.json`;
  const { directory, input } = await writeFixture('confirmed-verdict');
  try {
    await writeFile(`${directory}/swap-recovery.json`, JSON.stringify({ verifiedAt: '2026-10-07T01:01:00.000Z', amountQms: '0.01', minimumUsdcRaw: '9414', from: '0x6Ba7c2Cb493834d922028EE7B2c33aB99b0c6210', status: 'confirmed-on-explorer', block: 59097, receivedUsdc: '0.009915' }));
    await writeFile(`${directory}/explorer-confirmed.png`, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1nAAAAABJRU5ErkJggg==', 'base64'));
    await writeFile(`${directory}/explorer-confirmed.txt`, 'Confirmed in block 59097.');
    await writeFile(config, JSON.stringify(input));
    const run = spawnSync(process.execPath, ['scripts/build-evidence-report.mjs', config, `${directory}/export`], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(await readFile(`${directory}/export/report-data.json`, 'utf8'));
    assert.equal(report.verdict.label, 'INCONCLUSIVE');
    assert.equal(report.verdict.facts.find(fact => fact.label === 'Chain').value, 'Settled');
    assert.equal(report.verdict.facts.find(fact => fact.label === 'App').value, 'Success not observed');
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(config, { force: true });
  }
});

test('packs a Playwright recording from a runner artifact directory', async () => {
  const { directory, input } = await writeFixture('runner-artifact');
  const config = `${directory}/input.json`;
  try {
    await mkdir(`${directory}/attachments`, { recursive: true });
    const recording = resolve(`${directory}/attachments/recording-1-test.webm`);
    await writeFile(recording, 'webm fixture');
    const report = JSON.parse(await readFile(input.report, 'utf8'));
    report.suites[0].specs[0].tests[0].results[0].attachments = [{ name: 'recording-1', path: recording }];
    await writeFile(input.report, JSON.stringify(report));
    await writeFile(config, JSON.stringify(input));
    const run = spawnSync(process.execPath, ['scripts/build-evidence-report.mjs', config, `${directory}/export`], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const packed = JSON.parse(await readFile(`${directory}/export/report-data.json`, 'utf8'));
    assert.equal(packed.media.recordings.length, 1);
    assert.equal(packed.media.recordings[0].path, 'recordings/recording-1.webm');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('binds report data to an exact approved plan artifact when supplied', async () => {
  const config = `.local/bound-verdict-fixture-${process.pid}.json`;
  const planDirectory = '.local/approved-plans';
  const planPath = `${planDirectory}/bound-verdict-plan-${process.pid}.json`;
  const { directory, input } = await writeFixture('bound-verdict');
  try {
    await mkdir(planDirectory, { recursive: true });
    const plan = { schema_version: '0.1', job_id: 'job-123', plan_version: 2, target: { url: 'https://example.test' }, approval: { requester_id: 'buyer-1', approved_at: '2026-10-07T00:00:00.000Z', approved_plan_hash: null } };
    const { approval, ...rest } = plan;
    plan.approval.approved_plan_hash = createHash('sha256').update(JSON.stringify({ ...rest, approval: { requester_id: approval.requester_id, approved_at: approval.approved_at } })).digest('hex');
    await writeFile(planPath, JSON.stringify(plan));
    await writeFile(config, JSON.stringify({ ...input, approvedPlan: planPath }));
    const run = spawnSync(process.execPath, ['scripts/build-evidence-report.mjs', config, `${directory}/export`], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(await readFile(`${directory}/export/report-data.json`, 'utf8'));
    assert.deepEqual(report.job, { binding_state: 'bound', job_id: 'job-123', plan_version: 2, approved_plan_hash: plan.approval.approved_plan_hash, approved_plan_artifact: 'logs/approved-plan.json', detail: 'The supplied plan matches its recorded approval hash; buyer identity is not independently verified by this export.' });
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(config, { force: true });
    await rm(planPath, { force: true });
  }
});

test('packs optional commentary without changing the recorded outcome', async () => {
  const { directory, input } = await writeFixture('commentary');
  const config = `${directory}/input.json`;
  try {
    const commentary = { schemaVersion: 1, author: 'QA agent', createdAt: '2026-10-07T02:00:00Z', summary: 'Review the browser failure.', comments: [{ section: 'run', text: '<script>plain text only</script>' }] };
    await writeFile(`${directory}/commentary.json`, JSON.stringify(commentary));
    await writeFile(config, JSON.stringify({ ...input, agentCommentary: `${directory}/commentary.json` }));
    const run = spawnSync(process.execPath, ['scripts/build-evidence-report.mjs', config, `${directory}/export`], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(await readFile(`${directory}/export/report-data.json`, 'utf8'));
    assert.deepEqual(report.agentCommentary, commentary);
    assert.equal(report.run.status, 'failed');
    assert.equal(report.verdict.label, 'INCONCLUSIVE');
    assert.ok(report.files.some(file => file.path === 'logs/agent-commentary.json'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('rejects ambiguous multi-attempt reports instead of selecting one result', async () => {
  const { directory, input } = await writeFixture('multi-attempt');
  const config = `${directory}/input.json`;
  try {
    const report = JSON.parse(await readFile(input.report, 'utf8'));
    report.suites[0].specs[0].tests[0].results.push({ status: 'passed', attachments: [] });
    await writeFile(input.report, JSON.stringify(report));
    await writeFile(config, JSON.stringify(input));
    const run = spawnSync(process.execPath, ['scripts/build-evidence-report.mjs', config, `${directory}/export`], { encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /exactly one recorded test attempt/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('recorded files pack, verify and finalize a bound paid delivery without model output', async () => {
  const { directory, input } = await writeFixture('bound-integration');
  const planDirectory = `.local/approved-plans/integration-${process.pid}`;
  const previousStore = process.env.WEB3LANE_APPROVED_PLAN_STORE;
  process.env.WEB3LANE_APPROVED_PLAN_STORE = resolve(planDirectory);
  try {
    const now = Date.now();
    const draft = buildSwapDemoPlan({ job_id: 'recorded-integration' });
    draft.approval = null;
    draft.cases = [{ id: 'BROWSER-01', requirement_id: 'REQ-SWAP', priority: 'critical', fixture: 'recorded-browser', depends_on: [], preconditions: [], steps: [{ id: 'ASSERT', action: 'Check recorded assertion', expected: 'Assertion passes' }], evidence: ['browser-log'] }];
    const plan = approvePlan(draft, { requester_id: 'fixture-buyer', approved_at: new Date(now - 10000).toISOString() });
    await persistApprovedPlan(plan);
    const job = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', nonce: '1234567890abcdef', input: { prompt: 'Recorded test', approved_job_id: plan.job_id, plan_version: plan.plan_version, approved_plan_hash: plan.approval.approved_plan_hash }, payment: { blockchainIdentifier: 'fixture-escrow' } };
    job.inputHash = inputHash(job.input, job.nonce);
    job.quote = paymentQuoteForPlan(plan, 'fixture-agent');
    const payment = { inputHash: job.inputHash, agentIdentifier: job.quote.agentIdentifier, RequestedFunds: job.quote.RequestedFunds, PaymentSource: { network: 'Preprod' }, blockchainIdentifier: 'fixture-escrow', onChainState: 'FundsLocked', submitResultTime: now + 600000, CurrentTransaction: { status: 'Confirmed', newOnChainState: 'FundsLocked' } };
    const authorization = await beginPaidExecution({ job, payment, directory, now: now - 5000 });
    const record = { schemaVersion: 1, payment_job_id: job.id, input_hash: job.inputHash, approved_job_id: plan.job_id, plan_version: plan.plan_version, approved_plan_hash: plan.approval.approved_plan_hash, session_id: authorization.session_id, started_at: authorization.started_at, recorded_at: new Date(now - 1000).toISOString(), observations: [{ case_id: 'BROWSER-01', step_id: 'ASSERT', attempt: 1, assertion_met: false, observed: 'Recorded browser assertion failed', evidence_refs: ['browser-log'], recoverable: false }] };
    await writeFile(`${directory}/execution.json`, JSON.stringify(record));
    const raw = JSON.parse(await readFile(input.report, 'utf8'));
    raw.suites[0].specs[0].tests[0].results[0].startTime = new Date(now - 4000).toISOString();
    // Browser/chain success must not override a failed buyer-approved assertion.
    raw.suites[0].specs[0].tests[0].results[0].status = 'passed';
    await writeFile(input.report, JSON.stringify(raw));
    const recovery = JSON.parse(await readFile(input.recovery, 'utf8'));
    recovery.verifiedAt = new Date(now - 2000).toISOString();
    recovery.status = 'confirmed-on-explorer';
    recovery.block = 59097;
    recovery.receivedUsdc = '0.009915';
    await writeFile(input.recovery, JSON.stringify(recovery));
    await writeFile(`${directory}/explorer-confirmed.png`, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1nAAAAABJRU5ErkJggg==', 'base64'));
    await writeFile(`${directory}/explorer-confirmed.txt`, 'Synthetic confirmation');
    const config = `${directory}/input.json`;
    await writeFile(config, JSON.stringify({ ...input, approvedPlan: `${planDirectory}/${plan.job_id}.json`, executionRecord: `${directory}/execution.json` }));
    const packed = spawnSync(process.execPath, ['scripts/build-evidence-report.mjs', config, `${directory}/export`], { encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr);
    const bundle = await verifyEvidenceBundle(`${directory}/export`);
    assert.deepEqual(bundle.executionRecord, record);
    assert.equal(bundle.report.run.status, 'passed');
    assert.equal(bundle.report.verdict.label, 'FAIL');
    const artifacts = [['browser-log', 'logs/playwright-swap.json'], ['session-log', 'logs/execution-record.json']].map(([id, path]) => {
      const entry = bundle.manifest.files.find(file => file.path === path);
      return { id, path, sha256: entry.sha256, byte_size: entry.bytes };
    });
    const { schemaVersion, ...run } = record;
    await registerRecordedRun({ job, payment, directory, run: { ...run, bundle_dir: `${directory}/export`, artifacts } });
    const finalized = await finalizeRecordedJob({ job, payment, directory, verifyBundle: verifyEvidenceBundle });
    const report = JSON.parse(finalized.result).report;
    assert.equal(report.delivery_complete, true);
    assert.equal(report.cases[0].outcome, 'FAIL');
    assert.deepEqual(report.cases, bundle.report.caseResults);
    await writeFile(`${directory}/export/logs/playwright-swap.json`, '{}');
    await assert.rejects(finalizeRecordedJob({ job, payment, directory, verifyBundle: verifyEvidenceBundle }), /digest mismatch/);
  } finally {
    if (previousStore === undefined) delete process.env.WEB3LANE_APPROVED_PLAN_STORE;
    else process.env.WEB3LANE_APPROVED_PLAN_STORE = previousStore;
    await rm(directory, { recursive: true, force: true });
    await rm(planDirectory, { recursive: true, force: true });
  }
});
