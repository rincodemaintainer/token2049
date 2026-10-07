# web3lane architecture and implementation sequence

Use a thin product layer over existing wallet automation and Masumi settlement. Keep planning, deterministic execution, evidence storage and payment state separate so failures can be diagnosed and reviewed.

## Components

| Component | Responsibility |
| --- | --- |
| Web application | Intake, structured interview, plan/quote approval, progress, report and human review |
| Job orchestrator | Persist workflow state, enforce limits, schedule runner, handle pauses and deadlines |
| Planning service | Extract relevant context and propose concise cases; consume structured deltas |
| Browser runner | Execute approved scripts through real wallet interactions |
| Signing policy | Enforce approved network, contracts, amounts, actions and transaction limits |
| Chain reader | Reconcile receipts, allowances, balances and pending transactions |
| Evidence store | Recordings, traces, screenshots, event logs and sealed manifests |
| Masumi adapter | Register service, link jobs/payments, submit hashes, request/authorize refunds and observe settlement |
| Human operator view | Compare terms/evidence and record refund or replacement decisions |

Next.js/TypeScript is a suitable frontend and orchestration default. A persistent Chromium runner with Playwright and Synpress is the proposed first wallet path. A worker/container is needed for long browser jobs; do not run the entire session inside a short HTTP request.

Synpress provides MetaMask automation. Playwright supports extensions in persistent Chromium. Browserbase supports custom extensions, but the exact wallet/runner/capture combination must pass an integration spike before committing to hosted execution. [Synpress](https://github.com/synpress-io/synpress), [Playwright extensions](https://playwright.dev/docs/chrome-extensions), [Browserbase extensions](https://docs.browserbase.com/platform/browser/core-features/browser-extensions)

## State and persistence

Application workflow: draft, inspecting, awaiting clarification, plan ready, awaiting funding, running, paused, report ready, under human review, closed or canceled.

Keep this separate from Masumi service status, payment status and per-case outcome. A ready report does not imply accepted delivery, and a technical job completion does not imply payment collection.

Persist job identity, requester, environment, plan versions, quote, approval, limits, wallet references, transaction references, checkpoint requests, case attempts, artifact manifests and human decisions. Append history rather than overwriting failures with the latest outcome.

Validate client ownership and plan version on mutations. Use idempotency for job creation, funding linkage and transaction actions. Chain events and queued callbacks can arrive late or more than once.

Limit browser access and signing to the approved app environment. Treat page and repository content as data; it cannot authorize secret disclosure, new domains/contracts or larger spending. The backend enforces those boundaries independently of model output.

## Masumi integration

Use the standard service endpoints for job start, status, availability and input schema; implement the optional additional-input endpoint for checkpoints. Bind job IDs to `blockchainIdentifier` and read live payment state before starting paid execution. Quote and plan approval endpoints are application features. [MIP-003](https://www.masumi.network/dev/masumi/mips/_mip-003), [Payments and Escrow](https://www.masumi.network/dev/masumi/core-concepts/payments)

Choose the payment asset and node hosting with the partner team. The standard escrow route is sufficient for the main paid job. x402 is an optional request/payment entry point; direct address payment alone does not provide the same escrow review process. [Masumi x402](https://www.masumi.network/dev/masumi/core-concepts/x402)

Use protocol timestamps and hashing rules from the deployed integration. Application pausing must not be interpreted as an extension of those timestamps.

## Implementation sequence

1. Prove one real wallet connection, finite approval and swap on the selected testnet; capture wallet windows.
2. Prove one Masumi preprod lock, result submission and seller-authorized refund. Establish the human reviewer and review deadlines.
3. Define the shared job/test/event records and versioned approval. Build the structured interview and fixed quote.
4. Connect the approved plan to the bounded runner, transaction reconciliation and evidence store.
5. Build the report and human review screen; preserve all attempted outcomes.
6. Complete the demo checks, recording and hackathon submission material.

The first two spikes determine viability. Existing public tooling may be studied now; the submitted product and substantial code must be built within the event under the supplied rules.

## Later interfaces

Agent-to-agent mode is paused. Preserve machine-readable schemas and status so external agents can later submit requests, answer essential questions, bring plans back for authorization and retrieve artifacts. Spending delegation, signed plan authority and duplicate paid requests need design before enabling autonomous clients.

Telegram remains optional. Build it as another authenticated client of the same job workflow. Use chat for interview, progress and report delivery; connect funding and detailed approval to an authenticated web or Mini App experience. Store bot tokens on the server when implementation begins.
