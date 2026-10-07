import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadApiClients } from './service-auth.mjs';

test('authentication requires exact bearer secret and rejects invalid client configuration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qa-auth-'));
  const file = join(directory, 'clients.json');
  const token = 'test-only-auth-token-with-sufficient-length';
  const client = { id: 'buyer-one', token_sha256: createHash('sha256').update(token).digest('hex') };
  try {
    assert.throws(() => loadApiClients(file));
    await writeFile(file, JSON.stringify([client]));
    const auth = loadApiClients(file);
    assert.equal(auth.authenticate(`Bearer ${token}`).id, client.id);
    for (const header of [undefined, '', token, `Basic ${token}`, `Bearer ${token}x`, `Bearer ${token}\n`]) {
      assert.equal(auth.authenticate(header), null);
    }
    await writeFile(file, JSON.stringify([client, client]));
    assert.throws(() => loadApiClients(file), /unique/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
