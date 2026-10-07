# Vercel agent hosting

Production project: `token2049`, repository root directory `web3lane-agent`.
The previous `wallet-qa-agent` project root was stale after the rename.
The agent uses Vercel Workflow, DefaultSandbox (Vercel Sandbox when hosted),
and AI Gateway. AWS's paid browser runner remains a separate service.

`agent/agent.ts` uses `openai/gpt-oss-20b` through AI Gateway. Local
development retains its ChatGPT subscription model. No Bedrock environment
variables are required. The linked production project already has
`AI_GATEWAY_API_KEY`; keep it server-side. Eve also supports project OIDC for
Gateway authentication. The agent's Vercel OIDC authentication remains enabled.
The optional chat-proxy bearer path needs a matching `QA_AGENT_BEARER_TOKEN`
on both servers; it is not currently configured on the agent project.

Deploy with `eve deploy --non-interactive --yes`, following the installed Eve
deployment guide. For a repository upload, preserve the `web3lane-agent/`
directory so it matches the Vercel project's root setting.

Verified deployment: `dpl_DfJBH8YPFAFgMWu6EaHFCSj5ESV4`, serving
https://token2049-green.vercel.app. An authenticated `eve remote invoke`
completed with `VERCEL_OK` on GPT-OSS 20B. TypeScript and the three bearer-auth
tests passed; a separate Gateway test executed a harmless structured tool call.
These smoke checks do not constitute full browser-QA evaluation.

## Model budget checked 2026-10-07

Prices below are dollars per million input / output tokens, excluding hosting.

| Model | Price | Notes |
| --- | --- | --- |
| `openai/gpt-oss-20b` | $0.03 / $0.14 | Selected default; live text and tool-call checks passed; no image input |
| `google/gemini-2.5-flash-lite` | $0.10 / $0.40 | Live text check passed; vision-capable alternative |
| `openai/gpt-5-nano` | $0.05 / $0.40 | Request accepted, but spent the 128-token test limit on reasoning without text |
| `poolside/laguna-s-2.1-free` | $0 / $0 | Live text check passed; documented tool-schema limitations |
| `inclusionai/ling-3.1-flash-free` | $0 / $0 | Test returned temporarily unavailable; promotion ends October 13, 2026 |
| `zai/glm-5.3-flash` via DeepInfra | $0.08 / $0.25 | Live production request rejected: free-tier users cannot access this model |

AI Gateway provides $5/month free credit before purchasing credits; buying
credits ends the monthly free allowance. Rate limits and model availability
still apply. At the current GPT-OSS price, 10K input + 1K output tokens costs
about $0.00044, or roughly 11,360 such calls per $5. Agent turns can make several
calls, grow their context, and consume additional reasoning tokens.
The team's billing API did not return usage data, so remaining credit was not
verified. Tests establish basic availability, not a full QA capability evaluation.

Vercel hosting, Workflow, and Sandbox usage are separate from model credits.
Hobby is for personal, non-commercial use; a commercial service needs a suitable
plan. Free models do not make the whole deployment free.

Sources: [Gateway pricing](https://vercel.com/docs/ai-gateway/pricing),
[GLM provider prices](https://vercel.com/ai-gateway/models/glm-5.3-flash),
[model catalog](https://ai-gateway.vercel.sh/v1/models),
[Ling free](https://vercel.com/ai-gateway/models/ling-3.1-flash-free),
[Laguna free](https://vercel.com/ai-gateway/models/laguna-s-2.1-free),
[Hobby plan](https://vercel.com/docs/plans/hobby).
