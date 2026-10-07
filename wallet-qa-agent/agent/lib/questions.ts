import type { EssentialQuestion } from "./types.ts";

export type IntakeContext = {
  url?: string | null;
  goal?: string | null;
  chain?: string | null;
  chain_id?: number | null;
  wallet?: string | null;
  transactions_permitted?: boolean | null;
  budget_ceiling_units?: string | null;
  target_chain_performance_collected?: boolean | null;
  /** Journey-specific confirmed fields (token addresses, slippage, etc.). */
  confirmed?: Record<string, string | number | boolean | null | undefined>;
};

export function mergeRequiredQuestions(
  existing: EssentialQuestion[],
  proposed: EssentialQuestion[],
): EssentialQuestion[] {
  const byField = new Map(existing.map((question) => [question.field, question]));
  for (const question of proposed) {
    if (question.required) byField.set(question.field, question);
  }
  return [...byField.values()];
}

/**
 * Ask only for fields that change assertions, prerequisites, or permitted actions.
 * Journey-agnostic core questions plus optional extras from the caller.
 */
export function essentialQuestions(
  intake: IntakeContext,
  extras: EssentialQuestion[] = [],
): EssentialQuestion[] {
  const questions: EssentialQuestion[] = [];
  const hasText = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  const hasAnswer = (value: unknown) => value != null && (typeof value !== "string" || hasText(value));
  const validUnits = (value: unknown, allowZero = false) => {
    if (typeof value === "number") return Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0);
    return typeof value === "string" && value.length <= 64 && /^[0-9]+$/.test(value) &&
      (allowZero || BigInt(value) > 0n);
  };

  const need = (
    field: string,
    present: boolean,
    q: Omit<EssentialQuestion, "field" | "answer">,
  ) => {
    if (!present) questions.push({ ...q, field });
  };

  need("url", hasText(intake.url), {
    id: "Q-URL",
    question: "What is the URL of the deployed app to test?",
    why_needed: "Deployed app URL is required to inspect and execute cases",
    required: true,
    affected_case_ids: [],
  });

  need("chain_id", Number.isInteger(intake.chain_id) && Number(intake.chain_id) > 0 && hasText(intake.chain), {
    id: "Q-CHAIN",
    question: "Which blockchain network and chain ID should the test use?",
    why_needed: "Network determines wallet policy and chain evidence checks",
    options: ["Base Sepolia", "other"],
    required: true,
    affected_case_ids: [],
  });

  need("wallet", hasText(intake.wallet), {
    id: "Q-WALLET",
    question: "Which desktop wallet should the test use?",
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
      question: "May the test sign and submit transactions on the target network?",
      why_needed: "Spending and signing require explicit buyer permission",
      options: ["yes", "no"],
      required: true,
      affected_case_ids: [],
    },
  );

  need("goal", hasText(intake.goal), {
    id: "Q-GOAL",
    question: "Which user journey should this QA job verify?",
    why_needed: "The journey determines the requirements and test cases",
    required: true,
    affected_case_ids: [],
  });

  need("expected_result", hasText(intake.confirmed?.expected_result), {
    id: "Q-EXPECTED",
    question: "What observable result would prove that journey succeeded?",
    why_needed: "Buyer-confirmed expected behavior is needed for a testable assertion",
    required: true,
    affected_case_ids: [],
  });

  if (intake.transactions_permitted === true) {
    need("budget_ceiling_units", validUnits(intake.budget_ceiling_units), {
      id: "Q-SPEND-LIMIT",
      question: "What is the maximum total native-token gas spend, in base units, for this QA job?",
      why_needed: "Transactions need a buyer-confirmed spending ceiling",
      required: true,
      affected_case_ids: [],
    });
  }

  need("starting_state", hasAnswer(intake.confirmed?.starting_state), {
    id: "Q-START",
    question: "What account, balance, or app state must exist before the journey starts?",
    why_needed: "Starting state can change test prerequisites and assertions",
    required: false,
    affected_case_ids: [],
  });

  need("access_prerequisites", hasAnswer(intake.confirmed?.access_prerequisites), {
    id: "Q-ACCESS",
    question: "Is login, an allowlist, or another access step needed before testing?",
    why_needed: "Access prerequisites can block an otherwise valid test",
    required: false,
    affected_case_ids: [],
  });

  need("excluded_scope", hasAnswer(intake.confirmed?.excluded_scope), {
    id: "Q-EXCLUSIONS",
    question: "Which actions or app areas must this QA job avoid?",
    why_needed: "Exclusions keep the approved plan within buyer intent",
    required: false,
    affected_case_ids: [],
  });

  for (const extra of extras) {
    const answer = extra.answer ?? intake.confirmed?.[extra.field];
    const answered =
      ["input_token", "output_token", "router_or_spender", "cancel_expected_result", "receipt_evidence"].includes(extra.field)
        ? hasText(answer)
        : ["input_amount_units", "minimum_output_units", "notification_timeout_seconds"].includes(extra.field)
          ? validUnits(answer)
          : ["starting_allowance_units", "starting_balance_units"].includes(extra.field)
            ? validUnits(answer, true)
            : hasAnswer(answer);
    if (!answered) questions.push({ ...extra, answer: null, source: undefined });
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
    question: string;
    why_needed: string;
    affected_case_ids: string[];
    options?: string[];
    required?: boolean;
  }> = [
    {
      id: "Q-TOKEN-IN",
      field: "input_token",
      question: "What is the input token contract address for the swap?",
      why_needed: "Input token identity defines balance assertions",
      affected_case_ids: ["SWAP-01"],
    },
    {
      id: "Q-TOKEN-OUT",
      field: "output_token",
      question: "What is the output token contract address for the swap?",
      why_needed: "Output token identity defines success thresholds",
      affected_case_ids: ["SWAP-01"],
    },
    {
      id: "Q-SPENDER",
      field: "router_or_spender",
      question: "Which spender contract address may receive token approval?",
      why_needed: "Approval must target the allowlisted spender only",
      affected_case_ids: ["SWAP-01", "CANCEL-01"],
    },
    {
      id: "Q-AMOUNT",
      field: "input_amount_units",
      question: "What exact input token amount, in base units, may each test swap?",
      why_needed: "Exact input amount bounds signing policy and chain checks",
      affected_case_ids: ["SWAP-01"],
    },
    {
      id: "Q-MIN-OUT",
      field: "minimum_output_units",
      question: "What minimum output token amount, in base units, should count as a successful swap?",
      why_needed: "Minimum output / slippage is a confirmed assertion",
      affected_case_ids: ["SWAP-01"],
    },
    {
      id: "Q-NOTIFY",
      field: "notification_timeout_seconds",
      question: "How many seconds after confirmation may the success notification take?",
      why_needed: "Success notification timeout is a separate UI assertion",
      options: ["10", "30"],
      affected_case_ids: ["NOTIFY-01"],
    },
    {
      id: "Q-ALLOWANCE",
      field: "starting_allowance_units",
      question: "What token allowance should the test wallet have before the swap?",
      why_needed: "Starting allowance determines whether the approval path can be tested",
      affected_case_ids: ["SWAP-01"],
      required: false,
    },
    {
      id: "Q-BALANCE",
      field: "starting_balance_units",
      question: "What minimum input-token balance should the test wallet start with?",
      why_needed: "A funded fixture is needed to execute the approved amount",
      affected_case_ids: ["SWAP-01"],
      required: false,
    },
    {
      id: "Q-CANCEL",
      field: "cancel_expected_result",
      question: "What should the app show after the buyer cancels a wallet prompt?",
      why_needed: "Cancellation needs a buyer-confirmed expected result",
      affected_case_ids: ["CANCEL-01"],
      required: false,
    },
    {
      id: "Q-RECEIPT",
      field: "receipt_evidence",
      question: "Which transaction receipt or balance change should prove swap completion?",
      why_needed: "Completion needs evidence beyond a success notification",
      affected_case_ids: ["SWAP-01"],
      required: false,
    },
  ];

  return fields.map((f) => ({
    ...f,
    required: f.required ?? true,
    answer: confirmed[f.field] ?? null,
    source: confirmed[f.field] != null ? ("user-confirmed" as const) : undefined,
  }));
}
