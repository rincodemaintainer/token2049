import { defineAgent, defineDynamic } from "eve";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { wrapLanguageModel } from "ai";
import { chatgpt } from "eve/models/openai";

const BEDROCK_PROVIDER = "bedrock";
const DEFAULT_BEDROCK_REGION = "ap-southeast-1";
const DEFAULT_BEDROCK_MODEL_ID = "global.anthropic.claude-sonnet-4-6";
const DEFAULT_BEDROCK_CONTEXT_WINDOW_TOKENS = 200_000;
const DEFAULT_BEDROCK_MAX_OUTPUT_TOKENS = 4_096;

function requiredModelId(value: string | undefined) {
  if (value !== undefined && value.trim() === "") {
    throw new Error("BEDROCK_MODEL_ID must be a non-empty Bedrock model or inference-profile ID.");
  }
  return value?.trim() ?? DEFAULT_BEDROCK_MODEL_ID;
}

function positiveInteger(name: string, value: string | undefined, fallback: number) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function bedrockModel() {
  const region = process.env.BEDROCK_REGION?.trim() || process.env.AWS_REGION?.trim() || DEFAULT_BEDROCK_REGION;

  const modelId = requiredModelId(process.env.BEDROCK_MODEL_ID);
  const maxOutputTokens = positiveInteger(
    "BEDROCK_MAX_OUTPUT_TOKENS",
    process.env.BEDROCK_MAX_OUTPUT_TOKENS,
    DEFAULT_BEDROCK_MAX_OUTPUT_TOKENS,
  );
  const model = createAmazonBedrock({
    region,
    // Resolves ECS/EC2 task-role credentials and other standard Node AWS sources at request time.
    credentialProvider: fromNodeProviderChain(),
  })(modelId);

  return {
    model: wrapLanguageModel({
      model,
      middleware: {
        specificationVersion: "v4",
        transformParams: async ({ params }) => ({ ...params, maxOutputTokens }),
      },
    }),
    modelContextWindowTokens: positiveInteger(
      "BEDROCK_CONTEXT_WINDOW_TOKENS",
      process.env.BEDROCK_CONTEXT_WINDOW_TOKENS,
      DEFAULT_BEDROCK_CONTEXT_WINDOW_TOKENS,
    ),
    // Adaptive reasoning is only configured for Bedrock Claude 4.6 models. Other
    // model IDs use Eve's provider-agnostic reasoning setting without Claude-specific options.
    modelOptions: modelId.includes("claude-sonnet-4-6") || modelId.includes("claude-opus-4-6")
      ? { providerOptions: { bedrock: { reasoningConfig: { type: "adaptive" } } } }
      : undefined,
  };
}

export default defineAgent({
  model: defineDynamic({
    events: {
      "step.started": () => {
        const configuredProvider = process.env.WEB3LANE_MODEL_PROVIDER;
        if (configuredProvider === BEDROCK_PROVIDER) {
          return bedrockModel();
        }
        if (configuredProvider !== undefined && configuredProvider !== "") {
          throw new Error(`Unsupported WEB3LANE_MODEL_PROVIDER: ${configuredProvider}`);
        }

        if (process.env.NODE_ENV === "development" && !process.env.VERCEL) {
          return {
            model: chatgpt("gpt-5.6-luna"),
            // Explicit budget avoids Gateway metadata lookup for the subscription model.
            modelContextWindowTokens: 128_000,
          };
        }

        return {
          model: "zai/glm-5.3-flash",
          modelOptions: {
            providerOptions: { gateway: { only: ["deepinfra"] } },
          },
        };
      },
    },
  }),
  reasoning: "high",
});
