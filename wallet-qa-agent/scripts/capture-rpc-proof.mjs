import { createPublicClient, http } from 'viem';
import { mkdir, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';

const [hash, output] = process.argv.slice(2);
if (!/^0x[0-9a-f]{64}$/i.test(hash ?? '') || !output?.startsWith('.local/swap-test-results/') || !output.endsWith('.json')) {
  throw new Error('Usage: node scripts/capture-rpc-proof.mjs <transaction hash> .local/<output>.json');
}
await mkdir(path.dirname(output), { recursive: true });
if (!realpathSync(path.dirname(output)).startsWith(`${realpathSync('.local/swap-test-results')}${path.sep}`)) throw new Error('Output must be inside swap test results');
const client = createPublicClient({ transport: http('https://rpc.testnet.qms.finance') });
const [transaction, receipt] = await Promise.all([
  client.getTransaction({ hash }), client.getTransactionReceipt({ hash }),
]);
const block = await client.getBlock({ blockNumber: receipt.blockNumber });
const proof = { rpcUrl: 'https://rpc.testnet.qms.finance', capturedAt: new Date().toISOString(),
  transaction, receipt, block: { number: block.number, hash: block.hash, timestamp: block.timestamp } };
await writeFile(output, JSON.stringify(proof, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
console.log(JSON.stringify({ output, hash, status: receipt.status, block: String(block.number) }));
