import assert from "node:assert/strict";
import test from "node:test";
import { connectWallet, signMessage, type WalletSnapshot } from "./wallet.ts";

let signCalls = 0;
const installWallet = (overrides: Record<string, unknown> = {}, origin = "https://app.test") => {
  signCalls = 0;
  const api = {
    getNetworkId: async () => 0,
    getChangeAddress: async () => "6000000000000000000000000000000000000000000000000000000000",
    getBalance: async () => "1a000f4240",
    getRewardAddresses: async () => [],
    cip142: { getNetworkMagic: async () => 1 },
    signData: async () => { signCalls += 1; return { signature: "aabb", key: "ccdd" }; },
    ...overrides,
  };
  Object.assign(globalThis, { location: { origin }, window: { cardano: { lace: { name: "Lace", supportedExtensions: [{ cip: 142 }], enable: async () => api } } } });
};
const snapshot = (overrides: Partial<WalletSnapshot> = {}): WalletSnapshot => ({ walletId: "lace", walletName: "Lace", networkId: 0, networkMagic: 1, signingAddress: "6000000000000000000000000000000000000000000000000000000000", balanceLovelace: "1000000", rewardAddresses: [], utxoCount: null, origin: "https://app.test", observedAt: "2026-10-07T00:00:00.000Z", ...overrides });

test("connection asks for CIP-142 and returns wallet data", async () => {
  installWallet();
  const connected = await connectWallet("lace");
  assert.equal(connected.networkMagic, 1);
  assert.equal(connected.balanceLovelace, "1000000");
  assert.match(connected.signingAddressBech32 || "", /^addr_test1/);
});
test("wallet rejection exposes a human error", async () => {
  Object.assign(globalThis, { location: { origin: "https://app.test" }, window: { cardano: { lace: { enable: async () => { throw { code: -3, info: "Refused by user" }; } } } } });
  await assert.rejects(connectWallet("lace"), /declined/i);
});
test("signature rejection is normalized for the preview UI", async () => {
  installWallet({ signData: async () => { throw { code: -3, info: "Refused by user" }; } });
  await assert.rejects(signMessage(snapshot(), "hello"), (error: Error) => error instanceof Error && /declined/i.test(error.message));
});
test("MAIN-world envelope preserves a rejected signature through Chrome transport", async () => {
  installWallet({ signData: async () => { throw { code: -3, info: "Refused by user" }; } });
  Object.assign(globalThis, { chrome: { tabs: { query: async () => [{ id: 7 }] }, scripting: { executeScript: async ({ func, args }: { func: Function; args: unknown[] }) => {
    const serialized = new Function(`return (${func.toString()})`)() as (...values: unknown[]) => Promise<unknown>;
    return [{ result: await serialized(...JSON.parse(JSON.stringify(args))) }];
  } } } });
  try {
    await assert.rejects(signMessage(snapshot({ tabId: 7 }), "hello"), (error: Error) => error instanceof Error && /declined/i.test(error.message));
  } finally { delete (globalThis as { chrome?: unknown }).chrome; }
});
test("unknown network cannot trigger a signature", async () => {
  installWallet();
  await assert.rejects(signMessage(snapshot({ networkMagic: null }), "hello"), /Preprod/i);
  assert.equal(signCalls, 0);
});
test("account changes before signing block the wallet side effect", async () => {
  installWallet({ getChangeAddress: async () => "01different" });
  await assert.rejects(signMessage(snapshot(), "hello"), /account or network changed/i);
  assert.equal(signCalls, 0);
});
test("wrong origin blocks before wallet enable or signing", async () => {
  installWallet({}, "https://other.test");
  await assert.rejects(signMessage(snapshot(), "hello"), /different site/i);
  assert.equal(signCalls, 0);
});
