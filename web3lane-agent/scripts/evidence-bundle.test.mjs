import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, symlink, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifyEvidenceBundle, validateAgentCommentary } from './evidence-bundle.mjs';
import { importEvidenceReport } from './import-evidence-report.mjs';

async function fixture(t, change = () => {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qa-report-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bundle = path.join(root, 'bundle');
  await mkdir(path.join(bundle, 'logs'), { recursive: true });
  const files = [];
  async function save(name, value) {
    const bytes = Buffer.from(value);
    await writeFile(path.join(bundle, name), bytes);
    const entry = { path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), label: name, kind: 'Test report' };
    files.push(entry);
    return entry;
  }
  const log = await save('logs/run.json', '{"status":"failed"}');
  const report = { schemaVersion: 1, title: 'Recorded QA run', generatedAt: '2026-10-07T01:00:00Z', job: { binding_state: 'unbound' },
    run: { status: 'failed' }, verdict: { label: 'INCONCLUSIVE' }, files: [log], stages: [], checks: [{ evidence: log.path }], metrics: [], timeline: [], media: { recordings: [], trace: null, video: null } };
  change(report);
  await save('report-data.json', JSON.stringify(report));
  const manifest = { schemaVersion: 1, files };
  await writeFile(path.join(bundle, 'manifest.json'), JSON.stringify(manifest));
  return { root, bundle, manifest, report };
}

test('imports only verified files and preserves recorded outcome', async t => {
  const { root, bundle } = await fixture(t);
  await writeFile(path.join(bundle, 'unlisted.txt'), 'not exportable');
  const target = path.join(root, 'app');
  const imported = await importEvidenceReport(bundle, 'swap-01', target);
  const verified = await verifyEvidenceBundle(imported.directory);
  assert.equal(verified.report.run.status, 'failed');
  assert.match(verified.manifestHash, /^[a-f0-9]{64}$/);
  assert.equal((await readdir(imported.directory)).includes('unlisted.txt'), false);
  await assert.rejects(importEvidenceReport(bundle, 'swap-01', target), /already imported/);
  await assert.rejects(importEvidenceReport(bundle, '../escape', target), /slug/);
});

test('rejects a modified artifact and a missing artifact', async t => {
  const { bundle } = await fixture(t);
  const file = path.join(bundle, 'logs/run.json');
  await writeFile(file, '{"status":"passed"}');
  await assert.rejects(verifyEvidenceBundle(bundle), /digest mismatch/);
  await rm(file);
  await assert.rejects(verifyEvidenceBundle(bundle), /ENOENT/);
});

test('rejects manifest traversal and symlinks', async t => {
  const { bundle, manifest } = await fixture(t);
  await rm(path.join(bundle, 'logs/run.json'));
  await symlink('../report-data.json', path.join(bundle, 'logs/run.json'));
  await assert.rejects(verifyEvidenceBundle(bundle), /symlink/);
  manifest.files[0].path = '../outside.json';
  await writeFile(path.join(bundle, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(verifyEvidenceBundle(bundle), /Unsafe bundle path/);
});

test('rejects report references missing from the manifest', async t => {
  const { bundle } = await fixture(t, report => { report.checks = [{ evidence: 'logs/invented.json' }]; });
  await assert.rejects(verifyEvidenceBundle(bundle), /Unlisted report evidence/);
});

test('rejects an unsupported bound-plan claim', async t => {
  const { bundle } = await fixture(t, report => { report.job = { binding_state: 'bound' }; });
  await assert.rejects(verifyEvidenceBundle(bundle), /approved plan artifact/);
});

test('commentary permits interpretation but cannot supply authoritative fields', () => {
  const note = { schemaVersion: 1, author: 'web3lane', createdAt: '2026-10-07T01:00:00Z', summary: 'The browser check failed.', comments: [{ section: 'run', text: 'Review the recorded failure.' }] };
  assert.deepEqual(validateAgentCommentary(note), note);
  assert.throws(() => validateAgentCommentary({ ...note, verdict: 'PASS' }), /Invalid agent commentary/);
  assert.throws(() => validateAgentCommentary({ ...note, comments: [{ section: 'run', text: 'Fine', outcome: 'PASS' }] }), /Invalid agent comment/);
});
