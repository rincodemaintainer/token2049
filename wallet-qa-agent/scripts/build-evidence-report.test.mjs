import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const input = JSON.parse(await readFile('reports/swap-demo.input.json', 'utf8'));

async function rejectsRunnerLog(path, name) {
  const config = `.local/${name}.json`;
  try {
    await writeFile(config, JSON.stringify({ ...input, runnerLog: path }));
    const run = spawnSync(process.execPath, ['scripts/build-evidence-report.mjs', config], { encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Unexpected evidence source|Unsafe evidence source/);
  } finally {
    await rm(config, { force: true });
  }
}

test('rejects an env file as a log', async () => {
  await rejectsRunnerLog('.env', 'reject-env');
});

test('rejects a symlink from the log allowlist to an env file', async () => {
  const link = '.local/runner-leak.log';
  await symlink('../.env', link);
  try { await rejectsRunnerLog(link, 'reject-link'); }
  finally { await rm(link, { force: true }); }
});
