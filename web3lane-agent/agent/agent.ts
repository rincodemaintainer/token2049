import { defineAgent, defineDynamic } from "eve";
import { chatgpt } from "eve/models/openai";

export default defineAgent({
  model: defineDynamic({
    events: {
      "step.started": () => {
        if (process.env.NODE_ENV === "development" && !process.env.VERCEL) {
          return {
            model: chatgpt("gpt-5.6-luna"),
            // Explicit budget avoids Gateway metadata lookup for the subscription model.
            modelContextWindowTokens: 128_000,
          };
        }

        return {
          model: "openai/gpt-oss-20b",
        };
      },
    },
  }),
  reasoning: "high",
});
