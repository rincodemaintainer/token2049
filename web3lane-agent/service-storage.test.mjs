import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { acquireApiLock, createJsonOnce, serviceDataPath, writeJsonAtomic } from './service-storage.mjs';

async function withDataRoot(run) {
  const original = process.env.WEB3LANE_DATA_ROOT;
  const root = await mkdtemp(join(tmpdir(), 'web3lane-storage-'));
  process.env.WEB3LANE_DATA_ROOT = root;
  try { await run(root); }
  finally {
    if (original === undefined) delete process.env.WEB3LANE_DATA_ROOT;
    else process.env.WEB3LANE_DATA_ROOT = original;
    await rm(root, { recursive: true, force: true });
  }
}

test('writes and claims service state beneath the configured data root', async () => withDataRoot(async root => {
  const file = serviceDataPath('x402-jobs', 'job.json');
  await writeJsonAtomic(file, { state: 'quoted' });
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { state: 'quoted' });
  await createJsonOnce(file, { state: 'other' }).then(
    () => assert.fail('expected exclusive claim failure'),
    error => assert.equal(error.code, 'EEXIST'),
  );
  assert.equal(serviceDataPath('x402-jobs', 'job.json'), join(root, 'x402-jobs', 'job.json'));
}));

test('API lock is exclusive and release is ownership-bound', async () => withDataRoot(async () => {
  const release = await acquireApiLock();
  await assert.rejects(acquireApiLock, /lock already exists/);
  await release();
  const next = await acquireApiLock();
  await next();
}));
