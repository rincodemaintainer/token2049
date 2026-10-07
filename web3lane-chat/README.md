# web3lane QA chat

Minimal Next.js 16 / React 19 chat for the existing Eve QA agent, using shadcn/ui components and the extension’s forest, sage, paper and lime theme. No LLM API key belongs in this app.

## Run

Requires Node 24+.

```sh
cd web3lane-chat
npm ci
cp .env.example .env
# Edit .env with your deployed agent origin and credentials.
npm run dev
```

Open http://127.0.0.1:3001. The local defaults bind only to loopback. This is a single-operator test console; add application authentication before hosting it publicly, because its proxy uses a shared service credential.

## Configuration

| Variable | Purpose |
| --- | --- |
| `QA_AGENT_URL` | Eve deployment base URL, e.g. `https://your-agent.vercel.app`; no `/eve/v1`, query, or embedded credentials. Local Eve defaults to `http://127.0.0.1:2000`. |
| `QA_AGENT_BEARER_TOKEN` | Same secret on this server and the agent deployment. The updated agent channel verifies it. Redeploy the agent after adding the variable. |
| `QA_AGENT_VERCEL_OIDC_TOKEN` | Alternative trusted Vercel OIDC credential. It expires and is not an ordinary Vercel access token. |
| `QA_AGENT_VERCEL_BYPASS_TOKEN` | Optional Vercel Deployment Protection bypass; does not replace Eve route authentication. |

All configuration stays server-side. Never use a `NEXT_PUBLIC_` prefix. `.env` files are ignored. Restart after changing configuration. The QA-agent deployment still needs its existing `AI_GATEWAY_API_KEY` and runner configuration.

The existing deployed channel originally accepted only trusted Vercel OIDC or local development traffic. This change adds optional bearer authentication in `../web3lane-agent/agent/channels/eve.ts`, retaining both existing modes. Configure a strong random secret privately in both environments. Nothing here deploys the agent or creates a secret for you.

## Implemented

- Eve’s native `useEveAgent` client; streamed replies, safe Markdown, inspectable tool inputs/results.
- Essential questions and tool approvals from Eve’s input ledger, including rejection and freeform responses.
- Stop active work, replay the same session after refresh, and start a new conversation when idle.
- Tab-scoped session ID only in browser storage; replay comes from the agent. New conversation detaches local history, not server-side deletion.
- Read-only health and authenticated inspection checks. A successful health check alone is not authenticated readiness.
- Transcript export, with tool data but without reasoning parts. Not a sealed report or evidence archive.
- Six editable journey prompts and an in-app [testing checklist](http://127.0.0.1:3001/testing-guide).
- Server proxy with endpoint allowlist, origin check for browser POSTs, credential isolation and unbuffered NDJSON.

The guide is derived from `../web3lane-handoff/02-user-journey-and-test-specification.md`. Its stages are guidance, not fabricated job progress. Selecting a prompt only fills the composer. It never approves, pays or starts execution automatically.

## What a full test still needs

1. A reachable agent deployment with the updated auth channel, matching credential and hosted model access.
2. Target URL/build, confirmed expectations, network/wallet, asset metadata, fixtures, balances, approved contracts and explicit spending limits.
3. A trusted host that persists the exact `ApprovedPlan` (version/hash/quote/input snapshot/buyer identity). Chat’s plan tool does not bridge this to payment storage.
4. The separate paid-service host from `../web3lane-agent/deploy/PAID-SERVICE.md`. Masumi `/start_job` needs a buyer credential and an already stored plan binding; chat auth is not buyer/payment auth. Check verified escrow before execution. x402 direct payments have different terms and no automatic refunds.
5. A working host browser runner, isolated test wallet and required environment. Current live runner coverage is Qwap/QMS; NuFi/Minswap and arbitrary dApps are not complete execution adapters. A Vercel chat deployment alone does not prove browser availability.
6. Served report/recording/trace/chain artifacts, with proof for each case outcome. Paths local to the runner are not downloadable evidence URLs.
7. Paid-service settlement checks, acceptance or human-review handling, and deadlines independently of report readiness.

This project implements the conversational test client, not the missing payment/runner orchestration. Use the guide to exercise missing prerequisites, plan revisions, rejected approvals, stream recovery, runner failures, evidence gaps and separate settlement states.

## Verify

```sh
npm run typecheck
npm test
npm run build
```

Proxy tests cover routes, methods, auth forwarding, streaming, upstream failures and origin boundaries. Live conversation/paid execution requires configured deployment credentials and the prerequisites above.
