# web3lane swap demo and acceptance

Demonstrate the complete hiring and testing flow on one small swap app. The product value is agreement on expectations, real wallet execution, linked evidence, and understandable findings.

## Demo setup

Proposed environment: MetaMask, Chromium, Base Sepolia, two known ERC20 test tokens, a funded pool and one fixed swap amount. Select the exact app and contracts during the technical spike. Use public reference tooling; avoid designing a new swap protocol.

Use isolated wallets for the main and negative scenarios. The main wallet begins with enough gas and input tokens, and zero allowance for the approved spender. Masumi on Cardano preprod handles the QA job's service payment.

The demonstration can use a deliberately planted missing-success-notification defect. Label it as planted. The transaction must still execute on the real testnet, and the report must reflect actual captured observations.

## Main scenario

| Step | Action | Assertion and proof |
| --- | --- | --- |
| 1 | Connect wallet | Correct account and network displayed; wallet/browser recording |
| 2 | Enter fixed amount | Correct tokens, amount, quote and approved minimum output |
| 3 | Approve finite allowance | Intended spender and amount; approval receipt and allowance |
| 4 | Submit one swap | Wallet confirmation, submitted hash and successful receipt |
| 5 | Check balances | Input/output balance changes and output at least the approved minimum |
| 6 | Check notification | Pending and success behavior agrees with confirmed requirements and timeout |

Receipt success and UI success are distinct assertions. If the chain succeeds but the required notification is absent, report the UI defect without resubmitting the swap.

## Small negative scenario

Reject the token approval. Verify that no approval transaction is submitted, allowance remains unchanged, the app leaves its loading state and another action remains possible. Keep this scenario independent from the successful swap fixture.

## Product demonstration sequence

1. Submit the app URL and swap goal.
2. Show discovered context and a few essential questions.
3. Confirm a concise test plan, price, funds and limits.
4. Show real service escrow funding.
5. Run the swap and cancellation scenarios with recordings and step events.
6. Open the report, compare UI and chain results, and play a relevant evidence segment.
7. Show the human-review route for incomplete service delivery using a separately labeled controlled runner-failure job if time permits. An app defect alone is not grounds for a refund.

## Delivery acceptance checks

- The approved plan links each case to a requirement and explicit expectations.
- The quote shows included contingency, recovery limits, testing funds and actual review deadline.
- Service funds lock before paid execution.
- Real wallet connection, bounded approval and swap occur on the chosen testnet.
- A pending or successful transaction is not duplicated during recovery.
- Each attempted action, interaction and retry appears in the session log.
- The recording includes relevant wallet windows and browser behavior; capture gaps are disclosed.
- The session replay also exposes conversations, approvals and checkpoints with their original timestamps.
- Evidence references resolve, digests match delivered bytes, and report results match the observed records.
- The system stops unresolved recovery after its approved attempt/time limit; dependent work is marked NOT_RUN.
- Failed and flaky attempts remain visible; missing proof never becomes PASS.
- A human can request/review delivery issues, with confirmed protocol request state before the deadline.
- A scoped report, recording, trace and event log can be downloaded by the buyer.

Do not claim production readiness, all-site coverage or automatic certainty about fault from this demo.

## Submission recording

Prepare a short recording of the product journey for the stage deck, separate from the complete buyer evidence recording. Embed the video directly in the required PPT or Keynote file. The supplied brief prohibits live final-stage demos and external video links; submit the deck, repository and hosted demo before the stated deadline.
