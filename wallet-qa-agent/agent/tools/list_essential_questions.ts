import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  essentialQuestions,
  swapJourneyQuestions,
  type IntakeContext,
} from "../lib/questions.ts";

export default defineTool({
  description:
    "List essential clarification questions for a Wallet QA job. Ask only for fields that change assertions, prerequisites, or permitted spending. Optionally include swap-journey extras when the buyer's goal is a token swap.",
  inputSchema: z.object({
    url: z.string().nullable().optional(),
    goal: z.string().nullable().optional(),
    chain: z.string().nullable().optional(),
    chain_id: z.number().nullable().optional(),
    wallet: z.string().nullable().optional(),
    transactions_permitted: z.boolean().nullable().optional(),
    include_swap_journey_questions: z.boolean().optional(),
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
      confirmed: input.confirmed,
    };
    const extras = input.include_swap_journey_questions
      ? swapJourneyQuestions(input.confirmed ?? {})
      : [];
    const questions = essentialQuestions(intake, extras);
    return {
      ready_to_plan: questions.filter((q) => q.required).length === 0,
      questions,
      note: "Do not invent expected behavior. Buyer-confirmed answers become plan assertions.",
    };
  },
});
