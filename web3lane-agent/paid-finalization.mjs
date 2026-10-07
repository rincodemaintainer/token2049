import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { loadApprovedPlan } from './agent/lib/approved-plan-store.ts';
import { assertExactApprovedPlan } from './agent/lib/cypress-script.ts';
import { runPlanWithObservations } from './agent/lib/runner.ts';
import { buildReport, sealReport } from './agent/lib/report.ts';
import { resultHash, sha256 } from './standard-hash.mjs';
import { createJsonOnce, serviceDataPath, writeJsonAtomic } from './service-storage.mjs';

const observation = z.object({
  case_id: z.string(), step_id: z.string(), attempt: z.number().int().positive(),
  assertion_met: z.boolean(), observed: z.string(), evidence_refs: z.array(z.string()),
  runner_error: z.boolean().optional(), blocked: z.boolean().optional(),
  policy_violated: z.boolean().optional(), recoverable: z.boolean().optional(),
  transaction: z.object({ hash: z.string().nullable().optional(), nonce: z.number().int().nullable().optional(),
    status: z.enum(['submitted','pending','success','failed','unknown']).optional() }).strict().optional(),
}).strict();
const recordedRun = z.object({
  payment_job_id: z.string(), input_hash: z.string(), approved_job_id: z.string(),
  plan_version: z.number().int().positive(), approved_plan_hash: z.string().regex(/^[a-f0-9]{64}$/),
  bundle_dir: z.string(), started_at: z.string().datetime(), recorded_at: z.string().datetime(), session_id: z.string().min(1),
  observations: z.array(observation).min(1),
  artifacts: z.array(z.object({id:z.string().min(1),path:z.string().min(1),sha256:z.string().regex(/^[a-f0-9]{64}$/),byte_size:z.number().int().nonnegative()}).strict()).min(1),
}).strict();
export const confirmedState = (payment, expected) =>
  (payment.CurrentTransaction?.status === 'Confirmed' && payment.CurrentTransaction?.newOnChainState === expected) ||
  payment.TransactionHistory?.some(tx => tx.status === 'Confirmed' && tx.newOnChainState === expected) || false;

const PREPROD_USDM = '16a55b2a349361ff88c03788f93e1e966e5d689605d044fef722ddde0014df10745553444d';
const X402_NETWORK = 'cardano:preprod';
export function paymentQuoteForPlan(plan, agentIdentifier) {
  const service = plan.budgets?.service;
  if (!service || !['Cardano preprod','Preprod'].includes(service.network) || service.decimals !== 6 ||
      !['tADA','USDM'].includes(service.asset) || !/^[1-9][0-9]*$/.test(service.fixed_total_units) ||
      typeof agentIdentifier !== 'string' || !agentIdentifier) {
    throw new Error('Unsupported approved service quote: require preprod tADA or USDM, 6 decimals, positive base units');
  }
  return { network:'Preprod', agentIdentifier,
    RequestedFunds:[{unit:service.asset === 'tADA' ? 'lovelace' : PREPROD_USDM,amount:service.fixed_total_units}] };
}
export function x402QuoteForPlan(plan) {
  const service = plan.budgets?.service;
  // Keep the approved plan's exact base-unit amount. x402 uses dotted
  // `policyId.assetNameHex`, while the legacy Masumi request uses one raw unit.
  if (!service || !['Cardano preprod','Preprod'].includes(service.network) || service.decimals !== 6 ||
      !['tADA','USDM'].includes(service.asset) || !/^[1-9][0-9]*$/.test(service.fixed_total_units)) {
    throw new Error('Unsupported approved service quote: require preprod tADA or USDM, 6 decimals, positive base units');
  }
  const rawUnit = service.asset === 'tADA' ? 'lovelace' : PREPROD_USDM;
  const asset = rawUnit === 'lovelace' ? rawUnit : `${rawUnit.slice(0,56)}.${rawUnit.slice(56)}`;
  return {network:X402_NETWORK,asset,amount:service.fixed_total_units};
}
export function assertPaymentQuote(payment,job) {
  const quote = job.quote;
  // MPS stores ADA as an empty unit, including requests sent as "lovelace".
  const unit = value => value === 'lovelace' ? '' : value;
  if (!quote || payment.inputHash !== job.inputHash || payment.agentIdentifier !== quote.agentIdentifier ||
      payment.PaymentSource?.network !== quote.network || payment.RequestedFunds?.length !== 1 ||
      unit(payment.RequestedFunds[0].unit) !== unit(quote.RequestedFunds[0].unit) ||
      payment.RequestedFunds[0].amount !== quote.RequestedFunds[0].amount) {
    throw new Error('Escrow quote, input hash, or agent differs from saved approved payment terms');
  }
}
export function assertEscrow(payment, job, now = Date.now()) {
  assertPaymentQuote(payment,job);
  if (payment.blockchainIdentifier !== job.payment?.blockchainIdentifier ||
      payment.onChainState !== 'FundsLocked' || !confirmedState(payment, 'FundsLocked')) {
    throw new Error('Execution requires confirmed FundsLocked for this payment');
  }
  if (!Number.isFinite(Number(payment.submitResultTime)) || Number(payment.submitResultTime) <= now + 120000) {
    throw new Error('Insufficient result submission time');
  }
}
export async function approvedPlanForJob(job) {
  const binding = job.input;
  if (!binding?.approved_job_id || !Number.isInteger(binding.plan_version) || !binding.approved_plan_hash) {
    throw new Error('Job has no approved plan binding');
  }
  const plan = await loadApprovedPlan(binding.approved_job_id, binding.plan_version);
  assertExactApprovedPlan(plan, binding.approved_plan_hash, binding.plan_version);
  if (job.quote) {
    const expected = job.paymentProtocol === 'x402'
      ? x402QuoteForPlan(plan)
      : paymentQuoteForPlan(plan,job.quote.agentIdentifier);
    if (JSON.stringify(expected) !== JSON.stringify(job.quote)) throw new Error('Saved quote differs from the approved service fee');
  }
  return plan;
}
const runPath = (directory, jobId) => {
  if (!/^[0-9a-f-]{36}$/.test(jobId)) throw new Error('Invalid payment job ID');
  return join(directory, `${jobId}.json`);
};
function assertRunBinding(run, job) {
  for (const [field, expected] of Object.entries({ payment_job_id: job.id, input_hash: job.inputHash,
    approved_job_id: job.input.approved_job_id, plan_version: job.input.plan_version,
    approved_plan_hash: job.input.approved_plan_hash })) {
    if (run[field] !== expected) throw new Error(`Recorded run ${field} does not match paid job`);
  }
}
export async function reserveApprovedExecution(job, directory = serviceDataPath('approved-executions')) {
  const key = sha256(JSON.stringify([job.input.approved_job_id,job.input.plan_version,job.input.approved_plan_hash]));
  await mkdir(directory,{recursive:true,mode:0o700});
  try { await createJsonOnce(join(directory,`${key}.json`),{payment_job_id:job.id,nonce_key:job.nonceKey,input_hash:job.inputHash}); }
  catch(error) { if(error.code !== 'EEXIST') throw error; throw new Error('Approved plan already reserved for a paid execution; inspect the existing job'); }
}
export async function beginPaidExecution({ job, payment, directory = serviceDataPath('recorded-runs'), now = Date.now() }) {
  assertEscrow(payment, job, now);
  const plan = await approvedPlanForJob(job);
  if (!Number.isFinite(Date.parse(plan.approval.approved_at)) || Date.parse(plan.approval.approved_at) > now) {
    throw new Error('Execution cannot precede plan approval');
  }
  const authorization = { payment_job_id:job.id, input_hash:job.inputHash,
    approved_job_id:job.input.approved_job_id, plan_version:job.input.plan_version,
    approved_plan_hash:job.input.approved_plan_hash, session_id:randomUUID(), started_at:new Date(now).toISOString(),
    blockchain_identifier:payment.blockchainIdentifier, escrow_state:'FundsLocked' };
  await mkdir(directory,{recursive:true,mode:0o700});
  const file = runPath(directory,job.id).replace('.json','-execution.json');
  try { await createJsonOnce(file,authorization); }
  catch (error) { if (error.code !== 'EEXIST') throw error; throw new Error('Execution already authorized; inspect before rerunning'); }
  return authorization;
}
async function requireExecutionAuthorization(run,job,directory,plan,payment,now=Date.now()) {
  const file = runPath(directory,job.id).replace('.json','-execution.json');
  const authorization = JSON.parse(await readFile(file,'utf8'));
  assertRunBinding(authorization,job);
  const approvalTime=Date.parse(plan.approval.approved_at), started=Date.parse(authorization.started_at), recorded=Date.parse(run.recorded_at);
  if (authorization.escrow_state !== 'FundsLocked' || authorization.blockchain_identifier !== job.payment.blockchainIdentifier ||
      authorization.session_id !== run.session_id || authorization.started_at !== run.started_at ||
      !Number.isFinite(approvalTime) || !Number.isFinite(started) || !Number.isFinite(recorded) ||
      approvalTime > started || started > recorded || recorded > now || recorded > Number(payment.submitResultTime)) {
    throw new Error('Recording must follow the host-authorized funded execution within its session, approval and deadline interval');
  }
  return authorization;
}
// Trusted host only. Not an Eve tool and never accepts paths from /start_job.
export async function registerRecordedRun({ job, payment, run, directory = serviceDataPath('recorded-runs'), now }) {
  assertEscrow(payment, job, now);
  const plan=await approvedPlanForJob(job);
  const record = recordedRun.parse(run);
  assertRunBinding(record, job);
  await requireExecutionAuthorization(record,job,directory,plan,payment,now);
  record.bundle_dir = resolve(record.bundle_dir);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = runPath(directory, job.id);
  try { await createJsonOnce(file,record); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if ((await readFile(file, 'utf8')) !== JSON.stringify(record)) throw new Error('Recorded run already exists; amendments require inspection');
  }
  return file;
}
export async function finalizeRecordedJob({ job, payment, verifyBundle, directory = serviceDataPath('recorded-runs'), now }) {
  assertEscrow(payment, job, now);
  const plan = await approvedPlanForJob(job);
  const run = recordedRun.parse(JSON.parse(await readFile(runPath(directory, job.id), 'utf8')));
  assertRunBinding(run, job);
  await requireExecutionAuthorization(run,job,directory,plan,payment,now);
  return finalizeVerifiedRecordedRun({job,plan,run,verifyBundle,now,paymentState:'FundsLocked'});
}
async function finalizeVerifiedRecordedRun({job,plan,run,verifyBundle,now,paymentState,directX402=false}) {
  const verified = await verifyBundle(run.bundle_dir);
  if (verified.report?.job?.job_id !== plan.job_id || verified.report.job.plan_version !== plan.plan_version ||
      verified.report.job.approved_plan_hash !== job.input.approved_plan_hash) {
    throw new Error('Evidence bundle is not bound to this approved plan');
  }
  const expectedRecord={schemaVersion:1};
  for(const key of ['payment_job_id','input_hash','approved_job_id','plan_version','approved_plan_hash','session_id','started_at','recorded_at','observations'])expectedRecord[key]=run[key];
  if(!isDeepStrictEqual(verified.executionRecord,expectedRecord)) throw new Error('Bundle execution record differs from trusted recorded observations');
  const bundleStart=Date.parse(verified.report.run?.startedAt), bundleEnd=Date.parse(verified.report.run?.endedAt);
  if(!Number.isFinite(bundleStart)||!Number.isFinite(bundleEnd)||bundleStart<Date.parse(run.started_at)||bundleEnd<bundleStart||bundleEnd>Date.parse(run.recorded_at)) {
    throw new Error('Bundle run timestamps fall outside authorized recorded execution');
  }
  const entries = verified.manifest.files;
  if (!Array.isArray(entries)) throw new Error('Invalid evidence manifest');
  if (new Set(run.artifacts.map(a => a.id)).size !== run.artifacts.length) throw new Error('Duplicate artifact ID');
  if (new Set(run.artifacts.map(a=>a.path)).size !== run.artifacts.length) throw new Error('Duplicate artifact path');
  for (const artifact of run.artifacts) {
    const entry = entries.find(item => item.path === artifact.path);
    if (!entry || entry.sha256 !== artifact.sha256 || entry.bytes !== artifact.byte_size) {
      throw new Error(`Recorded artifact not verified: ${artifact.id}`);
    }
  }
  const known = new Set(run.artifacts.map(a => a.id));
  if (run.observations.some(row => row.evidence_refs.some(id => !known.has(id)))) {
    throw new Error('Observation references unverified evidence');
  }
  if (run.observations.some(row => row.transaction && !['success','failed'].includes(row.transaction.status))) {
    throw new Error('Unknown transaction outcome requires inspection');
  }
  const execution = runPlanWithObservations({plan,observations:run.observations,session_id:run.session_id,now:()=>run.recorded_at});
  if (!isDeepStrictEqual(verified.report.caseResults,JSON.parse(JSON.stringify(execution.cases)))) {
    throw new Error('Bundle case results differ from the trusted execution assessment');
  }
  const report = buildReport({plan,cases:execution.cases,artifacts:run.artifacts,payment_state:paymentState});
  if (directX402) {
    report.review.require_live_protocol_deadline = false;
    report.review.note = 'Direct x402 payment settled. No automatic escrow refund is available.';
    report.execution_bundle_hash = sealReport(report);
  }
  if (!report.delivery_complete) throw new Error('Recorded delivery incomplete');
  const result = JSON.stringify({ schema_version: '1', payment_job_id: job.id, input_hash: job.inputHash,
    evidence_manifest_hash: verified.manifestHash, report });
  return {result, resultHash:resultHash(result,job.nonce), manifestHash:verified.manifestHash};
}

function assertX402Requirements(job) {
  const requirements = job.x402?.requirements;
  const qa = requirements?.extra?.qa;
  const paymentFlow = requirements?.paymentFlow ?? requirements?.extra?.paymentFlow;
  if (!requirements || requirements.scheme !== 'exact' || requirements.network !== X402_NETWORK ||
      requirements.amount !== job.quote?.amount || requirements.asset !== job.quote?.asset ||
      ![undefined,'default'].includes(requirements.extra?.assetTransferMethod) ||
      ![undefined,'authorization'].includes(paymentFlow) ||
      requirements.extra?.confirmationPolicy?.l1Confirmations !== 1 || !qa ||
      Object.keys(qa).sort().join(',') !== 'approvedJobId,approvedPlanHash,inputHash,jobId,planVersion' ||
      qa.jobId !== job.id || qa.inputHash !== job.inputHash || qa.approvedJobId !== job.input?.approved_job_id ||
      qa.planVersion !== job.input?.plan_version || qa.approvedPlanHash !== job.input?.approved_plan_hash) {
    throw new Error('x402 requirements differ from the approved direct-payment terms');
  }
}

/** Validate the persisted x402 receipt. This never queries or imitates Masumi. */
export function assertX402Settlement(job) {
  if (job.paymentProtocol !== 'x402' || !job.quote || job.quote.network !== X402_NETWORK) {
    throw new Error('Job is not a direct x402 payment');
  }
  assertX402Requirements(job);
  const transaction = job.x402?.transaction;
  const settlement = job.x402?.settlement;
  if (!/^[a-f0-9]{64}$/.test(transaction || '') || settlement?.success !== true ||
      settlement.network !== X402_NETWORK || settlement.transaction !== transaction ||
      (settlement.amount !== undefined && settlement.amount !== job.quote.amount) ||
      settlement.extra?.status !== 'confirmed' || !Number.isInteger(settlement.extra?.confirmations) ||
      settlement.extra.confirmations < 1) {
    throw new Error('Direct x402 payment requires a confirmed receipt for its canonical transaction');
  }
}

const x402ExecutionPath = (directory, jobId) => join(directory,`${jobId}-execution.json`);
async function readX402ExecutionAuthorization(job, directory) {
  const authorization = JSON.parse(await readFile(x402ExecutionPath(directory,job.id),'utf8'));
  if (!job.x402Execution || !isDeepStrictEqual(job.x402Execution,authorization)) {
    throw new Error('Saved direct x402 job differs from its canonical execution authorization');
  }
  return authorization;
}
function assertX402ExecutionAuthorization(run, job, plan, authorization, now = Date.now()) {
  assertRunBinding(authorization,job);
  const approvalTime = Date.parse(plan.approval.approved_at);
  const started = Date.parse(authorization.started_at);
  const recorded = Date.parse(run.recorded_at);
  if (authorization.payment_state !== 'x402-settled' || authorization.transaction !== job.x402.transaction ||
      authorization.session_id !== run.session_id || authorization.started_at !== run.started_at ||
      !Number.isFinite(approvalTime) || !Number.isFinite(started) || !Number.isFinite(recorded) ||
      approvalTime > started || started > recorded || recorded > now) {
    throw new Error('Recording must follow the host-authorized settled x402 execution within its session and approval interval');
  }
  return authorization;
}

export async function beginX402Execution({job,directory=serviceDataPath('x402-executions'),now=Date.now()}) {
  assertX402Settlement(job);
  if (job.phase !== 'x402-ready' || job.status !== 'awaiting_execution') {
    throw new Error('Direct x402 job is not ready for execution');
  }
  const plan = await approvedPlanForJob(job);
  if (!Number.isFinite(Date.parse(plan.approval.approved_at)) || Date.parse(plan.approval.approved_at) > now) {
    throw new Error('Execution cannot precede plan approval');
  }
  const authorization = {payment_job_id:job.id,input_hash:job.inputHash,
    approved_job_id:job.input.approved_job_id,plan_version:job.input.plan_version,
    approved_plan_hash:job.input.approved_plan_hash,session_id:randomUUID(),started_at:new Date(now).toISOString(),
    payment_state:'x402-settled',transaction:job.x402.transaction};
  await mkdir(directory,{recursive:true,mode:0o700});
  try { await createJsonOnce(x402ExecutionPath(directory,job.id),authorization); }
  catch (error) { if (error.code !== 'EEXIST') throw error; throw new Error('Execution already authorized; inspect before rerunning'); }
  job.x402Execution = authorization;
  job.phase = 'x402-executing';
  job.status = 'running';
  return authorization;
}

export async function registerX402RecordedRun({job,run,directory=serviceDataPath('x402-executions'),now=Date.now()}) {
  assertX402Settlement(job);
  const plan = await approvedPlanForJob(job);
  const record = recordedRun.parse(run);
  assertRunBinding(record,job);
  const authorization = await readX402ExecutionAuthorization(job,directory);
  assertX402ExecutionAuthorization(record,job,plan,authorization,now);
  record.bundle_dir = resolve(record.bundle_dir);
  if (job.x402RecordedRun && !isDeepStrictEqual(job.x402RecordedRun,record)) {
    throw new Error('Recorded run already exists; amendments require inspection');
  }
  job.x402RecordedRun = record;
  return record;
}

export async function finalizeX402RecordedJob({job,verifyBundle,directory=serviceDataPath('x402-executions'),now=Date.now()}) {
  assertX402Settlement(job);
  const plan = await approvedPlanForJob(job);
  const run = recordedRun.parse(job.x402RecordedRun);
  assertRunBinding(run,job);
  const authorization = await readX402ExecutionAuthorization(job,directory);
  assertX402ExecutionAuthorization(run,job,plan,authorization,now);
  return finalizeVerifiedRecordedRun({job,plan,run,verifyBundle,now,paymentState:'x402-settled',directX402:true});
}

export async function saveX402Job(file, job) {
  const target = resolve(file);
  await writeJsonAtomic(target,job);
  return target;
}
// Save the pending transition before the external write. Unknown outcomes never replay.
export async function submitRecordedResult({ job, payment, finalize, save, submit }) {
  if (job.phase !== 'waiting-payment') return false;
  const finalized = await finalize();
  assertEscrow(payment, job);
  job.result = finalized.result; job.resultHash = finalized.resultHash;
  job.evidenceManifestHash = finalized.manifestHash; job.phase = 'submit-pending'; job.status = 'running';
  await save(job);
  await submit({network:'Preprod',blockchainIdentifier:payment.blockchainIdentifier,submitResultHash:job.resultHash});
  job.phase = 'awaiting-result'; await save(job);
  return true;
}
