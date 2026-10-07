import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { sha256 } from "./standard-hash.mjs";
import { paymentDeadlines } from "./payment-deadlines.mjs";
import { loadSokosumiRuntime } from "./sokosumi-runtime.mjs";

const stateFile = "../.private/paid-task-state.json";
const state = JSON.parse(readFileSync(stateFile, "utf8"));
const registration = JSON.parse(readFileSync(".local/registration-state.json", "utf8"));
const token = parseEnv(readFileSync(".local/mps-runtime.env", "utf8")).MPS_RUNTIME_TOKEN;
const usdm = "16a55b2a349361ff88c03788f93e1e966e5d689605d044fef722ddde0014df10745553444d";
const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
async function mps(path, body) {
  const response = await fetch(`http://127.0.0.1:3012/api/v1${path}`, {
    method: "POST", headers: { token, "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok || data.status !== "success") throw new Error(`MPS ${path} HTTP ${response.status}`);
  return data.data;
}

if (process.argv[2] === "terms") {
  if (state.stage !== "started") throw new Error(`Expected started, found ${state.stage}`);
  if (registration.registrationState !== "RegistrationConfirmed") throw new Error("Masumi registration not confirmed");
  const nonce = randomBytes(10).toString("hex");
  const request = {
    network: "Preprod", agentIdentifier: registration.agentIdentifier,
    paymentSourceType: "Web3CardanoV2", supportedPaymentSourceIndex: registration.supportedPaymentSourceIndex,
    inputHash: sha256(state.input), identifierFromPurchaser: nonce,
    RequestedFunds: [{ amount: "1000000", unit: usdm }],
    ...paymentDeadlines(),
    metadata: JSON.stringify({ taskId: state.taskId }),
  };
  state.stage = "terms-pending"; state.nonce = nonce; state.termsRequest = request; save();
  state.payment = await mps("/payment", request);
  state.stage = "terms-saved"; save();
  console.log(JSON.stringify({ stage: state.stage, blockchainIdentifier: state.payment.blockchainIdentifier,
    payByTime: state.payment.payByTime, submitResultTime: state.payment.submitResultTime,
    unlockTime: state.payment.unlockTime }));
} else if (process.argv[2] === "event") {
  if (state.stage !== "terms-saved") throw new Error(`Expected terms-saved, found ${state.stage}`);
  const p = state.payment, source = p.PaymentSource, wallet = p.SmartContractWallet;
  if (p.sellerReturnAddress !== null || (p.forceLayer !== undefined && p.forceLayer !== null)) {
    throw new Error("Signed seller overrides are incompatible with this Core Task event");
  }
  if (source?.network !== "Preprod" || source.paymentSourceType !== "Web3CardanoV2" ||
    source.smartContractAddress !== registration.request.supportedPaymentSources[0].address ||
    wallet?.id !== registration.walletId || wallet.walletVkey !== registration.sellerVkey ||
    p.agentIdentifier !== registration.agentIdentifier || p.inputHash !== state.termsRequest.inputHash ||
    p.RequestedFunds?.length !== 1 || p.RequestedFunds[0].amount !== "1000000" ||
    p.RequestedFunds[0].unit !== usdm) throw new Error("Signed quote differs from web3lane registration or 1 test USDM");
  if (Date.now() >= Number(p.payByTime)) throw new Error("Signed pay-by deadline expired");
  const payment = {
    blockchainIdentifier: p.blockchainIdentifier, agentIdentifier: p.agentIdentifier,
    sellerVkey: wallet.walletVkey, submitResultTime: p.submitResultTime,
    payByTime: p.payByTime, unlockTime: p.unlockTime,
    externalDisputeUnlockTime: p.externalDisputeUnlockTime,
    inputHash: p.inputHash, identifierFromPurchaser: state.nonce,
    paymentSourceType: "Web3CardanoV2",
    supportedPaymentSourceIndex: registration.supportedPaymentSourceIndex,
    Amounts: p.RequestedFunds.map(({ amount, unit }) => ({ amount, unit })),
    PaymentSource: { network: "Preprod", smartContractAddress: source.smartContractAddress, policyId: source.policyId },
  };
  const { readRuntimeCredential, createCoworkerHttpClient } = await loadSokosumiRuntime();
  const core = createCoworkerHttpClient({ apiKey: readRuntimeCredential(state.coworkerId) });
  state.stage = "event-pending"; state.masumiPayment = payment; save();
  const response = await core.post(`/v1/tasks/${encodeURIComponent(state.taskId)}/events`, {
    comment: "Payment requested: 1 test USDM.", masumiPayment: payment,
  });
  state.stage = "awaiting-escrow"; state.paymentEventId = response.data.id; save();
  console.log("payment event submitted", state.paymentEventId);
} else throw new Error("Expected terms or event command");
