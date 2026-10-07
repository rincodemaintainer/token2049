import { experimental_decide as decide } from "ai";
import type { EssentialQuestion } from "./types.ts";
import type { IntakeContext } from "./questions.ts";

const MODEL = "convaiinnovations/laya-free";
const GAP_CODES = ["clear", "ambiguous", "too_broad", "not_testable", "missing_boundary"] as const;
const FOUNDATIONAL_FIELDS = new Set([
  "url", "chain_id", "wallet", "transactions_permitted", "goal", "expected_result", "budget_ceiling_units",
]);
type GapCode = (typeof GAP_CODES)[number];
type Answer = { score?: unknown; choice?: unknown };

function obviousSemanticGap(question: EssentialQuestion): GapCode | null {
  const wording = question.question.trim().toLowerCase();
  if (question.field === "expected_result" &&
      /^(what should happen|what is the expected result|does it work)\??$/.test(wording)) {
    return "too_broad";
  }
  if (question.field === "budget_ceiling_units" &&
      (!/maximum|max\b|limit|ceiling/.test(wording) ||
        !/total|per[- ]transaction/.test(wording) ||
        !/unit|wei|lamport|native.token|asset/.test(wording))) {
    return "missing_boundary";
  }
  if (["input_amount_units", "minimum_output_units"].includes(question.field) &&
      !/unit|wei|base|decimal/.test(wording)) {
    return "missing_boundary";
  }
  return null;
}

export type ReviewedQuestion = EssentialQuestion & {
  usefulness_score: number | null;
  clarity: GapCode | "unreviewed";
};

export function shortlistQuestions(
  candidates: EssentialQuestion[],
  usefulness: Record<string, Answer> = {},
  clarity: Record<string, Answer> = {},
) {
  const ranked = candidates.map((question, index): ReviewedQuestion & { index: number } => {
    const rawScore = usefulness[`usefulness_${index}`]?.score;
    const rawClarity = clarity[`clarity_${index}`]?.choice;
    return {
      ...question,
      index,
      usefulness_score:
        typeof rawScore === "number" && Number.isFinite(rawScore)
          ? Math.max(0, Math.min(3, rawScore))
          : null,
      clarity: obviousSemanticGap(question) ??
        (GAP_CODES.includes(rawClarity as GapCode)
          ? (rawClarity as GapCode)
          : "unreviewed"),
    };
  });

  ranked.sort(
    (a, b) =>
      Number(b.required) - Number(a.required) ||
      Number(FOUNDATIONAL_FIELDS.has(b.field)) - Number(FOUNDATIONAL_FIELDS.has(a.field)) ||
      (b.usefulness_score ?? -1) - (a.usefulness_score ?? -1) ||
      a.index - b.index,
  );

  const stripIndex = ({ index: _index, ...question }: (typeof ranked)[number]) => question;
  const questions = ranked.slice(0, 10).map(stripIndex);
  return {
    questions,
    candidate_questions: ranked.map(stripIndex),
    deferred_required_questions: ranked.slice(10).filter((q) => q.required).map(stripIndex),
  };
}

export async function reviewQuestionCandidates(
  intake: IntakeContext,
  candidates: EssentialQuestion[],
  decideModel: typeof decide = decide,
) {
  if (candidates.length === 0) {
    return { ...shortlistQuestions(candidates), review_status: "not_needed" as const };
  }
  if (decideModel === decide && !process.env.AI_GATEWAY_API_KEY) {
    return { ...shortlistQuestions(candidates), review_status: "unavailable" as const };
  }

  const answers: Record<string, Answer> = {};
  for (let start = 0; start < candidates.length; start += 5) {
    const batch = candidates.slice(start, start + 5);
    const state = {
      task: "Review buyer questions for a Web3 app QA plan",
      goal: intake.goal?.slice(0, 320) ?? null,
      chain: intake.chain ?? null,
      transactions_permitted: intake.transactions_permitted ?? null,
      candidates: batch.map(({ id, question, why_needed, required }) =>
        ({ id, question, why_needed, required })),
    };
    const questions = Object.fromEntries(batch.flatMap((candidate, offset) => {
      const index = start + offset;
      return [
        [`usefulness_${index}`, {
          type: "score" as const,
          instructions: `How useful is asking "${candidate.question}" before approving this QA plan?`,
          criteria: [
            "No planning value",
            "Useful context but optional",
            "Important for a testable case",
            "Essential for a safe or testable plan",
          ],
        }],
        [`clarity_${index}`, {
          type: "choice" as const,
          instructions: `Review exact buyer question "${candidate.question}" for field ${candidate.field}. Is one answer precise enough to use in a QA plan? Identify the strongest semantic gap, if any.`,
          criteria: {
            clear: "One specific answer is enough to use in the plan",
            ambiguous: "Terms or units can be interpreted more than one way",
            too_broad: "Asks several things or has no bounded answer",
            not_testable: "Answer would not yield an observable assertion or prerequisite",
            missing_boundary: "Leaves a necessary permission, amount, or scope limit unclear",
          },
        }],
      ];
    }));

    try {
      const result = await decideModel({
        model: MODEL,
        state,
        questions,
        abortSignal: AbortSignal.timeout(10_000),
        maxRetries: 0,
      });
      Object.assign(answers, result.answers);
    } catch {
      // Keep required questions visible even when an advisory batch cannot be reviewed.
    }
  }

  const shortlist = shortlistQuestions(candidates, answers, answers);
  const reviewedCount = shortlist.candidate_questions.filter(
    (question) => question.usefulness_score !== null && question.clarity !== "unreviewed",
  ).length;
  return {
    ...shortlist,
    review_status: reviewedCount === candidates.length
      ? ("reviewed" as const)
      : reviewedCount === 0
        ? ("unavailable" as const)
        : ("partial" as const),
  };
}
