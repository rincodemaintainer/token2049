import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  essentialQuestions,
  mergeRequiredQuestions,
  swapJourneyQuestions,
  type IntakeContext,
} from "../lib/questions.ts";
import { reviewQuestionCandidates } from "../lib/question-review.ts";
import { requiredIntakeQuestions } from "../lib/intake-state.ts";

export default defineTool({
  description:
    "Generate unanswered Wallet QA intake questions, including up to ten journey-specific questions you propose. Rank the next ten with Laya and flag unclear wording. Include swap candidates only for a token swap. Re-run after buyer answers until ready_to_plan is true.",
  inputSchema: z.object({
    url: z.string().nullable().optional(),
    goal: z.string().max(500).nullable().optional(),
    chain: z.string().nullable().optional(),
    chain_id: z.number().nullable().optional(),
    wallet: z.string().nullable().optional(),
    transactions_permitted: z.boolean().nullable().optional(),
    budget_ceiling_units: z.string().max(64).nullable().optional(),
    target_chain_performance_collected: z.boolean().nullable().optional(),
    include_swap_journey_questions: z.boolean().optional(),
    proposed_questions: z.array(z.object({
      id: z.string().min(1).max(50),
      field: z.string().min(1).max(50),
      question: z.string().min(1).max(140),
      why_needed: z.string().min(1).max(160),
      required: z.boolean().default(false),
      affected_case_ids: z.array(z.string().max(50)).max(10).default([]),
      options: z.array(z.string().max(100)).max(8).optional(),
    })).max(10).optional(),
    question_rewrites: z.record(z.string(), z.string().min(1).max(140)).optional(),
    confirmed: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional(),
  }),
  async execute(input) {
    const intake: IntakeContext = {
      url: input.url,
      goal: input.goal,
      chain: input.chain,
      chain_id: input.chain_id,
      wallet: input.wallet,
      transactions_permitted: input.transactions_permitted,
      budget_ceiling_units: input.budget_ceiling_units,
      target_chain_performance_collected: input.target_chain_performance_collected,
      confirmed: input.confirmed,
    };
    const swapExtras = input.include_swap_journey_questions
      ? swapJourneyQuestions(input.confirmed ?? {})
      : [];
    requiredIntakeQuestions.update((existing) =>
      mergeRequiredQuestions(existing, input.proposed_questions ?? [])
    );
    const candidates = essentialQuestions(intake, [
      ...swapExtras,
      ...requiredIntakeQuestions.get(),
      ...(input.proposed_questions ?? []),
    ]).map((question) => ({
      ...question,
      question: input.question_rewrites?.[question.id] ?? question.question,
    })).filter((question, index, all) =>
      all.findIndex((other) => other.field === question.field || other.id === question.id) === index
    );
    const review = await reviewQuestionCandidates(intake, candidates);
    return {
      ready_to_plan:
        candidates.every((q) => !q.required) &&
        intake.target_chain_performance_collected === true,
      pending_prerequisites:
        intake.target_chain_performance_collected === true
          ? []
          : ["probe_target_chain_performance"],
      ...review,
      note: "Ask the ranked questions, rewrite any flagged wording, then ask deferred required questions in the next round. Laya scores are advisory. Buyer-confirmed answers become plan assertions.",
    };
  },
});
