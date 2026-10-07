import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { runPlanWithObservations } from '../agent/lib/runner.ts';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function deriveRecordedAssessment(plan, record) {
  const execution = runPlanWithObservations({ plan, observations: record.observations, session_id: record.session_id, now: () => record.recorded_at });
  const caseResults = JSON.parse(JSON.stringify(execution.cases));
  const outcomes = new Set(caseResults.map(result => result.outcome));
  const label = outcomes.size === 1 ? caseResults[0].outcome : 'MIXED';
  const status = outcomes.has('FAIL') ? 'fail' : label === 'PASS' ? 'pass' : 'warn';
  return { caseResults, verdict: { label, status, summary: caseResults.map(result => `${result.case_id}: ${result.outcome}`).join('; ') } };
}

export function validateAgentCommentary(value) {
  const allowed = ['schemaVersion', 'summary', 'comments', 'author', 'createdAt'];
  if (!value || Object.keys(value).some(key => !allowed.includes(key)) || value.schemaVersion !== 1 ||
    typeof value.summary !== 'string' || !value.summary.trim() || value.summary.length > 12000 ||
    typeof value.author !== 'string' || !value.author.trim() || !Number.isFinite(Date.parse(value.createdAt)) ||
    !Array.isArray(value.comments) || value.comments.length > 50) throw new Error('Invalid agent commentary');
  for (const comment of value.comments) {
    if (!comment || Object.keys(comment).some(key => !['section', 'text'].includes(key)) ||
      !['run', 'recovery', 'verdict', 'checks'].includes(comment.section) ||
      typeof comment.text !== 'string' || !comment.text.trim() || comment.text.length > 12000) {
      throw new Error('Invalid agent comment');
    }
  }
  return value;
}

export function assertBundlePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || /[\x00-\x1f?#%:]/.test(value) ||
    path.posix.isAbsolute(value) || value.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.env') || ['browser-profiles', 'browser-setup'].includes(part))) {
    throw new Error(`Unsafe bundle path: ${value}`);
  }
  return value;
}

export function validateExecutionRecord(record) {
  if (!record || record.schemaVersion !== 1 || !/^[0-9a-f-]{36}$/.test(record.payment_job_id) ||
    !/^[a-f0-9]{64}$/.test(record.input_hash) || !/^[a-f0-9]{64}$/.test(record.approved_plan_hash) ||
    typeof record.approved_job_id !== 'string' || !record.approved_job_id ||
    !Number.isInteger(record.plan_version) || record.plan_version < 1 ||
    typeof record.session_id !== 'string' || !record.session_id ||
    !Number.isFinite(Date.parse(record.started_at)) || !Number.isFinite(Date.parse(record.recorded_at)) ||
    Date.parse(record.started_at) > Date.parse(record.recorded_at) ||
    !Array.isArray(record.observations) || !record.observations.length) throw new Error('Invalid execution record');
  return record;
}

async function readBundleFile(root, name) {
  assertBundlePath(name);
  let current = root;
  for (const part of name.split('/')) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`Bundle symlink rejected: ${name}`);
  }
  if (!(await lstat(current)).isFile()) throw new Error(`Bundle entry is not a file: ${name}`);
  return readFile(current);
}

/** Integrity verification only; buyer approval and run provenance are host responsibilities. */
export async function verifyEvidenceBundle(bundleDir) {
  const root = await realpath(bundleDir);
  const manifestBytes = await readBundleFile(root, 'manifest.json');
  const manifest = JSON.parse(manifestBytes);
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) throw new Error('Invalid evidence manifest');
  const entries = new Map();
  for (const entry of manifest.files) {
    assertBundlePath(entry.path);
    if (entries.has(entry.path) || ['manifest.json', 'evidence.zip'].includes(entry.path) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
      throw new Error(`Invalid manifest entry: ${entry.path}`);
    }
    const bytes = await readBundleFile(root, entry.path);
    if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) throw new Error(`Evidence digest mismatch: ${entry.path}`);
    entries.set(entry.path, entry);
  }
  if (!entries.has('report-data.json')) throw new Error('Manifest must include report-data.json');
  const report = JSON.parse(await readBundleFile(root, 'report-data.json'));
  if (report.schemaVersion !== 1 || typeof report.title !== 'string' || !report.run || !report.verdict ||
    !report.job || !report.media || !['files', 'stages', 'checks', 'metrics', 'timeline'].every(key => Array.isArray(report[key]))) {
    throw new Error('Invalid report-data contract');
  }
  const reference = name => {
    if (name == null) return;
    assertBundlePath(name);
    if (!entries.has(name)) throw new Error(`Unlisted report evidence: ${name}`);
  };
  for (const file of report.files) {
    reference(file.path);
    const entry = entries.get(file.path);
    if (file.sha256 !== entry.sha256 || file.bytes !== entry.bytes) throw new Error(`Report manifest mismatch: ${file.path}`);
  }
  for (const stage of report.stages) { reference(stage.image); reference(stage.log); }
  for (const check of report.checks) reference(check.evidence);
  for (const recording of report.media.recordings ?? []) reference(recording.path);
  reference(report.media.video);
  reference(report.media.trace);
  if (report.agentCommentary != null) validateAgentCommentary(report.agentCommentary);
  let executionRecord = null;
  if (report.execution != null) {
    reference(report.execution.record_artifact);
    const entry = entries.get(report.execution.record_artifact);
    if (!entry || entry.sha256 !== report.execution.record_sha256) throw new Error('Execution record digest mismatch');
    executionRecord = validateExecutionRecord(JSON.parse(await readBundleFile(root, entry.path)));
    for (const key of ['payment_job_id', 'input_hash', 'approved_job_id', 'plan_version', 'approved_plan_hash', 'session_id', 'started_at', 'recorded_at']) {
      if (report.execution[key] !== executionRecord[key]) throw new Error(`Execution binding mismatch: ${key}`);
    }
    if (report.job.binding_state !== 'bound' || report.job.job_id !== executionRecord.approved_job_id ||
      report.job.plan_version !== executionRecord.plan_version || report.job.approved_plan_hash !== executionRecord.approved_plan_hash) throw new Error('Execution record differs from approved plan');
    const started = Date.parse(report.run.startedAt), ended = Date.parse(report.run.endedAt);
    if (!Number.isFinite(started) || !Number.isFinite(ended) || started > ended ||
      started < Date.parse(executionRecord.started_at) || ended > Date.parse(executionRecord.recorded_at)) throw new Error('Browser run outside recorded execution interval');
  }
  if (report.job.binding_state === 'bound') {
    reference(report.job.approved_plan_artifact);
    if (!report.job.approved_plan_artifact) throw new Error('Bound report requires an approved plan artifact');
    const plan = JSON.parse(await readBundleFile(root, report.job.approved_plan_artifact));
    const { approval, ...rest } = plan;
    const hash = digest(JSON.stringify({ ...rest, approval: approval ? { requester_id: approval.requester_id, approved_at: approval.approved_at } : undefined }));
    if (!approval?.requester_id || !Number.isFinite(Date.parse(approval.approved_at)) ||
      hash !== approval.approved_plan_hash || hash !== report.job.approved_plan_hash ||
      plan.job_id !== report.job.job_id || plan.plan_version !== report.job.plan_version) throw new Error('Approved plan binding mismatch');
    if (executionRecord) {
      const assessment = deriveRecordedAssessment(plan, executionRecord);
      if (!isDeepStrictEqual(report.caseResults, assessment.caseResults) ||
        Object.entries(assessment.verdict).some(([key, value]) => report.verdict[key] !== value)) {
        throw new Error('Report outcome differs from recorded observations');
      }
    }
  } else if (report.job.binding_state !== 'unbound') throw new Error('Invalid job binding state');
  return { report, manifest, manifestHash: digest(manifestBytes), executionRecord };
}
