import { defineState } from "eve/context";
import type { EssentialQuestion } from "./types.ts";

export const requiredIntakeQuestions = defineState(
  "web3lane.required-intake-questions",
  () => [] as EssentialQuestion[],
);
