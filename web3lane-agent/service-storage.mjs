import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

export function serviceDataRoot() {
  return resolve(process.env.WEB3LANE_DATA_ROOT || join(process.cwd(), '.local'));
}

export function serviceDataPath(...parts) {
  const root = serviceDataRoot();
  const target = resolve(root, ...parts);
  const rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error('Service data path must be a child of WEB3LANE_DATA_ROOT');
  }
  return target;
}

export const dataPath = serviceDataPath;

async function syncDirectory(directory) {
  const handle = await open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function writeJsonAtomic(file, value) {
  const directory = dirname(resolve(file));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, file);
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function createJsonOnce(file, value) {
  const directory = dirname(resolve(file));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const handle = await open(file, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(directory);
}

export async function acquireApiLock() {
  const file = serviceDataPath('agent-api.lock');
  const token = randomUUID();
  try {
    await createJsonOnce(file, { token, pid: process.pid, acquired_at: new Date().toISOString() });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`Agent API lock already exists at ${file}; reconcile the prior process before restart`);
    }
    throw error;
  }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      const handle = await open(file, 'r');
      let owner;
      try { owner = JSON.parse(await handle.readFile('utf8')); } finally { await handle.close(); }
      if (owner?.token === token) await rm(file);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  };
}
