import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const out = path.resolve('.local/evidence-report');
await mkdir(path.join(out, 'assets'), { recursive: true });
await mkdir(path.join(out, 'logs'), { recursive: true });
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const runDir = '.local/swap-test-results/qwap-wallet-Funded-wallet-connection-and-displayed-balance-swap';
const raw = await readJson('.local/swap-test-results/report.json');
const result = raw.suites.flatMap(s => s.specs ?? []).flatMap(s => s.tests ?? []).flatMap(t => t.results ?? [])[0];
const recovery = await readJson(`${runDir}/swap-recovery.json`);
const followup = await readJson('.local/post-swap-check/report.json');
const evals = await readJson('.eve/evals/2026-10-06T17-55-54/summary.json');
const files = [];
const clean = text => text.replaceAll(root, '[workspace]').replaceAll('/Users/rinnguyen', '[local-user]');
async function save(name, bytes, label, kind, source) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  await writeFile(path.join(out, name), buffer);
  files.push({ path: name, label, kind, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), source });
  return name;
}
const stages = [];
const stageCopy = {
  'connection-popup': ['Connect wallet', 'MetaMask requests permission for testnet.qwap.xyz.'],
  'wallet-balance': ['Wallet balance', 'MetaMask displays 8.147 QMS before the swap. Rounded UI value.'],
  'connected-app': ['Connected Qwap', 'The application displays the expected account and pre-swap balances.'],
  'swap-quote': ['Swap quote', 'The form contains 0.01 QMS. Displayed quotes are rounded; the wallet calldata is the spending check.'],
  'wallet-request': ['Transaction request', 'A real MetaMask notification popup shows QMS Testnet and the Qwap origin.'],
  'wallet-transaction': ['Transaction details', 'The request uses swapExactETHForTokens, nonce 0, minimum 9,680 raw USDC and deadline 1791314160.'],
  'wallet-pending': ['Awaiting confirmation', 'Qwap asks for wallet confirmation. This frame is before the Confirm click; it is not proof of submission.'],
};
for (const [name, [title, description]] of Object.entries(stageCopy)) {
  const attachment = result.attachments.find(a => a.name === name);
  if (!attachment) continue;
  const bytes = attachment.path ? await readFile(attachment.path) : Buffer.from(attachment.body, 'base64');
  const image = await save(`assets/${name}.png`, bytes, title, 'Screenshot', `Playwright attachment: ${name}`);
  const textAttachment = result.attachments.find(a => a.name === `${name}-text` || (name === 'wallet-balance' && a.name === 'wallet-text'));
  let log = null;
  if (textAttachment?.body) log = await save(`logs/${name}.txt`, clean(Buffer.from(textAttachment.body, 'base64').toString()), `${title} UI snapshot`, 'UI text', `Playwright attachment: ${textAttachment.name}`);
  stages.push({ title, description, image, log, provenance: 'Captured during the same automated swap attempt.' });
}
const explorerImage = await save('assets/explorer-confirmed.png', await readFile(`${runDir}/explorer-confirmed.png`), 'Explorer confirmation', 'Screenshot', `${runDir}/explorer-confirmed.png`);
const explorerText = await save('logs/explorer-confirmed.txt', await readFile(`${runDir}/explorer-confirmed.txt`), 'Explorer UI snapshot', 'UI text', `${runDir}/explorer-confirmed.txt`);
stages.push({ title: 'Explorer confirmation', description: 'Success, block 59015, 0.009921 USDC delivered. Decoded minimum, nonce, recipient and deadline match the browser request.', image: explorerImage, log: explorerText, provenance: 'Captured during recovery. Transaction hash supplied by the user after the test timed out.' });
await save('logs/playwright-swap.json', clean(JSON.stringify(raw, null, 2)), 'Original swap run (paths sanitized)', 'Test report', '.local/swap-test-results/report.json');
await save('logs/swap-request.json', await readFile(`${runDir}/swap-result.json`), 'Pre-confirmation journal', 'Journal', `${runDir}/swap-result.json`);
await save('logs/swap-recovery.json', JSON.stringify(recovery, null, 2), 'Explorer recovery record', 'Recovery', `${runDir}/swap-recovery.json`);
await save('logs/failure-context.md', clean(await readFile(`${runDir}/error-context.md`, 'utf8')), 'Failure and source location', 'Error log', `${runDir}/error-context.md`);
await save('logs/connection-check.json', clean(JSON.stringify(followup, null, 2)), 'Later connection check (before confirmation)', 'Test report', '.local/post-swap-check/report.json');
const evalSummary = { startedAt: evals.startedAt, completedAt: evals.completedAt, passed: evals.passed, failed: evals.failed,
  evals: evals.evals.map(({ id, verdict, assertions }) => ({ id, verdict, assertions: assertions.map(({ name, passed }) => ({ name, passed })) })) };
await save('logs/eve-evals.json', JSON.stringify(evalSummary, null, 2), 'Eve behavior evaluations (summary)', 'Evaluation', '.eve/evals/2026-10-06T17-55-54/summary.json');
const manifest = { generatedAt: new Date().toISOString(), retention: { mode: 'local', plannedHostedDays: 7, publishedAt: null, expiresAt: null }, files };
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
const data = { generatedAt: manifest.generatedAt, recovery, stages, files,
  run: { startedAt: result.startTime, endedAt: new Date(Date.parse(result.startTime) + result.duration).toISOString(), duration: result.duration,
    status: result.status, error: result.error?.message ?? result.errors?.[0]?.message ?? '', baseCommit: 'a64d0a0' },
  connection: followup.stats, evals: evalSummary };
const template = await readFile('reports/evidence-template.html', 'utf8');
await writeFile(path.join(out, 'index.html'), template.replace('/*__REPORT_DATA__*/', JSON.stringify(data).replaceAll('<', '\\u003c')));
// Export only allowlisted artifacts. Never include environment files, browser profiles or onboarding inputs.
console.log(JSON.stringify({ output: path.join(out, 'index.html'), screenshots: stages.length, artifacts: files.length, video: false, trace: false }));
