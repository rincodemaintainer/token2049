import assert from "node:assert/strict";
import { it } from "node:test";
import { decodeQmsSwapCalldata, injectBoundedGasAndFee, parseGwei, popupIntegerField, validateQmsTransaction, type CapturedQmsTransaction, type QmsRunContext } from "./qms-transaction-capture.ts";

const wallet = "0x6Ba7c2Cb493834d922028EE7B2c33aB99b0c6210";
const router = "0x93AFF45f28e5DF1b55f5AEFEfB807De843b12619";
const qms = "0x9AA510295aC664A3d5A3182a3eFe959DE2B12c34";
const usdc = "0xDfF68E53a0A8275212927c12017f5aB5f1842a04";

const word = (value: bigint) => value.toString(16).padStart(64, "0");
const addressWord = (value: string) => value.slice(2).toLowerCase().padStart(64, "0");
const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
const data = `0x7ff36ab5${word(9000n)}${word(128n)}${addressWord(wallet)}${word(deadline)}${word(2n)}${addressWord(qms)}${addressWord(usdc)}`;

function context(): QmsRunContext {
  const hash = "a".repeat(64);
  const jobId = "00000000-0000-4000-8000-000000000000";
  const approvedJobId = "00000000-0000-4000-8000-000000000001";
  return {
    schemaVersion: 1,
    job: { id: jobId, inputHash: "b".repeat(64), input: { approved_job_id: approvedJobId, plan_version: 1, approved_plan_hash: hash } },
    plan: { job_id: approvedJobId, plan_version: 1, approval: { approved_plan_hash: hash }, target: { url: "https://testnet.qwap.xyz/", chain_id: 19480, wallet_address: wallet, router_address: router }, budgets: { testing: { qwap_native_value_units: "10000000000000000", qwap_minimum_output_units: "9000", qwap_max_deadline_seconds: 1200, max_native_gas_units: "10000000000000000", max_successful_swaps: 1 } }, limits: { max_attempts_total_per_case: 1 } },
    authorization: { payment_job_id: jobId, input_hash: "b".repeat(64), approved_job_id: approvedJobId, plan_version: 1, approved_plan_hash: hash, session_id: "session", started_at: new Date().toISOString(), payment_state: "x402-settled", transaction: "tx" },
    signingPolicy: { wallet_address: wallet, domain: "testnet.qwap.xyz", chain_id: 19480, router_address: router, input_token: qms, output_token: usdc, value: "10000000000000000", minimum_output_units: "9000", gas_limit: "200000", max_fee_per_gas: "1000000000", max_total_fee_wei: "10000000000000000", max_deadline_seconds: 1200 },
    outputDir: "/tmp",
  };
}

function captured(): CapturedQmsTransaction {
  return { origin: "https://testnet.qwap.xyz", chainId: 19480, capturedAt: new Date().toISOString(), transaction: { from: wallet, to: router, value: "0x2386f26fc10000", gas: "0x30d40", maxFeePerGas: "0x3b9aca00", data }, decoded: decodeQmsSwapCalldata(data) };
}

it("decodes the exact two-token Qwap swap calldata", () => {
  assert.deepEqual(decodeQmsSwapCalldata(data), { minimumOutput: "9000", path: [qms.toLowerCase(), usdc.toLowerCase()], recipient: wallet.toLowerCase(), deadline: deadline.toString() });
});

it("rejects trailing calldata bytes", () => {
  assert.throws(() => decodeQmsSwapCalldata(`${data}00`), /Signing blocked/);
});

it("requires an explicit integer field in the wallet popup", () => {
  assert.equal(popupIntegerField("Gas limit\n200000", "Gas limit"), "200000");
  assert.throws(() => popupIntegerField("Gas limit unavailable", "Gas limit"), /Signing blocked/);
});

it("parses the exact fractional GWEI value shown by MetaMask", () => {
  assert.equal(parseGwei("0.000000015"), 15n);
  assert.equal(parseGwei("1"), 1_000_000_000n);
  assert.throws(() => parseGwei("0.0000000001"), /Signing blocked/);
});

it("rejects a path that is not QMS to USDC before confirmation", () => {
  const run = captured();
  run.decoded.path = [usdc.toLowerCase(), qms.toLowerCase()];
  assert.throws(() => validateQmsTransaction(run, context()), /Signing blocked/);
});

it("rejects a transaction with an implicit max fee", () => {
  const run = captured();
  delete run.transaction.maxFeePerGas;
  assert.throws(() => validateQmsTransaction(run, context()), /Signing blocked/);
});

it("injects a bounded gas estimate and fee before forwarding", () => {
  const bounded = injectBoundedGasAndFee({ to: router, value: "0x2386f26fc10000" }, context().signingPolicy,
    { gas: "0x30d40", maxFeePerGas: "0x3b9aca00" });
  assert.equal(bounded.gas, "0x30d40");
  assert.equal(bounded.maxFeePerGas, "0x3b9aca00");
});

it("rejects an injected fee that would exceed the total plan cap", () => {
  assert.throws(() => injectBoundedGasAndFee({}, context().signingPolicy,
    { gas: "0x30d40", maxFeePerGas: "0x2540be4000" }), /Signing blocked/);
});

it("rejects a plan that permits more than one swap", () => {
  const runContext = context();
  (runContext.plan.budgets as { testing: { max_successful_swaps: number } }).testing.max_successful_swaps = 2;
  assert.throws(() => validateQmsTransaction(captured(), runContext), /Signing blocked/);
});

it("rejects a paid job bound to another approved plan", () => {
  const runContext = context();
  runContext.plan.job_id = "00000000-0000-4000-8000-000000000002";
  assert.throws(() => validateQmsTransaction(captured(), runContext), /Signing blocked/);
});

it("admits an explicitly authorized operator test without a payment state", () => {
  const runContext = context();
  const previous = process.env.WEB3LANE_OPERATOR_TEST;
  process.env.WEB3LANE_OPERATOR_TEST = "1";
  try {
    runContext.plan.approval = { approved_plan_hash: "a".repeat(64), requester_id: "operator" };
    delete runContext.authorization.payment_state;
    runContext.authorization.mode = "operator-test";
    runContext.authorization.operator_authorized = true;
    assert.doesNotThrow(() => validateQmsTransaction(captured(), runContext));
  } finally {
    if (previous === undefined) delete process.env.WEB3LANE_OPERATOR_TEST;
    else process.env.WEB3LANE_OPERATOR_TEST = previous;
  }
});

it("rejects expired or excessively distant swap deadlines", () => {
  const expired = captured();
  expired.decoded.deadline = String(Math.floor(Date.now() / 1000) - 1);
  assert.throws(() => validateQmsTransaction(expired, context()), /Signing blocked/);
  const distant = captured();
  distant.decoded.deadline = String(Math.floor(Date.now() / 1000) + 1201);
  assert.throws(() => validateQmsTransaction(distant, context()), /Signing blocked/);
});
