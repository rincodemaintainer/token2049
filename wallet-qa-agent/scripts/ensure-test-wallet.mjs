import { readFileSync, appendFileSync, chmodSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const file = '.env.local';
if (spawnSync('git', ['check-ignore', '--quiet', file]).status !== 0) {
  throw new Error('.env.local must be ignored by Git');
}
const stat = statSync(file);
if (!stat.isFile()) throw new Error('Expected a private .env.local file');
chmodSync(file, 0o600);

const prior = readFileSync(file, 'utf8');
const saved = parseEnv(prior);
const key = saved.QMS_TEST_WALLET_PRIVATE_KEY ?? generatePrivateKey();
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('Invalid saved test wallet key');
const address = privateKeyToAccount(key).address;
if (saved.QMS_TEST_WALLET_ADDRESS && saved.QMS_TEST_WALLET_ADDRESS !== address) {
  throw new Error('Saved test wallet address does not match its key');
}
if (!saved.QMS_TEST_WALLET_PRIVATE_KEY) {
  const separator = prior && !prior.endsWith('\n') ? '\n' : '';
  appendFileSync(file, `${separator}QMS_TEST_WALLET_PRIVATE_KEY=${JSON.stringify(key)}\nQMS_TEST_WALLET_ADDRESS=${JSON.stringify(address)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}
console.log(`QMS test wallet address: ${address}`);
