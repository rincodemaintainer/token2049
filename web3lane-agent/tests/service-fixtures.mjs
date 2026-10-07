import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const testApiToken = 'test-only-buyer-token-not-a-real-secret';
export const otherApiToken = 'test-only-other-buyer-not-a-real-secret';
export async function provisionTestService(directory) {
  await mkdir(join(directory, '.local'), { recursive: true });
  await writeFile(join(directory, '.local', 'api-clients.json'), JSON.stringify([
    { id: 'demo-buyer', token_sha256: createHash('sha256').update(testApiToken).digest('hex') },
    { id: 'other-buyer', token_sha256: createHash('sha256').update(otherApiToken).digest('hex') },
  ]));
  const adapter = join(directory, 'test-runner.mjs');
  await writeFile(adapter, 'export default { supports: plan => !plan.job_id.endsWith("-unsupported"), run: () => { throw new Error("Test runner must not execute"); } };');
  return { WEB3LANE_RUNNER_ADAPTER: adapter };
}
export function buyerFetch(url, init = {}) {
  return fetch(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${testApiToken}` } });
}
