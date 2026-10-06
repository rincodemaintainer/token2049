import { buildApprovedPlan } from "../plan.ts";
import type { ApprovedPlan, StepObservation } from "../types.ts";

/**
 * Swap is one journey template for the Wallet QA agent — not the product itself.
 * Matches the handoff demo: successful on-chain swap, missing success notification,
 * and an independent approval-rejection case.
 */
export function buildSwapDemoPlan(overrides?: {
  job_id?: string;
  url?: string;
  wallet_address?: string | null;
  router_address?: string | null;
}): ApprovedPlan {
  return buildApprovedPlan({
    job_id: overrides?.job_id ?? "demo-job-001",
    requester_id: "demo-buyer",
    approved_at: "2026-10-06T10:00:30Z",
    base_fee_units: "12000000",
    contingency_percent: 25,
    target: {
      url: overrides?.url ?? "https://swap.example.invalid",
      build_id: "demo-build-001",
      chain: "Base Sepolia",
      chain_id: 84532,
      wallet: "MetaMask",
      wallet_address: overrides?.wallet_address ?? null,
      router_address: overrides?.router_address ?? "0xRouterDemo",
      domain: "swap.example.invalid",
      tokens: {
        A: { address: null, decimals: 6, symbol: "TokenA" },
        B: { address: null, decimals: 6, symbol: "TokenB" },
      },
    },
    requirements: [
      {
        id: "REQ-SWAP",
        text: "One finite approval and swap succeeds with at least the agreed minimum output.",
      },
      {
        id: "REQ-NOTIFY",
        text: "Success notification appears within 10 seconds of confirmed swap receipt.",
      },
      {
        id: "REQ-CANCEL",
        text: "Rejecting approval recovers the UI without a submitted approval transaction.",
      },
    ],
    testing_budget: {
      swap_input_A_units: "1000000",
      minimum_output_B_units: "950000",
      max_native_gas_units: "1000000000000000",
      max_successful_swaps: 1,
      allowance_type: "finite",
      return_address: null,
    },
    cases: [
      {
        id: "SWAP-01",
        requirement_id: "REQ-SWAP",
        priority: "critical",
        fixture: "funded-wallet-zero-allowance",
        depends_on: [],
        preconditions: [
          "Approved network and router",
          "Gas and token A available",
          "Funded pool",
          "Zero router allowance",
        ],
        steps: [
          {
            id: "CONNECT",
            action: "Connect test wallet",
            expected: "Approved account and network shown",
          },
          {
            id: "QUOTE",
            action: "Enter 1 test token A",
            expected: "Quote with minimum output at least 0.95 test token B",
          },
          {
            id: "APPROVE",
            action: "Approve 1 test token A for approved router",
            expected: "Successful receipt and finite allowance",
          },
          {
            id: "SWAP",
            action: "Submit exactly one approved swap",
            expected: "Successful receipt; output B at least minimum",
          },
        ],
        evidence: [
          "browser-and-wallet-recording",
          "trace",
          "approval-receipt",
          "swap-receipt",
          "allowance",
          "balance-deltas",
        ],
      },
      {
        id: "NOTIFY-01",
        requirement_id: "REQ-NOTIFY",
        priority: "high",
        fixture: "main-swap-session",
        depends_on: ["SWAP-01"],
        preconditions: ["Confirmed successful swap receipt"],
        steps: [
          {
            id: "NOTIFY",
            action: "Observe UI for 10 seconds after receipt confirmation",
            expected: "Success notification visible",
          },
        ],
        evidence: [
          "browser-and-wallet-recording",
          "trace",
          "notification-screenshot",
        ],
      },
      {
        id: "CANCEL-01",
        requirement_id: "REQ-CANCEL",
        priority: "normal",
        fixture: "separate-wallet-zero-allowance",
        depends_on: [],
        preconditions: ["Separate fixture with zero router allowance"],
        steps: [
          {
            id: "REJECT",
            action: "Reject approval in wallet",
            expected:
              "No approval submitted; allowance unchanged; app loading state clears",
          },
        ],
        evidence: ["cancel-recording", "cancel-trace", "allowance"],
      },
    ],
  });
}

/** Observations matching the handoff synthetic report (missing notification). */
export function swapDemoObservations(): StepObservation[] {
  const swapEvidence = [
    "browser-and-wallet-recording",
    "trace",
    "approval-receipt",
    "swap-receipt",
    "allowance",
    "balance-deltas",
  ];
  return [
    {
      case_id: "SWAP-01",
      step_id: "CONNECT",
      attempt: 1,
      assertion_met: true,
      observed: "Approved account and Base Sepolia shown",
      evidence_refs: ["browser-and-wallet-recording", "trace"],
    },
    {
      case_id: "SWAP-01",
      step_id: "QUOTE",
      attempt: 1,
      assertion_met: true,
      observed: "Minimum output 950000 units",
      evidence_refs: ["browser-and-wallet-recording", "trace"],
    },
    {
      case_id: "SWAP-01",
      step_id: "APPROVE",
      attempt: 1,
      assertion_met: true,
      observed: "Finite allowance 1000000 confirmed",
      evidence_refs: ["approval-receipt", "allowance"],
      transaction: { hash: "0xapprove", status: "success", nonce: 1 },
    },
    {
      case_id: "SWAP-01",
      step_id: "SWAP",
      attempt: 1,
      assertion_met: true,
      observed: "B output 970000 units; receipt success",
      evidence_refs: swapEvidence,
      transaction: { hash: "0xswap", status: "success", nonce: 2 },
    },
    {
      case_id: "NOTIFY-01",
      step_id: "NOTIFY",
      attempt: 1,
      assertion_met: false,
      observed:
        "No success notification at 10s timeout; swap already confirmed",
      evidence_refs: [
        "browser-and-wallet-recording",
        "trace",
        "notification-screenshot",
      ],
      recoverable: false,
    },
    {
      case_id: "CANCEL-01",
      step_id: "REJECT",
      attempt: 1,
      assertion_met: true,
      observed: "No transaction; allowance 0; loading cleared",
      evidence_refs: ["cancel-recording", "cancel-trace", "allowance"],
    },
  ];
}
