# web3lane

An [eve](https://eve.dev) agent that turns a Web3 team's short QA request into confirmed requirements, a versioned test plan, bounded wallet policy, structured session evidence, and a sealed report. Cardano/Masumi handles service payment; the tested app can be another chain. **Token swap testing is one journey template**, not the product itself.

## What works now

Deterministic core under `agent/lib/` implements the [handoff](../web3lane-handoff/) rules:

| Area | Behavior |
| --- | --- |
| Interview | Essential questions only (`list_essential_questions`) |
| Plan + quote | Versioned plan, ~25% contingency fixed fee (`build_test_plan`) |
| Signing policy | Chain/domain/spender/amount/tx caps (`check_signing_policy`) |
| Outcomes | PASS requires evidence; FLAKY/FAIL/BLOCKED/INCONCLUSIVE/RUNNER_ERROR/NOT_RUN (`classify_case_outcome`) |
| Recovery | Three-attempt default; no resubmit while tx status unknown |
| Report | Host packs recorded evidence; optional `draft_result_commentary` supplies interpretation only |
| Swap demo fixture | Injected observations reproduce the missing-notification scenario |

```sh
npm ci
npm test
npm run typecheck
npm run dev
```

## Browser automation status — reset on 2026-10-07

Eve's `run_browser_check` tool runs Playwright against Qwap. Playwright 1.63.0 and Synpress 4.1.2 are installed; wallet setup uses MetaMask 13.13.1. Interactive Playwright debugging verified the full wallet address, password unlock, a real connection popup, QMS Testnet approval, and displayed balances: MetaMask 8.147 QMS, Qwap 8.14712 QMS. Evidence is in `.local/browser-setup/debug-result.json` and adjacent screenshots.

`npm run browser:setup` downloads the pinned extension and runs the Synpress setup. `npm run browser:test` initializes a temporary profile through that same setup on every wallet run: import `QMS_TEST_WALLET_MNEMONIC` from the ignored `.env`, switch MetaMask to popup mode, verify its full address, connect through Qwap, and approve QMS Testnet in the notification popup. Temporary test profiles are removed afterward. Tests do not rely on restored wallet caches.

The earlier “Open wallet is stuck” diagnosis was wrong. MetaMask opens Chrome's side panel, marks onboarding complete, and deliberately disables the original tab's button. Reloading the tab displays the dashboard. The setup now switches to popup mode through MetaMask's menu and closes the leftover panel. A notification badge also overlaps the account-menu mouse target; keyboard Enter opens that menu. Synpress's address and network helpers target older UI, so these checks use the observed current UI instead.

Fresh setup and the wallet browser test passed on 2026-10-07 (19.3s for the wallet test); the public Qwap test also passed. Typecheck passed. Browser assertions cover full address, connection and network popup contents, connected account, and the extension's QMS balance display.

## Cardano QA wallet: NuFi web wallet

Cardano agent QA uses [NuFi’s web wallet](https://wallet.nu.fi/). Eternl is not supported for AI-agent execution, and its preflight tool has been removed from the agent. Verify NuFi web-wallet support for the target network and dApp before execution. A NuFi/Minswap browser runner is not yet implemented.

## Historical Eternl Preprod staking preflight

The [Eternl staking case](../web3lane-handoff/07-eternl-staking-demo.md) is separate from the Qwap first demo. `npm run browser:eternl` runs a fresh Playwright Chromium preflight against `eternl.io`, selects Pre-Production testnet, and captures the Terms/wallet-setup blocker. The former `run_eternl_preflight` agent tool returned `BLOCKED` with its screenshot path and submitted no transaction; it is no longer available to the agent. This is not a completed 4 tADA staking test.

The retained manual-only `npm run browser:eternl:prepare` opens an ignored, dedicated Playwright Chromium profile under `.local/eternl-qa-profile` for user-handled Terms and wallet setup. It records no setup video. Do not put a recovery phrase, PIN, or spending password in chat or test evidence. A live delegation run still needs a funded isolated account, an approved pool ID, transaction-preview checks, and chain reconciliation; browser signing remains disabled until the trusted full-request authorization adapter exists.

The disposable mnemonic in ignored `.env` also controls a local Evolution SDK wallet. `npm run wallet:preprod:status` derives its Preprod address and checks the public balance without sending the mnemonic to a wallet site. The 2026-10-07 check found 0 tADA; the live staking case remains pending funding.

Two runner issues were isolated. Synpress's callback-extraction regex hung on deeply nested setup code; moving the import steps into a helper fixed the extractor and cache build. Separately, both the original saved profile and its copy reopened onboarding after restart. Adding the extension launch flag did not fix that. MetaMask debounces persistence without an awaited flush, making a write race plausible, but the exact persistence failure is unconfirmed. Fresh UI initialization avoids relying on that cache behavior; it does not claim to fix persistence.

Do not treat RPC swaps, CLI transfers, or plan/report fixtures as browser QA success. An earlier Qwap swap used direct RPC calls. The recorded browser run on 2026-10-07 signed one 0.01 QMS swap and observed Qwap success and updated balances. Its Playwright result is still **failed**: the expected explorer tab did not open. Separate read-only RPC reconciliation found a successful receipt in block 59097 and 0.009915 USDC delivered. See `.local/evidence-report/index.html` for the evidence and limits.

## Browser modules

- `tests/helpers/wallet-bootstrap.ts`: load and validate local credentials.
- `tests/helpers/metamask-setup.ts`: import MetaMask and configure popup mode. `tests/wallet-setup/qms.setup.ts` orchestrates setup and readiness evidence.
- `tests/helpers/wallet-connection.ts`: connection popup and expected network approval. App controls and assertions stay in the journey spec.
- `tests/helpers/wallet-interaction.ts`: opt-in token approval and message signing, with supplied request policy checks and exact finite allowance.

Interaction helpers are unit-tested adapters, not live-verified MetaMask 13.13.1 flows. The caller must inspect the pending request (including message content and gas settings), supply matching policy fields, track transaction usage, and verify receipts/evidence. These helpers do not extract request fields or enforce gas settings themselves. Connection-only tests do not call them.

## Test wallet migration — 2026-10-07

Generated a fresh 24-word recovery phrase with viem and saved it locally in `.env` and `.env.local` (mode 0600, ignored by Git). Active test wallet: `0x6Ba7c2Cb493834d922028EE7B2c33aB99b0c6210`. Previous credentials are retained under `QMS_PREVIOUS_TEST_WALLET_*`.

At the user's explicit request, CLI transactions moved 0.205119 USDC and 8.147124027203572166 QMS from `0x5a6208aD268C30D9641EDce35F420B61bEAF6819` on QMS Testnet (19480). Both receipts succeeded; source QMS and USDC balances are zero. The private local journal `.local/wallet-migration.json` records hashes and verification. These transfers are not browser test evidence.
The one-off preparation and migration scripts have been removed.

## Model configuration and production environment

Eve selects its model at runtime in `agent/agent.ts`, with high reasoning in both modes:

- **Local development:** `npm run dev` sets `NODE_ENV=development` and uses `chatgpt("gpt-5.6-luna")` with your existing ChatGPT subscription login. No Gateway key is required. If the session expires, sign in through eve's `/login`.
- **Production and Vercel previews:** use `openai/gpt-oss-20b` through Vercel AI Gateway. Any Vercel deployment uses Gateway even if `NODE_ENV` is accidentally set to `development`. Local runs without `NODE_ENV=development` also use Gateway.

The resolver runs at `step.started` because eve requires that scope when returning a live subscription model. It reads environment settings at runtime rather than baking local authentication into a deployment.

Production uses GPT-OSS 20B at $0.03 input / $0.14 output per million tokens.
Live text and tool-call checks passed on this Vercel free-tier account. It accepts
text, not screenshot input. Gemini 2.5 Flash-Lite is a vision-capable alternative
whose text smoke check also passed. The previous DeepInfra GLM configuration
was rejected because this account's free tier cannot access it.

See [Vercel hosting and model budget](deploy/VERCEL-AGENT.md) for the tested
alternatives, free-model limitations, and deployment settings. Model credits
are separate from hosting, Workflow, and Sandbox usage. The AWS experiment is
preserved in commit `22ade12`; Bedrock is no longer selected by this runtime.

For local Gateway testing, create an **AI Gateway API key** from your Vercel team's AI Gateway page and add it to the ignored `web3lane-agent/.env.local`. A general Vercel deployment/access token is not a Gateway key. See [Gateway authentication](https://vercel.com/docs/ai-gateway/authentication-and-byok).

```dotenv
AI_GATEWAY_API_KEY=<your-ai-gateway-api-key>
```

Run `NODE_ENV=production npx eve dev` to exercise the Gateway branch locally. For local subscription evals, use `NODE_ENV=development npm run eval`; production evals should use the Gateway branch.

For production on Vercel, open the **Eve agent project → Settings → Environment Variables**. Add `AI_GATEWAY_API_KEY` as a secret, select **Production** (and **Preview** if needed), save, then deploy or redeploy. Environment changes apply to new deployments only. Keep this variable server-side, without a `NEXT_PUBLIC_` prefix; the separate static report app does not need it. See [Vercel environment variables](https://vercel.com/docs/environment-variables).

This config preserves local ChatGPT subscription authentication. It does not complete buyer authentication, trusted browser execution, wallet signing authorization, or Sokosumi synchronization.

## Local model smoke

Start eve's TUI with `npm run dev`, using your existing subscription login:

> Plan a wallet QA job for a Base Sepolia dApp. I need connect + one critical transaction journey and a UI success check. What information is missing?

Or exercise the swap journey template:

> Build the swap_demo test plan for https://swap.example.invalid and summarize cases, quote, and required evidence.

`agent-api.mjs` requires a host-stored approved plan and exact quote before creating payment terms, and finalizes recorded evidence rather than model prose. `paid-flow.mjs` remains a separate payment rehearsal script. See [payment-incident.md](./payment-incident.md) before creating another paid claim.

## Verification scope

Regression tests cover skipped/unknown steps, attempt limits, per-attempt evidence,
unresolved transactions, signing bounds, log redaction, draft approval, template
inputs, and report delivery. Reports require required artifact manifest entries
with paths and SHA-256 digests; the caller still supplies those digests. Fixture
artifacts have no captured files or digests, so fixture delivery is incomplete.

Local verification on 2026-10-07: 50 unit tests and typecheck passed. Using Node 24
and the local ChatGPT subscription session, the Eve model smoke succeeded and two
real-model evals passed all nine gates. The browser eval verified that Eve invoked
Playwright and reported BLOCKED for the unavailable wallet flow; this does not
mean the wallet browser test passed. Evidence: `.eve/evals/2026-10-06T17-55-54/summary.json`.
Browser signing/swap and Masumi paid flows remain unverified in this run.

## Swap evidence export

`reports/INPUT-CONTRACT.md` defines the input JSON and finalizer data contract. From this directory, run `node scripts/build-evidence-report.mjs reports/swap-demo.input.json`. The output is `.local/evidence-report/index.html` plus `evidence.zip`, `report-data.json`, and a SHA-256 manifest. The archive contains allowlisted evidence, raw RPC proof, and relevant source files captured at export time. The new run includes the Qwap page recording, screenshots, full Playwright JSON, and runner console log. Its trace did not finalize, and the exact run-time source tree was not saved; the page labels both gaps. The earlier run is preserved under `.local/historic-swap-2026-10-07/`.

Playwright records pages opened after wallet setup and starts its trace after setup. Onboarding recordings are deleted because they can show the recovery phrase. Capture console output with `set -o pipefail; npm run browser:swap 2>&1 | tee .local/swap-run.log`, then set `runnerLog` in the input JSON before export. New browser signing is blocked by `requireQmsSigningAuthorization` until a trusted adapter validates the full pending request, gas, approved plan, and escrow. Historical recordings remain exportable.


## Host enforcement and static reports

The API input is `{ prompt, approved_job_id, plan_version, approved_plan_hash }`. The approval must already exist in the trusted host store. Its binding enters the input hash; an atomic reservation permits one paid execution per approved version. Repeated/uncertain writes are not replayed. Supported preprod fees must match the approved quote.

`node record-paid-run.mjs begin <saved-job.json> <trusted-payment-snapshot.json>` records funded execution authorization and assigns a session ID. After the trusted runner captures observations, pack its files using the [execution/report contract](reports/INPUT-CONTRACT.md), then register them with `node record-paid-run.mjs record <saved-job.json> <trusted-payment-snapshot.json> <recorded-run.json>`. These are offline host commands; snapshots must come from the trusted payment service/operator. The API rechecks current escrow before finalization.

Finalization verifies file bytes, exact plan and execution bindings, session, observation equality, timestamps, distinct artifact paths, transaction resolution, and delivery completeness. A conclusive app FAIL can be delivered; missing critical work cannot. The process persists `submit-pending` before external submission; uncertain submission requires operator reconciliation. The host recording/runner adapter and Sokosumi Task event synchronization remain explicit integration work, not an automatic browser pipeline.

```sh
# In web3lane-agent:
npm run report:pack -- reports/swap-demo.input.json .local/reports/swap-01
npm run report:import -- .local/reports/swap-01 swap-01

# In web3lane-reports:
npm run build
```

The separate Next.js app generates static report pages from verified imported files. Agent summaries/comments are optional and cannot alter recorded results. See [the report app](../web3lane-reports/README.md). Run `npm test`, `npm run test:reports`, and `node --test agent-api.test.mjs` for core, packing/integration, and localhost-only API checks; the latter needs local socket access. No check sends a real payment or signs a transaction.

## Persistent paid/browser host

Deployment update (2026-10-07): Vercel `token2049-green.vercel.app` and AWS runner image `web3lane-paid-browser:fixed-1-tusdm` contain fixed-price support. The runner uses `/etc/wallet-qa/fixed-price-service.env`, a Preprod-only seller-scoped read/pay MPS key, and the durable registration binding at `/app/.local/registration-state.json`. Registry price changes must reach `UpdateConfirmed` before binding the replacement agent identifier.

New Masumi preprod checkouts use **Fixed pricing: 1 tUSDM** (`1000000` base units, 6 decimals). The registered Cardano V2 source and the buyer-approved plan must both match that exact asset and amount. The plan tool quotes 1 tUSDM with zero extra contingency. Old plans with different fees require a new buyer approval; existing paid jobs retain their saved terms. Fixed-price payment requests omit `RequestedFunds` so MPS derives the price from registration, then the runner verifies the returned amount.

The paid API runs on one persistent Linux host, separately from Eve and the static report app. See [deployment and adapter setup](deploy/PAID-SERVICE.md). `WEB3LANE_DATA_ROOT` holds durable jobs, approvals, reservations, execution records, and evidence. Atomic writes are fsynced; a process lock prevents a second API instance. An unclean stop requires operator reconciliation before restarting.

Checkout and status endpoints require `Authorization: Bearer <buyer-token>`. Provision buyer IDs and SHA-256 token hashes in `api-clients.json`; the buyer ID must match the host-approved plan's `approval.requester_id`. Jobs retain their buyer ID, so knowing a job UUID does not grant access. Only `/availability` and `/input_schema` are public. Existing jobs without a buyer ID require an operator migration before API access.

Configure an operator-owned runner module with `WEB3LANE_RUNNER_ADAPTER`. New checkout requires its `supports(plan)` admission check. The dispatcher serializes funded jobs, persists a one-time execution claim before invoking the adapter, and passes returned recordings through existing bundle verification and finalization. Interrupted or failed execution is blocked for inspection, never automatically re-signed. Masumi funding is re-read from MPS; x402 funding checks reload and validate the facilitator's saved confirmed receipt, not a new chain query.

The adapter interface is implemented, but an end-to-end MetaMask browser adapter and final wallet-request capture are still missing. Do not use an adapter that returns `true` for unsupported plans just to enable payment. Signing remains blocked. `npm run test:service` covers authentication, persistence, replay, and dispatcher behavior using fixtures; it does not submit real payments or wallet transactions.

## Decision: separate Cardano x402 checkout (2026-10-07)

**Accepted:** retain Masumi escrow and add a separate, direct x402 payment flow for agents purchasing approved QA runs. The x402 flow does not provide automatic escrow refunds. A refund would require an operator-approved return transfer; no refund-transfer implementation is included.

| | Existing Masumi | New x402 |
| --- | --- | --- |
| Checkout | `POST /start_job` | `POST /x402/jobs` |
| Payment | MPS `Web3CardanoV2` escrow | Cardano preprod `exact`, address-to-address |
| Execution funding | Confirmed `FundsLocked` | Confirmed facilitator receipt, at least one newer block |
| Result delivery | MPS result submission | Verified report returned by `/x402/status` |
| Refunds/disputes | Existing Masumi lifecycle | Separate manual refund; no escrow/dispute lifecycle |
| Job journal | `.local/standard-jobs` | `.local/x402-jobs` |

Reason: `@x402/cardano` 2.28.0 signs Masumi escrow terms differently from MPS. Its documentation explicitly states that its escrow locks cannot run through an existing `masumi-payment-service` node. Reusing the current MPS poller would therefore misrepresent result/refund support. See the [SDK compatibility explanation](https://www.npmjs.com/package/@x402/cardano#relationship-to-masumi-payment-service) and [Cardano scheme](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_cardano.md). Future x402 escrow would require its own compatible lifecycle; it is not enabled here.

Both flows reserve the same host-approved plan version in `.local/approved-executions`. A plan already purchased through either flow cannot be charged through the other. Unpaid x402 quotes do not reserve execution. x402 never creates an MPS payment or submits an MPS result.

### Configure and run

Use Node 24 and provision the authenticated service and trusted adapter described above. The seller checkout needs a **public receiving address**, not a wallet signing key:

```sh
export X402_PAY_TO='<your Cardano preprod receiving address>'
export X402_FACILITATOR_URL='https://x402.preprod.dev.ecosyseng.cf-deployments.org'
export X402_RESOURCE_URL='http://127.0.0.1:21950/x402/jobs'
npm run api
```

Omitting `X402_PAY_TO` disables the new endpoints (HTTP 503). The facilitator URL above is the default; `X402_RESOURCE_URL` defaults to the local API URL. For a reverse proxy, set it to the exact HTTPS URL buyers use. The API still binds to localhost. Preserve the existing runtime configuration when using Masumi alongside x402.

The host must first persist the approved plan, as for `/start_job`. Send:

```json
{
  "identifier_from_purchaser": "1234567890abcdef",
  "input_data": {
    "prompt": "Run the approved QA plan",
    "approved_job_id": "your-approved-job",
    "plan_version": 1,
    "approved_plan_hash": "<64-character approved plan hash>"
  }
}
```

`POST /x402/jobs` returns HTTP 402 with the standard base64 `PAYMENT-REQUIRED` header. The quote includes the exact approved fee, plan hash and job binding. The buyer signs a Cardano transaction and repeats the body with `PAYMENT-SIGNATURE`. The facilitator verifies it, the server reserves the job, and the facilitator submits the payment. A confirmed payment returns HTTP 200, a `PAYMENT-RESPONSE` receipt and `status: awaiting_execution`.

HTTP 202 means settlement is pending or uncertain. Repeat the **same body and original signed header**; do not create another transaction. The API skips fresh verification for already submitted payments, since their inputs may now be spent. Only a definitive rejection or proven expiry becomes terminal. HTTP 409 can also indicate concurrent checkout, a changed request, or an existing plan reservation; inspect its error before retrying.

`GET /x402/status?job_id=<id>` is free and returns the current job status and, when completed, the verified result. It requires the same buyer's bearer authentication as checkout; other buyers receive 404.

### Buyer integration

`x402-client.mjs` accepts the buyer's own SDK-compatible Cardano signer. It checks the quote against the buyer-approved recipient, asset, amount and plan before signing. It separates preparation from submission so the agent can persist the signed attempt before any broadcast:

Pass an authenticated `fetchImpl` to both `prepareX402Job({ ..., fetchImpl })` and `submitX402Job(attempt, { fetchImpl })`. The wrapper should add the buyer's `Authorization` header only for the configured service origin. Keep this credential outside the persisted payment attempt; refresh it independently when retrying. The example below shows payment preparation, assuming that authenticated wrapper has been supplied.

```js
import { writeFile, readFile } from 'node:fs/promises';
import { prepareX402Job, submitX402Job } from './x402-client.mjs';

// authenticatedFetch attaches buyer auth only to this service origin.
// buyerSigner, approvedInput, receivingAddress and approvedAmount come from
// the buyer's wallet/approval system. This seller never receives its keys.
const prepared = await prepareX402Job({
  fetchImpl: authenticatedFetch,
  url: 'http://127.0.0.1:21950/x402/jobs',
  input: approvedInput,
  signer: buyerSigner,
  payTo: receivingAddress,
  asset: 'lovelace',
  amount: approvedAmount, // string, exact atomic units
});
if (prepared.attempt) {
  await writeFile('qa-payment-attempt.json', JSON.stringify(prepared.attempt),
    { flag: 'wx', mode: 0o600 });
  const response = await submitX402Job(prepared.attempt, { fetchImpl: authenticatedFetch });
  console.log(response.status, await response.json());
} else {
  // Already paid, pending, or a non-payment API error: inspect, do not sign again.
  console.log(prepared.response.status, await prepared.response.json());
}

// On timeout or 202, recover the same attempt, including after buyer restart:
// const attempt = JSON.parse(await readFile('qa-payment-attempt.json', 'utf8'));
// const response = await submitX402Job(attempt, { fetchImpl: authenticatedFetch });
```

The approved amount covers the service fee. The buyer also funds Cardano transaction fees and minimum ADA in outputs. USDM uses the existing approved-plan asset policy in dotted x402 format; the code deliberately does not silently substitute the SDK's different default preprod USDM policy. Obtain the exact quoted asset when paying in tokens.

### Trusted execution and report handoff

Payment authorizes an approved job; it does not automatically launch a browser. The existing trusted runner/operator still captures the evidence. For a settled x402 job:

```sh
node record-x402-run.mjs begin .local/x402-jobs/<job-id>.json
# Run the approved QA work using the returned session/binding; pack its evidence.
node record-x402-run.mjs record .local/x402-jobs/<job-id>.json <recorded-run.json>
node record-x402-run.mjs finalize .local/x402-jobs/<job-id>.json
```

These commands use the same [recording/evidence contract](reports/INPUT-CONTRACT.md) and verification as Masumi jobs. `begin` atomically reserves one execution session in `.local/x402-executions`; finalization requires that session's recorded observations and verified artifacts. The sealed report identifies `x402-settled` and explicitly states that no automatic escrow refund is available. No MPS calls occur.

### Recovery and verification limits

Run **one API process per local journal**. `.local/x402-checkout` stores nonce-to-job and canonical transaction-to-job claims; job records retain exact requirements, signed payload and receipt. Claims are never reassigned. Restarts can reconcile settlement using the saved payload. Preserve the original facilitator URL for pending jobs. The configured facilitator must itself preserve settlement claims across restarts; an SDK facilitator with only its default in-memory store is insufficient for reliable recovery.

An interrupted file write, conflicting reservation, or incomplete journal requires operator inspection. Do not delete reservations or pay again to bypass an uncertain outcome. A future multi-replica deployment needs transactional shared storage and distributed locking.

Run `npm run test:x402`, `npm test`, `npm run test:reports`, `node --test agent-api.test.mjs` and `npm run typecheck`. API tests use localhost fixtures; they require socket access. Tests cover SDK framing and application state transitions with a mocked facilitator, not live Cardano settlement. Live preprod funding and end-to-end paid browser execution remain separate validation steps.
