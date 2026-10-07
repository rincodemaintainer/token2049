import type { SigningPolicy, SigningRequest } from "./types.ts";

export type SigningDecision = {
  allowed: boolean;
  reasons: string[];
};

function asBigInt(value: string | null | undefined): bigint | null {
  if (value == null || value === "") return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function checkedNonNegativeAmount(
  value: string | null | undefined,
  label: string,
  required: boolean,
  reasons: string[],
): bigint | null {
  if (value == null || value === "") {
    if (required) reasons.push(`${label} is required`);
    return null;
  }
  const amount = asBigInt(value);
  if (amount == null || amount < 0n) {
    reasons.push(`${label} must be a non-negative base-unit integer`);
    return null;
  }
  return amount;
}

/**
 * Enforce approved chain, domain, contracts, amounts, action types, and tx caps
 * in code. Model, page, or repo suggestions cannot broaden these rules.
 */
export function evaluateSigningRequest(
  policy: SigningPolicy,
  request: SigningRequest,
): SigningDecision {
  const reasons: string[] = [];

  if (request.chain_id !== policy.chain_id) {
    reasons.push(
      `chain_id ${request.chain_id} is outside approved chain ${policy.chain_id}`,
    );
  }

  const domainOk = policy.allowed_domains.some(
    (d) => d.toLowerCase() === request.domain.toLowerCase(),
  );
  if (!domainOk) {
    reasons.push(`domain ${request.domain} is not allowlisted`);
  }

  if (!policy.allowed_action_types.includes(request.action_type)) {
    reasons.push(`action_type ${request.action_type} is not permitted`);
  }

  const requiresContractAndSpender =
    request.action_type === "approve" || request.action_type === "swap";
  if (requiresContractAndSpender && !request.contract) {
    reasons.push("contract is required for this action");
  }
  if (requiresContractAndSpender && !request.spender) {
    reasons.push("spender is required for this action");
  }

  if (request.contract) {
    const ok = policy.allowed_contracts.some(
      (c) => c.toLowerCase() === request.contract!.toLowerCase(),
    );
    if (!ok) reasons.push(`contract ${request.contract} is not allowlisted`);
  }

  if (request.spender) {
    const ok = policy.allowed_spenders.some(
      (s) => s.toLowerCase() === request.spender!.toLowerCase(),
    );
    if (!ok) reasons.push(`spender ${request.spender} is not allowlisted`);
  }

  if (request.unlimited_approval && !policy.allow_unlimited_approval) {
    reasons.push("unlimited approval is forbidden; finite allowance required");
  }

  const maxAmount = asBigInt(policy.max_token_amount_units);
  if (
    requiresContractAndSpender &&
    (maxAmount == null || maxAmount < 0n)
  ) {
    reasons.push("approved token amount cap is required for this action");
  }
  const requested = checkedNonNegativeAmount(
    request.token_amount_units,
    "token amount",
    requiresContractAndSpender,
    reasons,
  );
  if (maxAmount != null && requested != null && requested > maxAmount) {
    reasons.push(
      `token amount ${request.token_amount_units} exceeds max ${policy.max_token_amount_units}`,
    );
  }

  const maxGas = asBigInt(policy.max_gas_units);
  if (requiresContractAndSpender && (maxGas == null || maxGas < 0n)) {
    reasons.push("approved gas cap is required for this action");
  }
  const gas = checkedNonNegativeAmount(
    request.gas_cap_units,
    "gas cap",
    requiresContractAndSpender,
    reasons,
  );
  if (maxGas != null && gas != null && gas > maxGas) {
    reasons.push(
      `gas cap ${request.gas_cap_units} exceeds max ${policy.max_gas_units}`,
    );
  }

  const policyRemaining = policy.max_transactions - policy.transactions_used;
  const remaining =
    request.remaining_tx_count == null
      ? policyRemaining
      : Math.min(policyRemaining, request.remaining_tx_count);
  if (remaining <= 0) {
    reasons.push("transaction count budget exhausted");
  }

  return { allowed: reasons.length === 0, reasons };
}

export function policyFromPlan(input: {
  chain_id: number;
  domain: string;
  router_address?: string | null;
  max_token_amount_units?: string | null;
  max_gas_units?: string | null;
  max_transactions: number;
  transactions_used?: number;
}): SigningPolicy {
  const contracts = input.router_address ? [input.router_address] : [];
  return {
    chain_id: input.chain_id,
    allowed_domains: [input.domain],
    allowed_contracts: contracts,
    allowed_spenders: contracts,
    allowed_action_types: ["connect", "approve", "swap", "sign"],
    max_token_amount_units: input.max_token_amount_units ?? null,
    allow_unlimited_approval: false,
    max_gas_units: input.max_gas_units ?? null,
    max_transactions: input.max_transactions,
    transactions_used: input.transactions_used ?? 0,
  };
}
