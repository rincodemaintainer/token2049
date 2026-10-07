import assert from "node:assert/strict";
import { it } from "node:test";
import { experimental_decide as decide } from "ai";
import { reviewQuestionCandidates, shortlistQuestions } from "./question-review.ts";
import type { EssentialQuestion } from "./types.ts";

it("keeps required intake ahead of optional scores and exposes deferred required questions", () => {
  const candidates: EssentialQuestion[] = Array.from({ length: 12 }, (_, index) => ({
    id: `Q-${index}`,
    field: `field_${index}`,
    question: `What is field ${index}?`,
    why_needed: "Plan input",
    required: index < 11,
    affected_case_ids: [],
  }));
  const result = shortlistQuestions(
    candidates,
    {
      usefulness_0: { score: 1 },
      usefulness_10: { score: 3 },
      usefulness_11: { score: 3 },
    },
    { clarity_10: { choice: "ambiguous" } },
  );

  assert.equal(result.questions.length, 5);
  assert.ok(result.questions.every((q) => q.required));
  assert.deepEqual(result.deferred_required_questions.map((q) => q.id), ["Q-4", "Q-5", "Q-6", "Q-7", "Q-8", "Q-9"]);
  assert.equal(result.questions[0]?.id, "Q-10");
  assert.equal(result.questions[0]?.clarity, "ambiguous");
  assert.equal(result.candidate_questions.find((q) => q.id === "Q-11")?.usefulness_score, 3);
});

it("reviews a first-round intake without sending undefined state fields", async () => {
  const candidate: EssentialQuestion = {
    id: "Q-URL",
    field: "url",
    question: "What is the deployed app URL?",
    why_needed: "Required target",
    required: true,
    affected_case_ids: [],
  };
  const calls: unknown[] = [];
  const fakeDecide = (async (request: Parameters<typeof decide>[0]) => {
    calls.push(request);
    return {
      answers: {
        usefulness_0: { type: "score", score: 3 },
        clarity_0: { type: "choice", choice: "clear" },
      },
    } as Awaited<ReturnType<typeof decide>>;
  }) as typeof decide;

  const result = await reviewQuestionCandidates({}, [candidate], fakeDecide);
  assert.equal(result.review_status, "reviewed");
  assert.equal(result.questions[0]?.clarity, "clear");
  assert.equal(calls.length, 1);
  assert.deepEqual((calls[0] as { state: unknown }).state, {
    task: "Review buyer questions for a Web3 app QA plan",
    goal: null,
    chain: null,
    transactions_permitted: null,
    candidates: [{ id: "Q-URL", question: "What is the deployed app URL?", why_needed: "Required target", required: true }],
  });
});

it("flags obvious semantic gaps even when Laya calls the wording clear", () => {
  const candidates: EssentialQuestion[] = [
    { id: "Q-VAGUE", field: "expected_result", question: "What should happen?", why_needed: "Pass condition", required: true, affected_case_ids: [] },
    { id: "Q-LIMIT", field: "budget_ceiling_units", question: "How much can we spend?", why_needed: "Spending bound", required: true, affected_case_ids: [] },
    { id: "Q-PRECISE", field: "budget_ceiling_units", question: "What is the maximum total native-token gas spend, in base units, for this QA job?", why_needed: "Spending bound", required: true, affected_case_ids: [] },
  ];
  const laya = Object.fromEntries(candidates.map((_, index) => [`clarity_${index}`, { choice: "clear" }]));
  const result = shortlistQuestions(candidates, {}, laya);
  assert.deepEqual(result.candidate_questions.map((q) => q.clarity), [
    "too_broad", "missing_boundary", "clear",
  ]);
});

it("keeps foundational required fields in the first round despite a low Laya score", () => {
  const candidates: EssentialQuestion[] = [
    { id: "Q-URL", field: "url", question: "What is the app URL?", why_needed: "Target", required: true, affected_case_ids: [] },
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `Q-${index}`,
      field: `swap_${index}`,
      question: `What is swap field ${index}?`,
      why_needed: "Swap assertion",
      required: true,
      affected_case_ids: [],
    })),
  ];
  const scores = Object.fromEntries(candidates.map((_, index) => [
    `usefulness_${index}`, { score: index === 0 ? 0 : 3 },
  ]));
  assert.equal(shortlistQuestions(candidates, scores).questions[0]?.id, "Q-URL");
});
