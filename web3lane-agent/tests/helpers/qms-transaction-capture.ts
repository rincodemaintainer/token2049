import { expect, type Page } from "@playwright/test";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const QWAP_ORIGIN = "https://testnet.qwap.xyz";
const ROUTER = "0x93aff45f28e5df1b55f5aefefb807de843b12619";
const QMS = "0x9aa510295ac664a3d5a3182a3efe959de2b12c34";
const USDC = "0xdff68e53a0a8275212927c12017f5ab5f1842a04";
const SWAP_EXACT_ETH_FOR_TOKENS = "0x7ff36ab5";

type RecordValue = Record<string, unknown>;

export type QmsSigningPolicy = Readonly<{
  wallet_address: string;
  domain: "testnet.qwap.xyz";
  chain_id: 19480;
  router_address: string;
  input_token: string;
  output_token: string;
  value: "10000000000000000";
  minimum_output_units: string;
  gas_limit: string;
  max_fee_per_gas: string;
  max_total_fee_wei: string;
  max_deadline_seconds: number;
}>;

export type QmsRunContext = Readonly<{
  schemaVersion: 1;
  job: { id: string; inputHash: string; input: { approved_job_id: string; plan_version: number; approved_plan_hash: string } };
  plan: RecordValue;
  authorization: RecordValue;
  signingPolicy: QmsSigningPolicy;
  outputDir: string;
}>;

export type CapturedQmsTransaction = Readonly<{
  origin: string;
  chainId: number;
  capturedAt: string;
  transaction: Record<string, string>;
  decoded: { minimumOutput: string; path: string[]; recipient: string; deadline: string };
}>;

export function injectBoundedGasAndFee(
  transaction: Record<string, string>,
  policy: Pick<QmsSigningPolicy, "gas_limit" | "max_fee_per_gas" | "max_total_fee_wei">,
  estimate: { gas?: string; maxFeePerGas?: string },
): Record<string, string> {
  const bounded = { ...transaction, gas: transaction.gas ?? estimate.gas, maxFeePerGas: transaction.maxFeePerGas ?? estimate.maxFeePerGas };
  const gas = transactionInteger(bounded.gas, "gas");
  const maxFee = transactionInteger(bounded.maxFeePerGas, "maxFeePerGas");
  if (gas <= 0n || maxFee <= 0n || gas > BigInt(policy.gas_limit) || maxFee > BigInt(policy.max_fee_per_gas) ||
      gas * maxFee > BigInt(policy.max_total_fee_wei)) {
    throw new Error("Signing blocked: transaction exceeds approved signing caps");
  }
  return bounded;
}

function object(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Signing blocked: ${label} must be an object`);
  return value as RecordValue;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Signing blocked: ${label} is required`);
  return value;
}

function integer(value: unknown, label: string): bigint {
  const string = text(value, label);
  if (!/^\d+$/.test(string)) throw new Error(`Signing blocked: ${label} must be a base-unit integer`);
  return BigInt(string);
}

function address(value: string, label: string): string {
  if (!/^0x[0-9a-f]{40}$/i.test(value)) throw new Error(`Signing blocked: ${label} is not an address`);
  return value.toLowerCase();
}

function transactionInteger(value: string | undefined, label: string): bigint {
  if (!value || !/^(0x[0-9a-f]+|[0-9]+)$/i.test(value)) throw new Error(`Signing blocked: transaction ${label} must be explicit`);
  return BigInt(value);
}

function word(data: string, index: number): string {
  const start = 10 + index * 64;
  const value = data.slice(start, start + 64);
  if (value.length !== 64) throw new Error("Signing blocked: truncated swap calldata");
  return value;
}

export function decodeQmsSwapCalldata(data: string) {
  const expectedLength = 2 + 8 + 64 * 7;
  if (!/^0x[0-9a-f]+$/i.test(data) || !data.startsWith(SWAP_EXACT_ETH_FOR_TOKENS) || data.length !== expectedLength) {
    throw new Error("Signing blocked: expected swapExactETHForTokens calldata");
  }
  const minimumOutput = BigInt(`0x${word(data, 0)}`);
  const pathOffset = Number(BigInt(`0x${word(data, 1)}`));
  if (pathOffset !== 128) throw new Error("Signing blocked: unexpected swap path offset");
  const recipient = address(`0x${word(data, 2).slice(24)}`, "calldata recipient");
  const deadline = BigInt(`0x${word(data, 3)}`);
  const pathStart = 10 + pathOffset * 2;
  const lengthWord = data.slice(pathStart, pathStart + 64);
  if (lengthWord.length !== 64 || BigInt(`0x${lengthWord}`) !== 2n) throw new Error("Signing blocked: expected two-token swap path");
  const token = (index: number) => address(`0x${data.slice(pathStart + 64 + index * 64 + 24, pathStart + 64 + (index + 1) * 64)}`, "calldata path");
  return { minimumOutput: minimumOutput.toString(), path: [token(0), token(1)], recipient, deadline: deadline.toString() };
}

export function popupIntegerField(details: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = details.match(new RegExp(`${escaped}\\s*:?\\s*(\\d+)`, "i"));
  if (!match) throw new Error(`Signing blocked: wallet popup did not show ${label}`);
  return match[1]!;
}

export function parseGwei(value: string): bigint {
  const match = value.match(/^(\d+)(?:\.(\d{1,9}))?$/);
  if (!match) throw new Error("Signing blocked: wallet fee is not an exact GWEI value");
  return BigInt(match[1]!) * 1_000_000_000n + BigInt((match[2] ?? "").padEnd(9, "0"));
}

function assertContext(context: QmsRunContext) {
  const plan = object(context.plan, "approved plan");
  const approval = object(plan.approval, "approved plan approval");
  const target = object(plan.target, "approved plan target");
  const budgets = object(plan.budgets, "approved plan budgets");
  const testing = object(budgets.testing, "approved testing budget");
  const limits = object(plan.limits, "approved plan limits");
  const auth = object(context.authorization, "host authorization");
  const input = object(context.job.input, "paid job input");
  const operatorTest = process.env.WEB3LANE_OPERATOR_TEST === "1";
  const fundedAuthorization = auth.payment_state === "x402-settled" || auth.escrow_state === "FundsLocked";
  const operatorAuthorization = auth.mode === "operator-test" && auth.operator_authorized === true && approval.requester_id === "operator";
  if (context.schemaVersion !== 1 || !context.job.id || !context.job.inputHash ||
      input.approved_job_id !== plan.job_id || input.approved_job_id !== auth.approved_job_id ||
      input.plan_version !== plan.plan_version || input.plan_version !== auth.plan_version ||
      input.approved_plan_hash !== approval.approved_plan_hash || input.approved_plan_hash !== auth.approved_plan_hash ||
      context.job.inputHash !== auth.input_hash || auth.payment_job_id !== context.job.id ||
      (operatorTest ? !operatorAuthorization : !fundedAuthorization)) {
    throw new Error("Signing blocked: approved plan and funded host authorization are not bound");
  }
  const policy = context.signingPolicy;
  if (target.chain_id !== 19480 || new URL(text(target.url, "plan target URL")).origin !== QWAP_ORIGIN ||
      policy.chain_id !== 19480 || policy.domain !== "testnet.qwap.xyz" ||
      address(policy.router_address, "router") !== ROUTER || address(policy.input_token, "input token") !== QMS ||
      address(policy.output_token, "output token") !== USDC || policy.value !== "10000000000000000" ||
      address(text(target.router_address, "plan router"), "plan router") !== ROUTER ||
      address(text(target.wallet_address, "plan wallet"), "plan wallet") !== address(policy.wallet_address, "wallet") ||
      text(testing.qwap_native_value_units, "plan QMS value") !== policy.value ||
      text(testing.qwap_minimum_output_units, "plan minimum output") !== policy.minimum_output_units ||
      Number(testing.qwap_max_deadline_seconds) !== policy.max_deadline_seconds ||
      text(testing.max_native_gas_units, "plan total fee cap") !== policy.max_total_fee_wei ||
      limits.max_attempts_total_per_case !== 1 || testing.max_successful_swaps !== 1 ||
      integer(policy.minimum_output_units, "minimum output") <= 0n || integer(policy.gas_limit, "gas cap") <= 0n ||
      integer(policy.max_fee_per_gas, "max fee") <= 0n || integer(policy.max_total_fee_wei, "max total fee") <= 0n ||
      !Number.isInteger(policy.max_deadline_seconds) || policy.max_deadline_seconds <= 0) {
    throw new Error("Signing blocked: context is not the supported Qwap 0.01 QMS policy");
  }
}

export async function loadQmsRunContext(file = process.env.WEB3LANE_RUN_CONTEXT_FILE): Promise<QmsRunContext> {
  if (!file || !path.isAbsolute(file)) throw new Error("Signing blocked: WEB3LANE_RUN_CONTEXT_FILE must be an absolute path");
  const metadata = await stat(file);
  if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) throw new Error("Signing blocked: run context must be a mode 0600 file");
  const context = JSON.parse(await readFile(file, "utf8")) as QmsRunContext;
  assertContext(context);
  return context;
}

export async function installQmsTransactionCapture(page: Page, context: QmsRunContext) {
  const observedChain = await page.evaluate(async () => {
    const provider = (window as unknown as { ethereum?: { request?: (input: { method: string }) => Promise<string> } }).ethereum;
    return provider?.request?.({ method: "eth_chainId" });
  });
  if (observedChain?.toLowerCase() !== "0x4c18") throw new Error("Signing blocked: wallet is not on QMS Testnet (19480)");
  await page.evaluate((policy) => {
    const provider = (window as unknown as { ethereum?: { request?: (input: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!provider?.request || (window as unknown as Record<string, unknown>).__web3laneCaptureInstalled) throw new Error("Signing blocked: EIP-1193 provider is unavailable or already intercepted");
    const original = provider.request.bind(provider);
    let captured: Record<string, string> | undefined;
    let transactionHash: string | undefined;
    provider.request = async input => {
      if (input.method === "eth_sendTransaction") {
        if (captured) throw new Error("Signing blocked: more than one transaction request");
        const transaction = input.params?.[0];
        if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) throw new Error("Signing blocked: invalid transaction request");
        const candidate = { ...(transaction as Record<string, string>) };
        const parse = (value: string | undefined, label: string) => {
          if (!value || !/^(0x[0-9a-f]+|[0-9]+)$/i.test(value)) throw new Error(`Signing blocked: transaction ${label} must be explicit`);
          return BigInt(value);
        };
        if (!candidate.gas) candidate.gas = await original({ method: "eth_estimateGas", params: [candidate] }) as string;
        if (!candidate.maxFeePerGas) candidate.maxFeePerGas = await original({ method: "eth_gasPrice" }) as string;
        if (candidate.to?.toLowerCase() !== policy.router_address.toLowerCase() || parse(candidate.value, "value") !== BigInt(policy.value) ||
            parse(candidate.gas, "gas") <= 0n || parse(candidate.maxFeePerGas, "maxFeePerGas") <= 0n ||
            parse(candidate.gas, "gas") > BigInt(policy.gas_limit) || parse(candidate.maxFeePerGas, "maxFeePerGas") > BigInt(policy.max_fee_per_gas) ||
            parse(candidate.gas, "gas") * parse(candidate.maxFeePerGas, "maxFeePerGas") > BigInt(policy.max_total_fee_wei)) {
          throw new Error("Signing blocked: transaction exceeds approved signing caps");
        }
        captured = { ...candidate };
        const result = await original({ ...input, params: [candidate, ...(input.params?.slice(1) ?? [])] });
        if (typeof result !== "string" || !/^0x[0-9a-f]{64}$/i.test(result)) throw new Error("Signing blocked: wallet did not return a transaction hash");
        transactionHash = result;
        return result;
      }
      return original(input);
    };
    Object.defineProperty(window, "__web3laneCaptureInstalled", { value: true, writable: false, configurable: false });
    Object.defineProperty(window, "__web3laneCapturedTransaction", {
      value: () => ({ transaction: captured ? { ...captured } : undefined, transactionHash }),
      writable: false,
      configurable: false,
    });
  }, context.signingPolicy);
  return {
    read: async (): Promise<CapturedQmsTransaction> => {
      const captured = await page.evaluate(() => (window as unknown as Record<string, () => { transaction?: Record<string, string> } | undefined>).__web3laneCapturedTransaction?.());
      const transaction = captured?.transaction;
      if (!transaction) throw new Error("Signing blocked: MetaMask transaction was not captured before confirmation");
      const decoded = decodeQmsSwapCalldata(transaction.data ?? "");
      const capturedAt = new Date().toISOString();
      validateQmsTransaction({ origin: new URL(page.url()).origin, chainId: 19480, capturedAt, transaction, decoded }, context);
      return { origin: QWAP_ORIGIN, chainId: 19480, capturedAt, transaction, decoded };
    },
    readHash: async (): Promise<string> => {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const captured = await page.evaluate(() => (window as unknown as Record<string, () => { transactionHash?: string } | undefined>).__web3laneCapturedTransaction?.());
        if (captured?.transactionHash && /^0x[0-9a-f]{64}$/i.test(captured.transactionHash)) return captured.transactionHash;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error("Signing blocked: no transaction hash returned after confirmation");
    },
  };
}

export function validateQmsTransaction(captured: CapturedQmsTransaction, context: QmsRunContext) {
  assertContext(context);
  const policy = context.signingPolicy;
  const transaction = captured.transaction;
  const capturedAt = Date.parse(captured.capturedAt);
  if (captured.origin !== QWAP_ORIGIN || captured.chainId !== 19480 ||
      address(transaction.from ?? "", "transaction from") !== address(policy.wallet_address, "wallet") ||
      address(transaction.to ?? "", "transaction router") !== ROUTER ||
      transactionInteger(transaction.value, "value") !== BigInt(policy.value) ||
      transactionInteger(transaction.gas, "gas") > BigInt(policy.gas_limit) ||
      transactionInteger(transaction.maxFeePerGas, "maxFeePerGas") > BigInt(policy.max_fee_per_gas) ||
      transactionInteger(transaction.gas, "gas") * transactionInteger(transaction.maxFeePerGas, "maxFeePerGas") > BigInt(policy.max_total_fee_wei) ||
      captured.decoded.path.join(",") !== `${QMS},${USDC}` || captured.decoded.recipient !== address(policy.wallet_address, "wallet") ||
      BigInt(captured.decoded.minimumOutput) < BigInt(policy.minimum_output_units) ||
      !Number.isFinite(capturedAt) ||
      BigInt(captured.decoded.deadline) < BigInt(Math.floor(Date.now() / 1000)) ||
      BigInt(captured.decoded.deadline) > BigInt(Math.floor(capturedAt / 1000 + policy.max_deadline_seconds))) {
    throw new Error("Signing blocked: captured transaction differs from the approved Qwap policy");
  }
}

export async function verifyQmsWalletPopup(popup: Page, context: QmsRunContext, captured: CapturedQmsTransaction) {
  await expect(popup.getByRole("heading", { name: "Transaction request", exact: true })).toBeVisible();
  await expect(popup.getByText("testnet.qwap.xyz", { exact: true })).toBeVisible();
  await expect(popup.getByText("QMS Testnet", { exact: true })).toBeVisible();
  await expect(popup.locator("body")).toContainText(/Amount\s*0\.01\s*QMS/);
  await popup.getByRole("button", { name: "Advanced tx details", exact: true }).click();
  await expect(popup.getByText("swapExactETHForTokens", { exact: true })).toBeVisible();
  const details = await popup.locator("body").innerText();
  const policy = context.signingPolicy;
  expect(popupIntegerField(details, "Param #1"), "Wallet minimum output must match captured calldata").toBe(captured.decoded.minimumOutput);
  expect(popupIntegerField(details, "Param #4"), "Wallet deadline must match captured calldata").toBe(captured.decoded.deadline);
  const editGasFee = popup.getByRole("button", { name: "", exact: true });
  await expect(editGasFee).toHaveCount(1);
  await editGasFee.click();
  await expect(popup.getByRole("heading", { name: /edit gas fee/i })).toBeVisible();
  await popup.getByRole("button", { name: "custom", exact: true }).click();
  await expect(popup.getByRole("heading", { name: /advanced gas fee/i })).toBeVisible();
  const gasLimit = (await popup.locator("body").innerText()).match(/Gas limit\s+(\d+)\s+Edit/)?.[1];
  expect(gasLimit, "Wallet gas limit must be visible").toBe(transactionInteger(captured.transaction.gas, "gas").toString());
  const maxBaseFee = parseGwei(await popup.getByRole("spinbutton", { name: /^Max base fee \(GWEI\)/ }).inputValue());
  const priorityFee = parseGwei(await popup.getByRole("spinbutton", { name: /^Priority Fee \(GWEI\)/ }).inputValue());
  const visibleMaxFee = maxBaseFee + priorityFee;
  if (visibleMaxFee <= 0n || visibleMaxFee > BigInt(policy.max_fee_per_gas) ||
      BigInt(gasLimit!) * visibleMaxFee > BigInt(policy.max_total_fee_wei)) {
    throw new Error("Signing blocked: MetaMask fee editor exceeds the approved caps");
  }
  await popup.getByRole("button", { name: "Close", exact: true }).click();
  if (await popup.getByRole("heading", { name: /edit gas fee/i }).isVisible().catch(() => false)) {
    await popup.getByRole("button", { name: "Close", exact: true }).click();
  }
  await expect(popup.getByRole("heading", { name: /advanced gas fee|edit gas fee/i })).toBeHidden();
  await expect(popup.getByRole("button", { name: "Confirm", exact: true })).toBeVisible();
  for (const [short, full] of [["0x93AFF...12619", ROUTER], ["0x9AA51...12c34", QMS], ["0xDfF68...42a04", USDC]] as const) {
    await popup.getByText(short, { exact: true }).click();
    expect((await popup.getByRole("textbox", { name: "Address", exact: true }).inputValue()).toLowerCase()).toBe(full);
    await popup.getByRole("button", { name: "Close", exact: true }).click();
  }
  const route = details.slice(details.indexOf("Param #2"), details.indexOf("Param #3"));
  if (route.indexOf("0x9AA51...12c34") < 0 || route.indexOf("0xDfF68...42a04") < route.indexOf("0x9AA51...12c34")) {
    throw new Error("Signing blocked: wallet route differs from captured calldata");
  }
  const recipientAccount = popup.getByText("Account 1", { exact: true });
  await expect(recipientAccount).toHaveCount(2);
  await popup.getByRole("button", { name: "Account details", exact: true }).click();
  const expectedWallet = address(policy.wallet_address, "wallet");
  await expect(popup.getByRole("dialog").getByRole("button", {
    name: new RegExp(`^${expectedWallet.slice(0, 7)}\\.\\.\\.${expectedWallet.slice(-5)}$`, "i"),
  })).toBeVisible();
  await popup.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  validateQmsTransaction(captured, context);
}
