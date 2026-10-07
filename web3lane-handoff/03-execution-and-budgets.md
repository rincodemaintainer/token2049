# web3lane execution and budgets

Execution stays within a confirmed scope, fixed service quote and separate transaction limits. The quote includes bounded recovery work so ordinary clarification does not create surprise charges.

## Pricing proposal

| Stage | Proposed treatment |
| --- | --- |
| Initial inspection | Free, with page, browser-time and model-usage ceilings |
| Deeper discovery | Later optional fixed-price deliverable; credit toward execution in application pricing |
| Execution | Fixed scoped fee funded into escrow before the runner starts |

Start with approximately 25 percent contingency above the estimated service cost and margin. Include up to two clarification rounds and three total attempts per eligible case. These are proposed defaults, not measured unit economics. Benchmark runner costs and choose actual time limits before accepting paid jobs.

Publish one fixed fee including contingency. An unused allowance does not automatically reduce that fee. A metered price with unused-funds refunds would be a different product and needs separate settlement design. Incomplete promised delivery still permits refund review.

The operator finances browser and model consumption while funds remain locked; escrow protects against nonpayment but does not make the locked fee available for immediate operating costs.

## Three separate budgets

1. **Service fee:** payment for agreed testing and evidence, including the contingency.
2. **Testing funds:** native tokens and assets held by the job's isolated test wallet. These may be spent or locked by approved tests; report ending balances and outstanding allowances.
3. **Execution limits:** model usage, browser duration, attempts, permitted transactions and pause deadlines enforced by the backend.

Use asset IDs, chain IDs, decimals and base-unit strings for token limits. Fiat equivalents are informational estimates. No service fee, testing funds or gas budget silently converts into another category.

Service refunds concern the QA fee. Spent gas and funds locked in the tested app are not automatically recovered by a Masumi refund. Agree on the return address and handling of unused test funds before accepting deposits; record any authorized return separately.

## Wallet execution

Provision an isolated test wallet for the job. Its key stays in the wallet/runner boundary and outside model prompts, chat messages and evidence artifacts. A separate Cardano identity receives service settlement.

Before a signature, enforce approved chain, domain, contract/spender, action type, token amount, gas cap and transaction count in code. Keep token approval finite and match the planned spender. A webpage, repository instruction or model suggestion cannot broaden those rules.

Before execution, check prerequisites for the selected cases: connectivity, wallet support, chain, balances, allowances, account permissions, token metadata and pool readiness. Intentional negative-test conditions such as an empty wallet are fixtures, not funding blockers.

## Recovery rule

The proposed cap is three attempts total: initial execution and two retries. Stop sooner for conclusive evidence, a violated policy, an exhausted budget or an unsafe-to-repeat transaction. Successful recovery after a failure is reported as FLAKY when relevant to the case outcome.

| Condition | Runner response |
| --- | --- |
| Clear reproducible app mismatch | Record a defect; reproduce only when useful and permitted |
| Temporary infrastructure or browser issue | Retry within case and job limits |
| Three attempts with unresolved outcome | Stop case as INCONCLUSIVE or RUNNER_ERROR with supporting history |
| Missing prerequisite | BLOCKED and a targeted checkpoint |
| Failed dependency | NOT_RUN with dependency reference |

Continue independent cases when their prerequisites hold. Never change assertions to manufacture a pass. A selector repair or wait adjustment must preserve the approved expectation and be logged.

Retries of signed transactions require chain reconciliation first. Retain the submitted hash and nonce; inspect receipt/pending status before another signature. If confirmation is unknown, pause instead of sending another swap. Browser retry counters are not sufficient protection against duplicate onchain effects.

## Checkpoints and scope changes

At a checkpoint, show completed work, the blocking evidence, the exact missing input and the remaining budget. Pause billable execution resources while waiting, retaining state needed to resume.

A funded protocol deadline continues to approach during a pause. Configure realistic delivery and review windows; do not imply the UI can freeze or extend escrow deadlines. If the job cannot resume in time, deliver an honest incomplete report and make human review available.

Additional scope or higher spending requires a revised quote and approval. Use a new job where required by the payment lifecycle. Do not repeatedly ask about routine actions already covered by the approved plan.

Every policy check, attempted action, retry, checkpoint, actual usage increment and stop reason belongs in the session event log described in [Session evidence and refund review](04-session-evidence-and-refund-review.md).
