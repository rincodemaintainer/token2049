# web3lane — judges’ slide script

Revised 7 October 2026. Existing 10-slide sequence; approximately 6 minutes, excluding demo playback. Implementation claims reflect the current repository and recorded deployment. The existing slide images and PPTX have not been updated to match this script.

## Slide 1: Hire a wallet QA agent. Get evidence for every result.

Small Web3 teams ship wallet journeys without a dedicated QA team. When something goes wrong, developers piece together browser screenshots, wallet activity, and explorer tabs.

web3lane turns a short request into agreed checks, a bounded test run, and evidence a developer can inspect. Our starting point is one critical wallet journey. Our promise is simple: the button is not the proof.

## Slide 2: Wallet journeys fail between browser, wallet, and chain

A wallet journey crosses three surfaces: the application, the wallet, and the chain. Each can tell a different story.

A transaction can settle while the interface fails an expected behavior. A success message can appear before the transaction is confirmed. Checking only one surface misses the problem.

web3lane connects those observations to the same test. The developer sees what happened, which expectation failed, and what remains unknown.

## Slide 3: Agree on the test before the agent spends

The buyer starts with a URL and a goal. Eve asks up to five ranked questions per round. Laya helps rank useful questions and flag unclear wording; required details still come first.

The agent probes the target chain’s response and block timing to inform execution limits. It then proposes a versioned plan: exact assertions, required evidence, a service quote, and separate wallet-spending limits.

The buyer approves that scope. The trusted host stores its version and hash, so payment and execution refer to the same agreement. Chat approval still needs that host handoff.

## Slide 4: A five-step buyer journey

The journey is request, approve, fund, run, and inspect.

The chat client now supports streamed answers, planning questions, tool approvals, and session replay. Behind it, Eve handles planning on Vercel. The persistent QA runner, Masumi, and PostgreSQL share an EC2 host in Singapore, reached through an HTTPS gateway.

The paid service checks runner support before checkout and dispatches confirmed funded jobs one at a time. The current adapter targets one Qwap swap journey. Reports are exported and published separately. This is implemented infrastructure with a narrow execution scope; the chat-to-checkout handoff still needs integration.

## Slide 5: The swap landed. The test failed.

Our recorded Qwap run shows why this matters.

The browser wallet signed a 0.01 QMS swap. The chain receipt succeeded, and read-only reconciliation found 0.009915 USDC delivered. But the browser test failed because the expected explorer tab did not open.

That is a failed browser assertion with an unresolved cause. It does not establish an application defect, and it does not erase the successful transaction.

The developer gets both facts and the evidence needed to investigate.

## Slide 6: What Cardano contributes to the purchase

Cardano settles the purchase of the QA service. The application under test can run on another chain, as Qwap does here.

Our Masumi route uses service registration, escrow, and result-hash submission. The current Preprod service fee is fixed at one tUSDM, separate from test funds and transaction fees.

The service checks confirmed funding before execution and verifies the evidence before submitting a result hash. That hash binds the delivered result; it does not prove the QA judgment. Result submission and seller collection are separate states.

## Slide 7: A separate direct x402 route for agent buyers

For another agent buying QA, we also implement a direct Cardano x402 route.

The buyer receives a quote tied to an approved plan, checks its terms, and signs one payment. If settlement is uncertain, retries reuse that same signed payment. Once confirmed, the job enters the funded execution path.

This route is a direct transfer, with no automatic escrow refund. Protocol and recovery tests use fixtures; live x402 settlement remains a separate validation step.

## Slide 8: Evidence before verdict

The host verifies captured files against the approved plan and execution session. Missing critical work or an unresolved transaction blocks paid finalization. A conclusive application failure can still be a useful, complete QA delivery.

The output includes an inspectable HTML report, machine-readable results, an evidence archive, and a manifest with file hashes. Screenshots, recordings, and chain proof support the verdict; optional agent commentary cannot override it.

For follow-up testing, the agent can also generate Cypress assertions from a stored approved plan. Those scripts test the dApp; wallet execution belongs to the dedicated runner.

## Slide 9: A narrow buyer, a measurable service

Our first buyer is a small Web3 team with one important wallet journey and no dedicated wallet QA specialist.

The value is less time reconstructing what happened and clearer evidence for the next debugging decision. In a pilot, we will measure turnaround time, execution cost, and whether findings lead to useful fixes.

One tUSDM is our current testnet service price. Commercial pricing and customer demand still need validation.

## Slide 10: From implemented service to a verified paid journey

We have the planning tools, chat client, deployed paid-service infrastructure, a scoped Qwap runner, and evidence reports. Our recorded browser swap demonstrates why transaction success and test success need separate proof.

The next acceptance milestone is one complete paid journey: a stored approved plan, confirmed Cardano funding, bounded browser execution, and a verified report with confirmed payment-linked delivery.

We are looking for one pilot team and one critical wallet flow. Agree on the test. Run within limits. Inspect the proof.
