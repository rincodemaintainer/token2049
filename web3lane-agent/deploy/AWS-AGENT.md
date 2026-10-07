# Eve agent on AWS with Bedrock

Archived experiment: production uses Vercel again as of 2026-10-07. The
Bedrock provider and self-hosted sandbox branches were removed from the active
runtime. Commit `22ade12` preserves the AWS implementation described below;
restore those branches before using these container instructions. AWS resources
were not deleted. See [the active Vercel deployment](VERCEL-AGENT.md).

The conversational agent runs separately from the paid browser service. The
existing paid runner, payment journal, wallet configuration, and API remain
independent. Run one Eve replica while using the local Workflow world.

## Container

`Dockerfile.agent` builds Eve on Node 24. `compose.agent.yaml` publishes only
`127.0.0.1:21960`, persists workflow state, sandbox sessions and local agent files, and limits the
agent to 2 GiB. Use the existing EC2 host's instance role for Bedrock; do not
place AWS access keys in the image or environment file.

The self-hosted build selects just-bash explicitly. It does not mount the Docker
socket, wallet files, or browser profiles. This chat container cannot execute
the local `run_browser_check` Playwright tool; browser execution remains on the
separate trusted runner. just-bash is a virtual filesystem/shell, not native
process isolation.

The optional Laya question-ranking helper still uses AI Gateway. Without
`AI_GATEWAY_API_KEY`, it returns its existing deterministic shortlist with
`review_status: unavailable`; the main agent can still use Bedrock.

Create an operator-owned environment file outside the repository with the
Bedrock model configuration and `QA_AGENT_BEARER_TOKEN`. Resolve secrets through
`asm-exec` using Secrets Manager dynamic references; do not print them or commit
the file. Pass its path as `WEB3LANE_AGENT_ENV_FILE`.

`WEB3LANE_MODEL_PROVIDER=bedrock` activates the provider (Compose sets it).
`BEDROCK_MODEL_ID` defaults to `global.anthropic.claude-sonnet-4-6`;
`BEDROCK_REGION` defaults to `AWS_REGION`, then `ap-southeast-1`.
`BEDROCK_MAX_OUTPUT_TOKENS` defaults to 4096 and
`BEDROCK_CONTEXT_WINDOW_TOKENS` to 200000. Match the context limit and reasoning
capabilities to the model before changing it. With no provider override, the
existing local subscription and production Gateway model selection remain.

```zsh
docker compose -f compose.agent.yaml build
docker compose -f compose.agent.yaml up -d
curl --fail http://127.0.0.1:21960/eve/v1/health
```

The instance role needs `bedrock:InvokeModel` and
`bedrock:InvokeModelWithResponseStream` for the selected inference profile and
its foundation-model resources. Scope permissions to that model. Container
role discovery requires IMDSv2 with a response hop limit of 2; the existing
runner CloudFormation template already configures this.

## HTTPS and chat integration

Use a streaming-capable HTTPS ingress that preserves `/eve/` and
`/.well-known/workflow/`. Disable response buffering and caching. The paid API's
existing API Gateway HTTP API must not be assumed to support Eve's live stream.
Keep its routes unchanged when adding the conversational endpoint.

Set the chat server's `QA_AGENT_URL` to the new HTTPS origin and provision the
matching `QA_AGENT_BEARER_TOKEN` server-side. Before switching traffic, verify
health, rejection of unauthenticated session creation, an authenticated turn,
tool execution, stream reconnect, and session recovery after a container
restart. Retain the current Vercel agent until those checks pass.

A separate CloudFront distribution with a VPC origin is a candidate HTTPS
front door without requiring a custom domain. Its origin must support streaming
with caching disabled and forwarded authorization. The existing ALB uses public
subnets; validate VPC-origin eligibility or create a separate ALB in private
subnets. Do not move the paid runner's existing load balancer subnets as part of
this migration. See the [AWS VPC-origin requirements](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html).

## Account checks on 2026-10-07

AWS API access and the existing Singapore EC2/SSM host were verified. Bedrock
invocation checks returned these account-level blockers:

- Claude Sonnet 4.6: Anthropic use-case details have not been submitted.
- Nova 2 Lite: daily-token quota throttling, even with a 64-token output limit.
- GPT-6 Luna: model unavailable to this account through Bedrock Runtime.
- GPT OSS 120B in US East (N. Virginia): invocation throttled; account reports
  zero on-demand requests and tokens per minute for that model.

The account reports nonzero GPT-5.6 Luna/Terra/Sol quotas on the separate
`bedrock-mantle` endpoint. These quotas do not establish that an invocation will
succeed, and the current Converse provider does not select Mantle.

The installed `@ai-sdk/amazon-bedrock/mantle` provider supports IAM SigV4 and
GPT-5.6 Luna's Chat Completions endpoint in `us-east-1`. A live EC2 container
request using its instance role and a scoped `bedrock-mantle:CreateInference`
permission reached Mantle but returned HTTP 401: `openai.gpt-5.6-luna is not
available for this account`. AWS directs the account owner to Sales for access.
The current agent therefore has no enabled Mantle branch. See the
[model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-56-luna.html).

Submit the Anthropic use-case form in the Bedrock console before retrying
Claude. Global inference profiles may route requests outside Singapore.
Model listing alone does not establish invocation access. No model-backed
deployment is considered verified until a live agent turn succeeds.

Local validation passed: TypeScript, Docker Compose configuration, self-hosted
Eve build, health readiness, unauthenticated session rejection (401), and
authenticated empty-session creation (202). The latter does not invoke a model.
The initial build/start checks used an isolated macOS directory. zsh 5.9 was
installed and verified on EC2 with user approval. The user-approved archive was
then uploaded and built successfully on Linux ARM64:

- Source: `s3://wallet-qa-preprod-runner-sourcebucket-uzr1imhvtj5i/eve/2026-10-07-bedrock/source.tar.gz`
- Source SHA-256: `f75dc3a039ea24b545d134153bc361ace7fa30a6f827448ed0a20a80e150fd5f`
- Host directory: `/opt/web3lane/eve/2026-10-07-bedrock`
- Image: `web3lane-eve:bedrock-20261007`
- Image ID: `sha256:d6f7b158f6e05a083cc59d3e88cfdf0b020b7f5337a4879347dbc46f3f92d55f`

A temporary container from that exact Linux image passed health readiness,
unauthenticated session rejection (401), and authenticated empty-session
creation (202). It was stopped and removed after the checks; no model was
invoked by this startup check.

CloudFormation stack `web3lane-eve-runtime` deployed
`aws-agent-runtime.json`: one model-scoped Mantle permission attached to the
existing instance role, plus a separate generated bearer secret. Only the
secret ARN is output; no credential was printed. Service template validation
and the reviewed two-resource change set passed; local cfn-lint/cfn-guard
checks were unavailable. The paid runner's permissions and services were not
replaced.

No persistent Eve container, public ingress, or chat cutover is active while
model access is blocked. `aws-agent-ingress.json` and `eve-nginx.conf` are
undeployed preparation; existing ALB eligibility and live streaming still need
verification.
