import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateSigningRequest,
  policyFromPlan,
} from "./signing-policy.ts";

describe("signing policy", () => {
  const policy = policyFromPlan({
    chain_id: 84532,
    domain: "swap.example.invalid",
    router_address: "0xRouter",
    max_token_amount_units: "1000000",
    max_gas_units: "1000000000000000",
    max_transactions: 2,
    transactions_used: 0,
  });

  it("allows an approved finite approval", () => {
    const decision = evaluateSigningRequest(policy, {
      chain_id: 84532,
      domain: "swap.example.invalid",
      action_type: "approve",
      contract: "0xRouter",
      spender: "0xRouter",
      token_amount_units: "1000000",
      unlimited_approval: false,
      gas_cap_units: "1",
    });
    assert.equal(decision.allowed, true);
  });

  it("rejects unlimited approval", () => {
    const decision = evaluateSigningRequest(policy, {
      chain_id: 84532,
      domain: "swap.example.invalid",
      action_type: "approve",
      spender: "0xRouter",
      unlimited_approval: true,
      token_amount_units: "1000000",
      gas_cap_units: "1",
    });
    assert.equal(decision.allowed, false);
    assert.match(decision.reasons.join(" "), /unlimited/);
  });

  it("rejects foreign domain and oversized amount", () => {
    const decision = evaluateSigningRequest(policy, {
      chain_id: 1,
      domain: "evil.example",
      action_type: "swap",
      contract: "0xOther",
      token_amount_units: "999999999",
    });
    assert.equal(decision.allowed, false);
    assert.ok(decision.reasons.length >= 3);
  });

  it("rejects when transaction budget is exhausted", () => {
    const exhausted = { ...policy, transactions_used: 2 };
    const decision = evaluateSigningRequest(exhausted, {
      chain_id: 84532,
      domain: "swap.example.invalid",
      action_type: "swap",
      contract: "0xRouter",
      token_amount_units: "1000000",
    });
    assert.equal(decision.allowed, false);
    assert.match(decision.reasons.join(" "), /transaction count/);
  });

  it("rejects a spend request that omits allowlisted contract or spender", () => {
    const decision = evaluateSigningRequest(policy, {
      chain_id: 84532,
      domain: "swap.example.invalid",
      action_type: "approve",
      token_amount_units: "1",
      unlimited_approval: false,
    });
    assert.equal(decision.allowed, false);
    assert.match(decision.reasons.join(" "), /contract/);
    assert.match(decision.reasons.join(" "), /spender/);
  });

  it("rejects malformed or negative spend and gas amounts", () => {
    const malformed = evaluateSigningRequest(policy, {
      chain_id: 84532,
      domain: "swap.example.invalid",
      action_type: "swap",
      contract: "0xRouter",
      spender: "0xRouter",
      token_amount_units: "not-a-number",
      gas_cap_units: "1",
    });
    const negativeGas = evaluateSigningRequest(policy, {
      chain_id: 84532,
      domain: "swap.example.invalid",
      action_type: "swap",
      contract: "0xRouter",
      spender: "0xRouter",
      token_amount_units: "1",
      gas_cap_units: "-1",
    });
    assert.equal(malformed.allowed, false);
    assert.equal(negativeGas.allowed, false);
  });

  it("does not let a caller override an exhausted policy transaction budget", () => {
    const decision = evaluateSigningRequest(
      { ...policy, transactions_used: policy.max_transactions },
      {
        chain_id: 84532,
        domain: "swap.example.invalid",
        action_type: "swap",
        contract: "0xRouter",
        spender: "0xRouter",
        token_amount_units: "1",
        gas_cap_units: "1",
        remaining_tx_count: 1,
      },
    );
    assert.equal(decision.allowed, false);
  });

  it("fails closed for spending when the approved policy has no amount or gas cap", () => {
    const decision = evaluateSigningRequest(
      {
        ...policy,
        max_token_amount_units: null,
        max_gas_units: null,
      },
      {
        chain_id: 84532,
        domain: "swap.example.invalid",
        action_type: "swap",
        contract: "0xRouter",
        spender: "0xRouter",
        token_amount_units: "1",
        gas_cap_units: "1",
      },
    );
    assert.equal(decision.allowed, false);
    assert.match(decision.reasons.join(" "), /amount cap/);
    assert.match(decision.reasons.join(" "), /gas cap/);
  });
});
