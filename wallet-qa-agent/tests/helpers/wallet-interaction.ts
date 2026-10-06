import type { MetaMask } from "@synthetixio/synpress/playwright";
import { parseUnits } from "viem";
import { evaluateSigningRequest } from "../../agent/lib/signing-policy.ts";
import type { SigningPolicy, SigningRequest } from "../../agent/lib/types.ts";

// Caller must inspect the pending wallet request and supply its actual fields.
// These helpers confirm UI requests only; the journey must verify receipts/evidence.
export async function approveToken(
  wallet: Pick<MetaMask, "approveTokenPermission">,
  policy: SigningPolicy,
  request: SigningRequest,
  amount: { spendLimit: number; decimals: number },
) {
  if (request.action_type !== "approve") throw new Error("Expected token approval request");
  if (!Number.isFinite(amount.spendLimit) || amount.spendLimit < 0 ||
      !Number.isInteger(amount.decimals) || amount.decimals < 0 || amount.decimals > 255) {
    throw new Error("Finite token allowance and valid decimals are required");
  }
  const text = String(amount.spendLimit);
  if (!/^\d+(\.\d+)?$/.test(text) || (text.split(".")[1]?.length ?? 0) > amount.decimals ||
      parseUnits(text, amount.decimals).toString() !== request.token_amount_units || request.unlimited_approval) {
    throw new Error("Wallet spend limit must exactly match the finite requested allowance");
  }
  const decision = evaluateSigningRequest(policy, request);
  if (!decision.allowed) throw new Error(decision.reasons.join("; "));
  await wallet.approveTokenPermission({ spendLimit: amount.spendLimit });
}

export async function signMessage(
  wallet: Pick<MetaMask, "confirmSignature">,
  policy: SigningPolicy,
  request: SigningRequest,
) {
  if (request.action_type !== "sign") throw new Error("Expected message signature request");
  const decision = evaluateSigningRequest(policy, request);
  if (!decision.allowed) throw new Error(decision.reasons.join("; "));
  await wallet.confirmSignature();
}
