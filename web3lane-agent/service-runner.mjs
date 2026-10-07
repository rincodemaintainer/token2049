import { mkdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertEscrow,
  assertX402Settlement,
  approvedPlanForJob,
  beginPaidExecution,
  beginX402Execution,
  finalizeRecordedJob,
  finalizeX402RecordedJob,
  registerRecordedRun,
  registerX402RecordedRun,
} from './paid-finalization.mjs';
import { verifyEvidenceBundle } from './scripts/evidence-bundle.mjs';
import { createJsonOnce, serviceDataPath, serviceDataRoot, writeJsonAtomic } from './service-storage.mjs';

const jobIdPattern = /^[0-9a-f-]{36}$/;

function adapterError(message) {
  return new Error(`Trusted runner adapter ${message}`);
}

/**
 * Load only an operator-configured module. This function deliberately accepts
 * no buyer/job input: a job can choose neither code nor an executable path.
 */
export async function loadTrustedRunnerAdapter(modulePath) {
  if (typeof modulePath !== 'string' || !isAbsolute(modulePath)) {
    throw adapterError('must be an absolute host path');
  }
  const file = await realpath(resolve(modulePath));
  await mkdir(serviceDataRoot(), { recursive: true, mode: 0o700 });
  const root = await realpath(serviceDataRoot());
  const rel = relative(root, file);
  if (!rel || (rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`))) {
    throw adapterError('must not be loaded from the service data volume');
  }
  if (!(await stat(file)).isFile()) throw adapterError('must be a file');
  const candidate = (await import(pathToFileURL(file).href)).default;
  return validateAdapter(candidate);
}

function validateAdapter(adapter) {
  if (!adapter || typeof adapter.supports !== 'function' || typeof adapter.run !== 'function') {
    throw adapterError('must export supports(plan) and run(context)');
  }
  return Object.freeze(adapter);
}

/** Admission gate for a new paid job. This must run before a checkout is issued. */
export async function assertRunnerSupports(plan, { adapter } = {}) {
  if (!adapter) throw adapterError('is not configured');
  validateAdapter(adapter);
  if (await adapter.supports(plan) !== true) {
    throw adapterError('does not support this approved plan');
  }
}

function immutableJson(value) {
  let copy;
  try { copy = JSON.parse(JSON.stringify(value)); }
  catch { throw new Error('Trusted runner returned a non-JSON recorded run'); }
  const freeze = item => {
    if (item && typeof item === 'object' && !Object.isFrozen(item)) {
      for (const value of Object.values(item)) freeze(value);
      Object.freeze(item);
    }
    return item;
  };
  return freeze(copy);
}

function errorDetail(error) {
  return String(error?.message ?? error).replace(/[\r\n]+/g, ' ').slice(0, 500);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function assertJob(job) {
  if (!job || !jobIdPattern.test(job.id ?? '') || typeof job.inputHash !== 'string') {
    throw new Error('Runner requires a persisted payment job with a UUID and input hash');
  }
}

/**
 * A single-host durable dispatcher. It never resumes a queued/running job
 * after a restart: a human must inspect it, preventing a second wallet click.
 * `getFunding` is called immediately before begin, record, and finalization.
 * It supplies a current trusted payment record; this module does not query a
 * blockchain or facilitator itself.
 */
export function createServiceRunner({
  adapter,
  getFunding,
  loadJob,
  saveJob,
  verifyBundle = verifyEvidenceBundle,
  dataPath = serviceDataPath,
  writeState = writeJsonAtomic,
  createState = createJsonOnce,
  now = () => new Date().toISOString(),
} = {}) {
  validateAdapter(adapter);
  if (typeof getFunding !== 'function') throw new Error('Trusted runner requires getFunding(job)');
  let queue = Promise.resolve();
  const statePath = job => dataPath('runner-jobs', `${job.id}.json`);

  async function canonicalX402Job(snapshot) {
    if (typeof loadJob !== 'function' || typeof saveJob !== 'function') {
      throw new Error('Trusted x402 runner requires canonical loadJob and saveJob callbacks');
    }
    const current = await loadJob(snapshot.id);
    assertJob(current);
    for (const key of ['id', 'inputHash']) {
      if (current[key] !== snapshot[key]) throw new Error('Canonical x402 job binding changed; requires inspection');
    }
    for (const key of ['approved_job_id', 'plan_version', 'approved_plan_hash']) {
      if (current.input?.[key] !== snapshot.input?.[key]) {
        throw new Error('Canonical x402 approved-plan binding changed; requires inspection');
      }
    }
    return current;
  }

  async function currentFunding(job) {
    const funding = await getFunding(job);
    if (job.paymentProtocol === 'x402') {
      const settlement = funding?.settlement;
      if (!settlement || typeof settlement !== 'object') throw new Error('Fresh x402 settlement is required');
      job.x402 = { ...job.x402, settlement };
      assertX402Settlement(job);
      return { kind: 'x402' };
    }
    const payment = funding?.payment;
    if (!payment || typeof payment !== 'object') throw new Error('Fresh escrow payment state is required');
    assertEscrow(payment, job);
    return { kind: 'masumi', payment };
  }

  async function execute(job, file) {
    const state = { job_id: job.id, input_hash: job.inputHash, status: 'running', started_at: now() };
    await writeState(file, state); // durable before any browser or wallet action
    try {
      await assertRunnerSupports(await approvedPlanForJob(job), { adapter });
      let activeJob = job.paymentProtocol === 'x402' ? await canonicalX402Job(job) : job;
      const plan = await approvedPlanForJob(activeJob);
      const beforeBegin = await currentFunding(activeJob);
      const authorization = beforeBegin.kind === 'x402'
        ? await beginX402Execution({ job: activeJob })
        : await beginPaidExecution({ job: activeJob, payment: beforeBegin.payment });
      if (beforeBegin.kind === 'x402') await saveJob(activeJob);
      const outputDir = dataPath('runner-artifacts', activeJob.id);
      await mkdir(outputDir, { recursive: true, mode: 0o700 });
      const recordedRun = immutableJson(await adapter.run({ job: activeJob, plan, authorization, outputDir }));
      let registeredRun = recordedRun;
      if (activeJob.paymentProtocol === 'x402') activeJob = await canonicalX402Job(activeJob);
      const beforeRecord = await currentFunding(activeJob);
      if (beforeRecord.kind === 'x402') {
        registeredRun = await registerX402RecordedRun({ job: activeJob, run: recordedRun });
        await saveJob(activeJob);
      } else {
        await registerRecordedRun({ job: activeJob, payment: beforeRecord.payment, run: recordedRun });
      }
      if (activeJob.paymentProtocol === 'x402') activeJob = await canonicalX402Job(activeJob);
      const beforeFinalize = await currentFunding(activeJob);
      const finalized = beforeFinalize.kind === 'x402'
        ? await finalizeX402RecordedJob({ job: activeJob, verifyBundle })
        : await finalizeRecordedJob({ job: activeJob, payment: beforeFinalize.payment, verifyBundle });
      if (beforeFinalize.kind === 'x402') {
        // Checkout/status traffic may have persisted a newer copy while the
        // browser ran. Only add completion fields to that canonical copy.
        const latest = await canonicalX402Job(activeJob);
        if (latest.x402Execution?.session_id !== authorization.session_id ||
            JSON.stringify(latest.x402RecordedRun) !== JSON.stringify(registeredRun)) {
          throw new Error('Canonical x402 runner state changed; requires inspection');
        }
        latest.result = finalized.result;
        latest.resultHash = finalized.resultHash;
        latest.evidenceManifestHash = finalized.manifestHash;
        latest.phase = 'x402-complete';
        latest.status = 'completed';
        await saveJob(latest);
      }
      await writeState(file, { ...state, status: 'complete', completed_at: now(),
        result_hash: finalized.resultHash, evidence_manifest_hash: finalized.manifestHash });
      return finalized;
    } catch (error) {
      await writeState(file, { ...state, status: 'needs-inspection', failed_at: now(), error: errorDetail(error) });
      throw error;
    }
  }

  /** Queue one new funded job. Existing state is never retried automatically. */
  async function dispatch(job) {
    assertJob(job);
    const file = statePath(job);
    try {
      await createState(file, { job_id: job.id, input_hash: job.inputHash, status: 'queued', queued_at: now() });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const state = await readJson(file);
      throw new Error(`Runner job already exists with status ${state.status}; requires inspection before another run`);
    }
    const run = queue.then(() => execute(job, file));
    queue = run.catch(() => undefined);
    return run;
  }

  return Object.freeze({ dispatch });
}
