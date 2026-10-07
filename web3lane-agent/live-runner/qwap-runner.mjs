import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createPublicClient, decodeFunctionData, formatUnits, http, parseAbi } from 'viem';

const execFile = promisify(execFileCallback);

export const QWAP = Object.freeze({
  url: 'https://testnet.qwap.xyz/',
  domain: 'testnet.qwap.xyz',
  chainId: 19480,
  wallet: 'MetaMask',
  walletAddress: '0x6ba7c2cb493834d922028ee7b2c33ab99b0c6210',
  router: '0x93aff45f28e5df1b55f5aefefb807de843b12619',
  inputToken: '0x9aa510295ac664a3d5a3182a3efe959de2b12c34',
  outputToken: '0xdff68e53a0a8275212927c12017f5ab5f1842a04',
  value: '10000000000000000',
  minimumOutput: '9000',
  maxDeadlineSeconds: 1200,
  maxGasUnits: '10000000000000000',
  gasLimit: '300000',
  maxFeePerGas: '33333333333',
  evidence: [
    'browser-and-wallet-recording',
    'wallet-request',
    'swap-receipt',
    'rpc-proof',
    'session-log',
    'browser-result',
  ],
});

const lower = value => typeof value === 'string' ? value.toLowerCase() : '';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const sameShape = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

export function qwapPlanDefinition() {
  return {
    requirements: [{ id: 'REQ-QWAP-SWAP', text: 'Swap exactly 0.01 QMS for USDC on QMS Testnet and show success feedback.' }],
    testing_budget: { max_native_gas_units: QWAP.maxGasUnits, max_successful_swaps: 1, allowance_type: 'none',
      qwap_native_value_units: QWAP.value, qwap_minimum_output_units: QWAP.minimumOutput, qwap_max_deadline_seconds: QWAP.maxDeadlineSeconds },
    test_case: { id: 'QWAP-SWAP-01', requirement_id: 'REQ-QWAP-SWAP', fixture: 'qwap-qms-usdc', priority: 'critical',
      depends_on: [], preconditions: [], evidence: QWAP.evidence,
      steps: [
        { id: 'CONNECT', action: 'Connect the approved MetaMask wallet to Qwap on QMS Testnet', expected: 'Approved account and QMS Testnet shown' },
        { id: 'QUOTE', action: 'Enter exactly 0.01 QMS for USDC', expected: 'Wallet request has the approved QMS value and USDC route' },
        { id: 'SWAP', action: 'Confirm exactly one approved QMS to USDC swap', expected: 'Successful RPC receipt and USDC output at least the approved minimum' },
        { id: 'NOTIFY', action: 'Observe Qwap after the submitted swap', expected: 'Network success message displayed after wallet confirmation' },
      ],
    },
  };
}

export async function waitForRpcConfirmation({ client, hash, attempts = 12, delayMs = 5_000, sleep = delay => new Promise(resolve => setTimeout(resolve, delay)) }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const transaction = await client.getTransaction({ hash });
      const receipt = await client.getTransactionReceipt({ hash });
      if (transaction && receipt) return { transaction, receipt };
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  const detail = String(lastError?.shortMessage ?? lastError?.message ?? 'transaction or receipt unavailable').replace(/[\r\n]+/g, ' ').slice(0, 300);
  throw new Error(`Qwap RPC confirmation timed out; requires inspection: ${detail}`);
}

/**
 * This is intentionally an admission check, not a best-effort compatibility
 * check. Any change to the journey needs a separately reviewed adapter.
 */
export function supportsQwapPlan(plan) {
  if (!plan || typeof plan !== 'object' || plan.schema_version !== '0.1' ||
      typeof plan.job_id !== 'string' || !plan.job_id || !Number.isInteger(plan.plan_version) || plan.plan_version < 1 ||
      !/^[a-f0-9]{64}$/.test(plan.approval?.approved_plan_hash ?? '') ||
      plan.target?.url !== QWAP.url || plan.target.chain_id !== QWAP.chainId ||
      plan.target.wallet !== QWAP.wallet || plan.target.domain !== QWAP.domain ||
      lower(plan.target.wallet_address) !== QWAP.walletAddress || lower(plan.target.router_address) !== QWAP.router) return false;

  const testing = plan.budgets?.testing;
  const definition = qwapPlanDefinition();
  if (!testing || !sameShape(testing, definition.testing_budget) ||
      !sameShape(plan.requirements, definition.requirements)) return false;

  const tokens = Object.values(plan.target.tokens ?? {});
  if (tokens.length !== 2 || !tokens.some(token => lower(token?.address) === QWAP.inputToken && token.decimals === 18) ||
      !tokens.some(token => lower(token?.address) === QWAP.outputToken && token.decimals === 6)) return false;

  if (plan.limits?.max_attempts_total_per_case !== 1 || plan.cases?.length !== 1) return false;
  const testCase = plan.cases[0];
  if (!testCase || !sameShape(Object.keys(testCase).sort(), ['depends_on', 'evidence', 'fixture', 'id', 'preconditions', 'priority', 'requirement_id', 'steps']) ||
    !sameShape({ id: testCase.id, requirement_id: testCase.requirement_id, fixture: testCase.fixture,
    priority: testCase.priority, depends_on: testCase.depends_on, preconditions: testCase.preconditions, evidence: testCase.evidence, steps: testCase.steps },
    definition.test_case)) return false;

  return true;
}

export function signingPolicyFor(plan) {
  if (!supportsQwapPlan(plan)) throw new Error('Unsupported Qwap plan');
  return Object.freeze({
    wallet_address: QWAP.walletAddress,
    domain: QWAP.domain,
    chain_id: QWAP.chainId,
    router_address: QWAP.router,
    input_token: QWAP.inputToken,
    output_token: QWAP.outputToken,
    value: QWAP.value,
    minimum_output_units: QWAP.minimumOutput,
    gas_limit: QWAP.gasLimit,
    max_fee_per_gas: QWAP.maxFeePerGas,
    max_total_fee_wei: plan.budgets.testing.max_native_gas_units,
    max_deadline_seconds: QWAP.maxDeadlineSeconds,
  });
}

function assertRunContext(context) {
  if (!context || !supportsQwapPlan(context.plan) || !isAbsolute(context.outputDir ?? '') ||
      context.job?.id !== context.authorization?.payment_job_id || context.job?.inputHash !== context.authorization?.input_hash ||
      context.plan.job_id !== context.authorization?.approved_job_id ||
      context.plan.plan_version !== context.authorization?.plan_version ||
      context.plan.approval?.approved_plan_hash !== context.authorization?.approved_plan_hash ||
      typeof context.authorization?.session_id !== 'string' || !context.authorization.session_id ||
      !Number.isFinite(Date.parse(context.authorization?.started_at))) {
    throw new Error('Qwap runner context is not host-authorized for this exact plan');
  }
}

async function writeRunContext(context) {
  await mkdir(context.outputDir, { recursive: true, mode: 0o700 });
  const outputDir = await realpath(context.outputDir);
  const payload = {
    schemaVersion: 1,
    job: context.job,
    plan: context.plan,
    authorization: context.authorization,
    signingPolicy: signingPolicyFor(context.plan),
    outputDir,
  };
  const file = join(outputDir, 'run-context.json');
  await writeFile(file, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return { file, outputDir, payload };
}

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel && !rel.startsWith('..') && !isAbsolute(rel);
}

async function findSingle(root, name) {
  const found = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && entry.name === name) found.push(file);
    }
  }
  await visit(root);
  if (found.length !== 1) throw new Error(`Expected exactly one ${name} from the Qwap browser run`);
  return found[0];
}

function browserPassed(json) {
  const results = suites => suites.flatMap(suite => [
    ...(suite.specs ?? []).flatMap(spec => (spec.tests ?? []).flatMap(test => test.results ?? [])),
    ...results(suite.suites ?? []),
  ]);
  const attempts = results(json.suites ?? []);
  if (attempts.length !== 1 || !['passed', 'failed', 'timedOut', 'interrupted'].includes(attempts[0].status)) {
    throw new Error('Qwap Playwright output does not contain one terminal browser attempt');
  }
  return attempts[0].status === 'passed';
}

function transactionHash(value) {
  const hash = /^0x[0-9a-f]{64}$/i.exec(value ?? '')?.[0];
  if (!hash) throw new Error('Qwap browser journal has no transaction hash returned by MetaMask');
  return hash;
}

export async function reconcileQwapRun({ root, outputDir, plan, submittedPath, authorization }) {
  const submitted = JSON.parse(await readFile(submittedPath, 'utf8'));
  if (!submitted || submitted.status !== 'submitted' || submitted.approved_job_id !== authorization.approved_job_id ||
      submitted.plan_version !== authorization.plan_version || submitted.approved_plan_hash !== authorization.approved_plan_hash ||
      submitted.session_id !== authorization.session_id || submitted.started_at !== authorization.started_at ||
      !Number.isFinite(Date.parse(submitted.submittedAt))) {
    throw new Error('Qwap submitted journal is not bound to this host-authorized execution');
  }
  const hash = transactionHash(submitted.transactionHash);
  const runDir = dirname(submittedPath);
  const rpcProof = join(runDir, 'rpc-proof.json');
  const client = createPublicClient({ transport: http('https://rpc.testnet.qms.finance') });
  const { transaction, receipt: rpcReceipt } = await waitForRpcConfirmation({ client, hash });
  const block = await client.getBlock({ blockNumber: rpcReceipt.blockNumber });
  const rpc = { rpcUrl: 'https://rpc.testnet.qms.finance', capturedAt: new Date().toISOString(), transaction, receipt: rpcReceipt,
    block: { number: block.number, hash: block.hash, timestamp: block.timestamp } };
  await writeFile(rpcProof, JSON.stringify(rpc, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2), {
    encoding: 'utf8', mode: 0o600, flag: 'wx',
  });
  const proof = JSON.parse(await readFile(rpcProof, 'utf8'));
  const tx = proof.transaction;
  const receipt = proof.receipt;
  const blockProof = proof.block;
  const decoded = decodeFunctionData({ abi: parseAbi(['function swapExactETHForTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline)']), data: tx.input });
  const [minimum, path, recipient, deadline] = decoded.args;
  const same = (left, right) => lower(String(left)) === lower(String(right));
  const expected = signingPolicyFor(plan);
  const requested = submitted.transaction_request?.transaction;
  const requestedAt = Date.parse(submitted.transaction_request?.capturedAt);
  const chainFee = tx.maxFeePerGas ?? tx.gasPrice;
  const sameInteger = (left, right) => {
    try { return BigInt(left) === BigInt(right); } catch { return false; }
  };
  const transfer = receipt.logs?.find(log => same(log.address, expected.output_token) &&
    lower(log.topics?.[0]) === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' &&
    lower(log.topics?.[2]) === `0x${expected.wallet_address.slice(2).padStart(64, '0')}`);
  if (!requested || !Number.isFinite(requestedAt) || receipt.status !== 'success' || !same(tx.hash, hash) || !same(tx.from, expected.wallet_address) ||
      !same(tx.to, expected.router_address) || String(tx.value) !== expected.value ||
      !same(tx.from, requested.from) || !same(tx.to, requested.to) || !same(tx.input, requested.data) ||
      !sameInteger(tx.value, requested.value) || !sameInteger(tx.gas, requested.gas) || !sameInteger(chainFee, requested.maxFeePerGas) ||
      !Array.isArray(path) || path.length !== 2 || !same(path[0], expected.input_token) || !same(path[1], expected.output_token) ||
      !same(recipient, expected.wallet_address) || BigInt(minimum) < BigInt(expected.minimum_output_units) ||
      BigInt(tx.gas) > BigInt(expected.gas_limit) || BigInt(chainFee) > BigInt(expected.max_fee_per_gas) ||
      BigInt(tx.gas) * BigInt(chainFee) > BigInt(expected.max_total_fee_wei) ||
      BigInt(deadline) < BigInt(blockProof.timestamp) || BigInt(deadline) > BigInt(Math.floor(requestedAt / 1000) + expected.max_deadline_seconds) ||
      !transfer || BigInt(transfer.data) <= 0n || BigInt(transfer.data) < BigInt(minimum) || !blockProof?.hash || !receipt.blockNumber) {
    throw new Error('RPC reconciliation does not match the approved Qwap signing policy');
  }
  const recovery = {
    verifiedAt: new Date().toISOString(), status: 'confirmed-on-rpc', transactionUrl: `https://testnet.qmsscan.io/tx/${hash}`,
    amountQms: '0.01', minimumUsdcRaw: String(minimum), from: tx.from, router: tx.to,
    nonce: Number(tx.nonce), deadline: String(deadline), block: Number(receipt.blockNumber),
    blockTimestamp: new Date(Number(blockProof.timestamp) * 1000).toISOString(),
    receivedUsdc: formatUnits(BigInt(transfer.data), 6), hashSource: 'MetaMask transaction hash captured by the browser journal; RPC transaction, receipt, and block captured by trusted runner.',
  };
  const recoveryPath = join(runDir, 'swap-recovery.json');
  await writeFile(recoveryPath, JSON.stringify(recovery, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return { report: relative(root, join(outputDir, 'report.json')), runDirectory: relative(root, runDir),
    recovery: relative(root, recoveryPath), rpcProof: relative(root, rpcProof), hash };
}

function artifact(manifest, id, path) {
  const entry = manifest.files?.find(item => item.path === path);
  if (!entry || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes)) {
    throw new Error(`Qwap evidence artifact missing: ${id}`);
  }
  return { id, path: entry.path, sha256: entry.sha256, byte_size: entry.bytes };
}

export function artifactsFromManifest(manifest) {
  const artifacts = [
    artifact(manifest, 'browser-and-wallet-recording', 'recordings/recording-1.webm'),
    artifact(manifest, 'wallet-request', 'assets/wallet-transaction.png'),
    artifact(manifest, 'swap-receipt', 'logs/swap-recovery.json'),
    artifact(manifest, 'rpc-proof', 'logs/rpc-proof.json'),
    artifact(manifest, 'session-log', 'logs/execution-record.json'),
    artifact(manifest, 'browser-result', 'logs/playwright-swap.json'),
  ];
  const trace = manifest.files?.find(item => item.path === 'traces/playwright-trace.zip');
  if (trace) artifacts.push(artifact(manifest, 'trace', 'traces/playwright-trace.zip'));
  return artifacts;
}

export function createTrustedRunnerAdapter({
  projectRoot = process.env.WEB3LANE_PROJECT_ROOT ?? process.cwd(),
  exec = execFile,
  now = () => new Date().toISOString(),
} = {}) {
  return Object.freeze({
    supports: supportsQwapPlan,
    async run(context) {
      assertRunContext(context);
      if (!inside(join(resolve(projectRoot), '.local'), resolve(context.outputDir))) throw new Error('Qwap runner output must be inside the project .local directory');
      await mkdir(context.outputDir, { recursive: true, mode: 0o700 });
      const root = await realpath(resolve(projectRoot));
      const outputDir = await realpath(context.outputDir);
      if (!inside(join(root, '.local'), outputDir)) throw new Error('Qwap runner output must be inside the project .local directory');
      const { file: contextFile } = await writeRunContext(context);
      const playwrightOutput = join(outputDir, 'playwright');
      let browser;
      try {
        browser = await exec(process.execPath, [join(root, 'node_modules', '.bin', 'playwright'), 'test', '--config', 'playwright.swap.config.ts', '--reporter=json', '--output', playwrightOutput], {
          cwd: root,
          env: { ...process.env, WEB3LANE_RUN_CONTEXT_FILE: contextFile },
          maxBuffer: 64 * 1024 * 1024,
        });
      } catch (error) {
        browser = { stdout: error?.stdout ?? '', stderr: error?.stderr ?? '' };
      }
      const reportPath = join(outputDir, 'report.json');
      await writeFile(reportPath, browser.stdout, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      let report;
      try { report = JSON.parse(browser.stdout); }
      catch { throw new Error('Qwap Playwright failed without a JSON report; transaction state requires inspection'); }
      const passed = browserPassed(report);
      const submitted = await findSingle(playwrightOutput, 'submitted.json');
      const capture = await reconcileQwapRun({ root, outputDir, plan: context.plan, submittedPath: submitted, authorization: context.authorization });
      const observations = [
        { case_id: 'QWAP-SWAP-01', step_id: 'CONNECT', attempt: 1, assertion_met: true, observed: 'Qwap connected to the approved MetaMask account on QMS Testnet before transaction submission.', evidence_refs: ['browser-and-wallet-recording', 'browser-result'] },
        { case_id: 'QWAP-SWAP-01', step_id: 'QUOTE', attempt: 1, assertion_met: true, observed: 'The approved 0.01 QMS wallet request and route were captured before confirmation.', evidence_refs: ['wallet-request', 'browser-result'] },
        { case_id: 'QWAP-SWAP-01', step_id: 'SWAP', attempt: 1, assertion_met: true, observed: `RPC-confirmed QMS to USDC swap ${capture.hash}.`, evidence_refs: ['browser-and-wallet-recording', 'swap-receipt', 'rpc-proof', 'session-log'], transaction: { hash: capture.hash, status: 'success' } },
        { case_id: 'QWAP-SWAP-01', step_id: 'NOTIFY', attempt: 1, assertion_met: passed, observed: passed ? 'Qwap displayed network success feedback after the swap.' : 'Qwap success feedback was not established by the browser case.', evidence_refs: ['browser-result'] },
      ];
      const executionRecord = {
        schemaVersion: 1,
        payment_job_id: context.authorization.payment_job_id,
        input_hash: context.authorization.input_hash,
        approved_job_id: context.authorization.approved_job_id,
        plan_version: context.authorization.plan_version,
        approved_plan_hash: context.authorization.approved_plan_hash,
        session_id: context.authorization.session_id,
        started_at: context.authorization.started_at,
        recorded_at: now(),
        observations,
      };
      const rootRelative = value => relative(root, resolve(root, value));
      const recordPath = join(outputDir, 'execution-record.json');
      await writeFile(recordPath, JSON.stringify(executionRecord, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      const inputPath = join(outputDir, 'report-input.json');
      const bundleDir = join(outputDir, 'bundle');
      const reportInput = {
        schemaVersion: 1,
        title: 'Qwap 0.01 QMS Preprod swap',
        report: capture.report,
        runDirectory: capture.runDirectory,
        recovery: capture.recovery,
        rpcProof: capture.rpcProof,
        approvedPlan: `.local/approved-plans/${context.plan.job_id}.json`,
        executionRecord: rootRelative(recordPath),
      };
      await writeFile(inputPath, JSON.stringify(reportInput, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await exec(process.execPath, ['scripts/build-evidence-report.mjs', rootRelative(inputPath), rootRelative(bundleDir)], { cwd: root, env: process.env, maxBuffer: 64 * 1024 * 1024 });
      const manifest = JSON.parse(await readFile(join(bundleDir, 'manifest.json'), 'utf8'));
      return {
        ...executionRecord,
        bundle_dir: bundleDir,
        artifacts: artifactsFromManifest(manifest),
      };
    },
  });
}

export default createTrustedRunnerAdapter();
