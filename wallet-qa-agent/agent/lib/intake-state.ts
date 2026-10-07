import { defineState } from "eve/context";
import type { EssentialQuestion } from "./types.ts";

export const requiredIntakeQuestions = defineState(
  "wallet-qa.required-intake-questions",
  () => [] as EssentialQuestion[],
);
