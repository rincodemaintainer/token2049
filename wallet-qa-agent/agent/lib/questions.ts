import type { EssentialQuestion } from "./types.ts";

export type IntakeContext = {
  url?: string | null;
  goal?: string | null;
  chain?: string | null;
  chain_id?: number | null;
  wallet?: string | null;
  transactions_permitted?: boolean | null;
  budget_ceiling_units?: string | null;
  /** Journey-specific confirmed fields (token addresses, slippage, etc.). */
  confirmed?: Record<string, string | number | boolean | null | undefined>;
};

/**
 * Ask only for fields that change assertions, prerequisites, or permitted actions.
 * Journey-agnostic core questions plus optional extras from the caller.
 */
export function essentialQuestions(
  intake: IntakeContext,
  extras: EssentialQuestion[] = [],
): EssentialQuestion[] {
  const questions: EssentialQuestion[] = [];

  const need = (
    field: string,
    present: boolean,
    q: Omit<EssentialQuestion, "field" | "answer">,
  ) => {
    if (!present) questions.push({ ...q, field });
  };

  need("url", Boolean(intake.url), {
    id: "Q-URL",
    why_needed: "Deployed app URL is required to inspect and execute cases",
    required: true,
    affected_case_ids: [],
  });

  need("chain_id", intake.chain_id != null || Boolean(intake.chain), {
    id: "Q-CHAIN",
    why_needed: "Network determines wallet policy and chain evidence checks",
    options: ["Base Sepolia", "other"],
    required: true,
    affected_case_ids: [],
  });

  need("wallet", Boolean(intake.wallet), {
    id: "Q-WALLET",
    why_needed: "MVP supports one desktop wallet path per job",
    options: ["MetaMask"],
    required: true,
    affected_case_ids: [],
  });

  need(
    "transactions_permitted",
    intake.transactions_permitted != null,
    {
      id: "Q-TX",
      why_needed: "Spending and signing require explicit buyer permission",
      options: ["yes", "no"],
      required: true,
      affected_case_ids: [],
    },
  );

  for (const extra of extras) {
    const answered =
      extra.answer != null ||
      (intake.confirmed &&
        intake.confirmed[extra.field] != null &&
        intake.confirmed[extra.field] !== "");
    if (!answered) questions.push(extra);
  }

  return questions;
}

/** Common extras for a token-swap journey (one use case of the QA agent). */
export function swapJourneyQuestions(
  confirmed: Record<string, string | number | boolean | null | undefined> = {},
): EssentialQuestion[] {
  const fields: Array<{
    id: string;
    field: string;
    why_needed: string;
    affected_case_ids: string[];
    options?: string[];
  }> = [
    {
      id: "Q-TOKEN-IN",
      field: "input_token",
      why_needed: "Input token identity and decimals define balance assertions",
      affected_case_ids: ["SWAP-01"],
    },
    {
      id: "Q-TOKEN-OUT",
      field: "output_token",
      why_needed: "Output token identity defines success thresholds",
      affected_case_ids: ["SWAP-01"],
    },
    {
      id: "Q-SPENDER",
      field: "router_or_spender",
      why_needed: "Approval must target the allowlisted spender only",
      affected_case_ids: ["SWAP-01", "CANCEL-01"],
    },
    {
      id: "Q-AMOUNT",
      field: "input_amount_units",
      why_needed: "Exact input amount bounds signing policy and chain checks",
      affected_case_ids: ["SWAP-01"],
    },
    {
      id: "Q-MIN-OUT",
      field: "minimum_output_units",
      why_needed: "Minimum output / slippage is a confirmed assertion",
      affected_case_ids: ["SWAP-01"],
    },
    {
      id: "Q-NOTIFY",
      field: "notification_timeout_seconds",
      why_needed: "Success notification timeout is a separate UI assertion",
      options: ["10", "30"],
      affected_case_ids: ["NOTIFY-01"],
    },
  ];

  return fields.map((f) => ({
    ...f,
    required: true,
    answer: confirmed[f.field] ?? null,
    source: confirmed[f.field] != null ? ("user-confirmed" as const) : undefined,
  }));
}
