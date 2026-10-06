import assert from "node:assert/strict";
import { it } from "node:test";
import { approveToken, signMessage } from "../../tests/helpers/wallet-interaction.ts";
import { policyFromPlan } from "./signing-policy.ts";
import type { SigningRequest } from "./types.ts";

const policy = policyFromPlan({
  chain_id: 84532, domain: "app.example", router_address: "0xRouter",
  max_token_amount_units: "1000000", max_gas_units: "100", max_transactions: 2,
});
const request: SigningRequest = {
  chain_id: 84532, domain: "app.example", action_type: "approve",
  contract: "0xRouter", spender: "0xRouter", token_amount_units: "1000000",
  gas_cap_units: "1", unlimited_approval: false,
};

it("approval forwards the exact finite allowance", async () => {
  let limit: unknown;
  await approveToken({ approveTokenPermission: async options => { limit = options?.spendLimit; } },
    policy, request, { spendLimit: 1, decimals: 6 });
  assert.equal(limit, 1);
});

it("invalid allowances and denied policy never touch the wallet", async () => {
  let calls = 0;
  const wallet = { approveTokenPermission: async () => { calls++; } };
  for (const spendLimit of [Infinity, -1, 2, 1.0000001]) {
    await assert.rejects(approveToken(wallet, policy, request, { spendLimit, decimals: 6 }));
  }
  await assert.rejects(approveToken(wallet, policy, { ...request, unlimited_approval: true },
    { spendLimit: 1, decimals: 6 }));
  await assert.rejects(approveToken(wallet, policy, { ...request, domain: "other.example" },
    { spendLimit: 1, decimals: 6 }));
  assert.equal(calls, 0);
});

it("signature confirmation requires the sign action and an allowed request", async () => {
  let calls = 0;
  const wallet = { confirmSignature: async () => { calls++; } };
  await assert.rejects(signMessage(wallet, policy, request));
  await assert.rejects(signMessage(wallet, policy, { ...request, action_type: "sign", chain_id: 1 }));
  assert.equal(calls, 0);
  await signMessage(wallet, policy, { ...request, action_type: "sign" });
  assert.equal(calls, 1);
});
