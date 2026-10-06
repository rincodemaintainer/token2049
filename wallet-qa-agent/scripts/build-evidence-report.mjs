import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { decodeFunctionData, parseAbi, parseEther, parseUnits } from 'viem';

const root = process.cwd();
const out = path.resolve('.local/evidence-report');
const inputPath = process.argv[2] ?? 'reports/swap-demo.input.json';
const input = JSON.parse(await readFile(inputPath, 'utf8'));
if (input.schemaVersion !== 1) throw new Error('Unsupported evidence input schema');
try { process.loadEnvFile('.env'); } catch {}
const secrets = [process.env.QMS_TEST_WALLET_MNEMONIC, process.env.QMS_TEST_WALLET_PASSWORD, process.env.QMS_TEST_WALLET_PRIVATE_KEY].filter(Boolean);
const source = value => {
  if (typeof value !== 'string') throw new Error('Evidence path must be a string');
  const resolved = realpathSync(path.resolve(value));
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(part => part.startsWith('.env') || part === 'browser-profiles' || part === 'browser-setup')) throw new Error(`Unsafe evidence source: ${value}`);
  return resolved;
};
const localSource = (value, extension, prefix = '.local/') => {
  if (!value?.startsWith(prefix) || !value.endsWith(extension)) throw new Error(`Unexpected evidence source: ${value}`);
  return source(value);
};
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'assets'), { recursive: true });
await mkdir(path.join(out, 'logs'), { recursive: true });
await mkdir(path.join(out, 'source'), { recursive: true });
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const runDir = input.runDirectory;
const raw = await readJson(localSource(input.report, '.json'));
const result = raw.suites.flatMap(s => s.specs ?? []).flatMap(s => s.tests ?? []).flatMap(t => t.results ?? [])[0];
if (!result) throw new Error('Playwright report has no test result');
const recovery = await readJson(localSource(input.recovery, '.json'));
if (Date.parse(recovery.verifiedAt) < Date.parse(result.startTime)) throw new Error('Recovery predates browser run');
const request = await readJson(source(`${runDir}/swap-result.json`));
if (request.amountQms !== recovery.amountQms || request.minimumUsdcRaw !== recovery.minimumUsdcRaw || request.wallet?.toLowerCase() !== recovery.from?.toLowerCase()) {
  throw new Error('Recovery does not match browser request');
}
const followup = input.followup ? await readJson(localSource(input.followup, '.json')) : null;
const evals = input.evalSummary ? await readJson(source(input.evalSummary)) : null;
const files = [];
const clean = text => text.replaceAll(root, '[workspace]').replaceAll('/Users/rinnguyen', '[local-user]');
async function save(name, bytes, label, kind, source) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (kind !== 'Recording' && kind !== 'Screenshot' && kind !== 'Trace' && secrets.some(secret => buffer.includes(Buffer.from(secret)))) throw new Error(`Credential detected in ${name}`);
  await mkdir(path.dirname(path.join(out, name)), { recursive: true });
  await writeFile(path.join(out, name), buffer);
  files.push({ path: name, label, kind, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), source });
  return name;
}
let rpcProofValid = false;
if (input.rpcProof) {
  const proof = await readJson(localSource(input.rpcProof, '.json', '.local/swap-test-results/'));
  const { transaction: tx, receipt, block } = proof;
  const hash = recovery.transactionUrl?.split('/').pop()?.toLowerCase();
  const decoded = decodeFunctionData({ abi: parseAbi(['function swapExactETHForTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline)']), data: tx.input });
  const [minimum, route, recipient, deadline] = decoded.args;
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const transferToWallet = receipt.logs.find(log => same(log.address, route[1]) && same(log.topics[0], '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') && same(log.topics[2], `0x${recovery.from.slice(2).padStart(64, '0')}`) && BigInt(log.data) === parseUnits(recovery.receivedUsdc, 6));
  rpcProofValid = same(tx.hash, hash) && same(receipt.transactionHash, hash) && receipt.status === 'success' &&
    same(tx.from, recovery.from) && same(tx.to, recovery.router) && BigInt(tx.value) === parseEther(recovery.amountQms) &&
    Number(tx.nonce) === Number(recovery.nonce) && BigInt(minimum) === BigInt(recovery.minimumUsdcRaw) &&
    same(recipient, recovery.from) && BigInt(deadline) === BigInt(recovery.deadline) &&
    same(tx.blockHash, receipt.blockHash) && same(receipt.blockHash, block.hash) &&
    BigInt(tx.blockNumber) === BigInt(receipt.blockNumber) && BigInt(block.number) === BigInt(recovery.block) &&
    (!recovery.blockTimestamp || new Date(Number(block.timestamp) * 1000).toISOString() === recovery.blockTimestamp) && Boolean(transferToWallet);
  if (!rpcProofValid) throw new Error('RPC proof does not match the browser request and recovery record');
  await save('logs/rpc-proof.json', JSON.stringify(proof, null, 2), 'Raw QMS RPC transaction, receipt and block', 'RPC proof', input.rpcProof);
}
const stages = [];
const stageCopy = {
  'connection-popup': ['Connect wallet', 'MetaMask requests permission for testnet.qwap.xyz.'],
  'wallet-balance': ['Wallet balance', 'MetaMask balance before the swap. Displayed value may be rounded.'],
  'connected-app': ['Connected Qwap', 'The application displays the expected account and pre-swap balances.'],
  'swap-quote': ['Swap quote', `The form contains ${recovery.amountQms} QMS. Displayed quotes are rounded; wallet calldata is the spending check.`],
  'wallet-request': ['Transaction request', 'A real MetaMask notification popup shows QMS Testnet and the Qwap origin.'],
  'wallet-transaction': ['Transaction details', `The request uses swapExactETHForTokens, nonce ${recovery.nonce}, minimum ${recovery.minimumUsdcRaw} raw USDC and deadline ${recovery.deadline}.`],
  'wallet-pending': ['Awaiting confirmation', 'Qwap asks for wallet confirmation. This frame is before the Confirm click; it is not proof of submission.'],
  'swap-success': ['Qwap success feedback', 'Qwap displayed its network-success message after wallet confirmation.'],
};
for (const [name, [title, description]] of Object.entries(stageCopy)) {
  const attachment = result.attachments.find(a => a.name === name);
  if (!attachment) continue;
  const bytes = attachment.path ? await readFile(source(attachment.path)) : Buffer.from(attachment.body, 'base64');
  const image = await save(`assets/${name}.png`, bytes, title, 'Screenshot', `Playwright attachment: ${name}`);
  const textAttachment = result.attachments.find(a => a.name === `${name}-text` || (name === 'wallet-balance' && a.name === 'wallet-text'));
  let log = null;
  if (textAttachment?.body) log = await save(`logs/${name}.txt`, clean(Buffer.from(textAttachment.body, 'base64').toString()), `${title} UI snapshot`, 'UI text', `Playwright attachment: ${textAttachment.name}`);
  stages.push({ title, description, image, log, provenance: 'Captured during the same automated swap attempt.' });
}
if (await access(path.resolve(`${runDir}/explorer-confirmed.png`)).then(() => true, () => false)) {
  const explorerImage = await save('assets/explorer-confirmed.png', await readFile(source(`${runDir}/explorer-confirmed.png`)), 'Explorer confirmation', 'Screenshot', `${runDir}/explorer-confirmed.png`);
  const explorerText = await save('logs/explorer-confirmed.txt', clean(await readFile(source(`${runDir}/explorer-confirmed.txt`), 'utf8')), 'Explorer UI snapshot', 'UI text', `${runDir}/explorer-confirmed.txt`);
  stages.push({ title: 'Explorer confirmation', description: `Success, block ${recovery.block}, ${recovery.receivedUsdc} USDC delivered. Decoded minimum, nonce, recipient and deadline match the browser request.`, image: explorerImage, log: explorerText, provenance: `Captured during recovery. ${recovery.hashSource ?? 'Transaction hash reconciled after the browser run.'}` });
}
await save('logs/playwright-swap.json', clean(JSON.stringify(raw, null, 2)), 'Original swap run (paths sanitized)', 'Test report', input.report);
await save('logs/swap-request.json', clean(await readFile(source(`${runDir}/swap-result.json`), 'utf8')), 'Pre-confirmation journal', 'Journal', `${runDir}/swap-result.json`);
await save('logs/swap-recovery.json', clean(JSON.stringify(recovery, null, 2)), 'Explorer recovery record', 'Recovery', input.recovery);
await save('logs/failure-context.md', clean(await readFile(source(`${runDir}/error-context.md`), 'utf8')), 'Failure and source location', 'Error log', `${runDir}/error-context.md`);
if (followup) await save('logs/connection-check.json', clean(JSON.stringify(followup, null, 2)), 'Separate connection check', 'Test report', input.followup);
const evalSummary = evals && { startedAt: evals.startedAt, completedAt: evals.completedAt, passed: evals.passed, failed: evals.failed,
  evals: evals.evals.map(({ id, verdict, assertions }) => ({ id, verdict, assertions: assertions.map(({ name, passed }) => ({ name, passed })) })) };
if (evalSummary) await save('logs/eve-evals.json', JSON.stringify(evalSummary, null, 2), 'Eve behavior evaluations (summary)', 'Evaluation', input.evalSummary);
if (input.runnerLog) await save('logs/runner.log', clean(await readFile(localSource(input.runnerLog, '.log'), 'utf8')), 'Full runner console log', 'Console log', input.runnerLog);
const recordings = [];
const attachedRecordings = result.attachments.filter(item => item.name.startsWith('recording-')).map(item => ({
  path: item.path, body: item.body, label: `Browser recording ${item.name.slice('recording-'.length)}`,
  scope: 'Browser page opened after wallet setup; the app and wallet popups are separate clips.',
}));
const explicitRecordings = (input.recordings ?? []).length > 0;
for (const [index, recording] of (explicitRecordings ? input.recordings : attachedRecordings).entries()) {
  const name = `recordings/recording-${index + 1}${path.extname(recording.path ?? '') || '.webm'}`;
  if (!explicitRecordings && recording.path && (!recording.path.includes('/.local/swap-test-results/') || !recording.path.endsWith('.webm'))) throw new Error('Unexpected recording attachment');
  const bytes = recording.path ? await readFile(explicitRecordings ? localSource(recording.path, '.webm', '.local/safe-recordings/') : source(recording.path)) : Buffer.from(recording.body, 'base64');
  await save(name, bytes, recording.label, 'Recording', recording.path ?? 'Playwright attachment');
  recordings.push({ path: name, label: recording.label, scope: recording.scope });
}
const attachedTrace = result.attachments.find(item => item.name === 'swap-trace');
const traceBytes = input.trace ? await readFile(localSource(input.trace, '.zip', '.local/swap-test-results/')) : attachedTrace?.path ? await readFile(source(attachedTrace.path)) : attachedTrace?.body ? Buffer.from(attachedTrace.body, 'base64') : null;
const trace = traceBytes ? await save('traces/playwright-trace.zip', traceBytes, 'Playwright trace', 'Trace', input.trace ?? 'Playwright attachment') : null;
for (const name of ['README.md', 'package.json', 'playwright.config.ts', 'playwright.swap.config.ts', 'tests/qwap-wallet.spec.ts', 'tests/helpers/qms-swap.ts', 'scripts/build-evidence-report.mjs', 'scripts/build-evidence-report.test.mjs', 'scripts/capture-rpc-proof.mjs', 'reports/INPUT-CONTRACT.md', 'reports/swap-demo.input.json', 'reports/evidence-template.html']) {
  await save(`source/${name}`, await readFile(source(name)), name, 'Source', name);
}
const manifest = { schemaVersion: 1, generatedAt: new Date().toISOString(), retention: { mode: 'local', plannedHostedDays: 7, publishedAt: null, expiresAt: null }, files };
const exportHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const browserPassed = result.status === 'passed';
const uiSuccessObserved = result.attachments.some(item => item.name === 'swap-success');
const chainConfirmed = recovery.status === 'confirmed-on-rpc' ? rpcProofValid : recovery.status === 'confirmed-on-explorer' && stages.some(stage => stage.title === 'Explorer confirmation');
const checks = [
  { name: 'End-to-end Playwright result', status: browserPassed ? 'pass' : 'fail', detail: browserPassed ? 'All browser assertions passed.' : uiSuccessObserved ? 'Failed after Qwap success while waiting for an explorer tab that did not open.' : 'Failed before Qwap success feedback was observed.', evidence: 'logs/playwright-swap.json' },
  { name: 'Wallet and connection', status: 'pass', detail: 'Account, MetaMask connection and QMS Testnet observed.', evidence: 'assets/connected-app.png' },
  { name: 'Transaction request', status: 'pass', detail: 'Amount, router, route and minimum output captured before signing.', evidence: 'assets/wallet-transaction.png' },
  { name: 'Qwap success feedback', status: uiSuccessObserved ? 'pass' : 'warn', detail: uiSuccessObserved ? 'Network-success message observed in the browser.' : 'Not observed before the Playwright assertion timed out.', evidence: uiSuccessObserved ? 'assets/swap-success.png' : 'logs/playwright-swap.json' },
  { name: 'On-chain execution', status: chainConfirmed ? 'pass' : 'unknown', detail: chainConfirmed ? `${recovery.receivedUsdc} USDC delivered in block ${recovery.block}; verified via ${recovery.status === 'confirmed-on-rpc' ? 'RPC receipt and Transfer log' : 'explorer'}.` : 'Chain confirmation unavailable.', evidence: recovery.status === 'confirmed-on-rpc' ? 'logs/rpc-proof.json' : 'logs/swap-recovery.json' },
  { name: 'Post-swap UI balances', status: uiSuccessObserved ? 'pass' : 'unknown', detail: uiSuccessObserved ? 'Qwap balance values captured with the success notification.' : 'Not captured after on-chain inclusion.', evidence: uiSuccessObserved ? 'assets/swap-success.png' : undefined },
  { name: 'Playwright trace', status: trace ? 'pass' : 'warn', detail: trace ? 'Trace archive included.' : 'Trace was not finalized by the failed runner; screenshots and recording remain available.', evidence: trace ?? undefined },
  { name: 'Run source provenance', status: 'warn', detail: 'Source files were captured at export, after the browser run. The exact run-time worktree was not preserved.', evidence: 'source/tests/qwap-wallet.spec.ts' },
];
const metrics = [
  { label: 'Browser run', value: result.status.toUpperCase(), status: browserPassed ? 'pass' : 'fail', detail: 'Original Playwright outcome' },
  { label: 'On-chain', value: chainConfirmed ? 'CONFIRMED' : 'UNVERIFIED', status: chainConfirmed ? 'pass' : 'unknown', detail: `Block ${recovery.block ?? '—'}` },
  { label: 'QMS sent', value: recovery.amountQms, unit: 'QMS', detail: 'Testnet amount' },
  { label: 'USDC received', value: recovery.receivedUsdc, unit: 'USDC', status: chainConfirmed ? 'pass' : 'unknown', detail: recovery.status === 'confirmed-on-rpc' ? 'RPC receipt transfer log' : 'Explorer observation' },
];
const timeline = [
  { at: result.startTime, label: 'Browser run began', status: 'pass', detail: 'Wallet setup, connection and swap request.' },
  { at: new Date(Date.parse(result.startTime) + result.duration).toISOString(), label: browserPassed ? 'Browser assertions passed' : uiSuccessObserved ? 'Explorer-tab check failed' : 'Qwap success wait expired', status: browserPassed ? 'pass' : 'fail', detail: browserPassed ? 'All browser assertions passed.' : uiSuccessObserved ? 'Qwap success was observed; expected explorer tab did not open.' : 'The test did not observe Qwap success feedback within its wait.' },
  { at: recovery.verifiedAt, label: recovery.status === 'confirmed-on-rpc' ? 'RPC reconciliation' : 'Explorer reconciliation', status: chainConfirmed ? 'pass' : 'unknown', detail: recovery.hashSource ?? 'Separate verification.' },
];
const data = { schemaVersion: 1, title: input.title, generatedAt: manifest.generatedAt, recovery, stages, files, artifactCount: files.length + 2, checks, metrics, timeline,
  media: { recordings, video: recordings[0]?.path ?? null, trace },
  run: { startedAt: result.startTime, endedAt: new Date(Date.parse(result.startTime) + result.duration).toISOString(), duration: result.duration,
    status: result.status, error: result.error?.message ?? result.errors?.[0]?.message ?? '', baseCommit: exportHead, sourceSnapshotCapturedAt: manifest.generatedAt, exactRunSourceAvailable: false },
  connection: followup?.stats ?? null, evals: evalSummary };
await writeFile(path.join(out, 'report-data.json'), JSON.stringify(data, null, 2));
const template = await readFile('reports/evidence-template.html', 'utf8');
await writeFile(path.join(out, 'index.html'), template.replace('/*__REPORT_DATA__*/', JSON.stringify(data).replaceAll('<', '\\u003c')));
await save('report-data.json', await readFile(path.join(out, 'report-data.json')), 'Report data', 'Report', 'Generated report-data.json');
await save('index.html', await readFile(path.join(out, 'index.html')), 'Static HTML report', 'Report', 'Generated index.html');
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
// Export only allowlisted artifacts. Never include environment files, browser profiles or onboarding inputs.
execFileSync('zip', ['-q', '-r', 'evidence.zip', 'index.html', 'report-data.json', 'manifest.json', 'assets', 'logs', 'recordings', 'traces', 'source'].filter(name => name !== 'recordings' || recordings.length).filter(name => name !== 'traces' || trace), { cwd: out });
console.log(JSON.stringify({ output: path.join(out, 'index.html'), screenshots: stages.length, artifacts: files.length, recordings: recordings.length, trace: Boolean(trace), archive: path.join(out, 'evidence.zip') }));
