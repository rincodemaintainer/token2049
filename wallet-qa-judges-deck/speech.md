## Slide 1: Hire a wallet QA agent. Get evidence for every result.

Small Web3 teams ship wallet journeys without a dedicated end-to-end QA team. Wallet QA turns a short request into agreed checks, a bounded run, and evidence a developer can inspect. The button is not the proof: we need to know what the browser showed, what the wallet signed, and what the chain did.

## Slide 2: Wallet journeys fail between browser, wallet, and chain

A wallet journey crosses three surfaces. A transaction can settle successfully while a required browser behavior fails, and a browser message can look successful before the chain confirms anything. Manual testing often leaves these pieces in separate screenshots and explorer tabs. Our product joins them into one claim with its supporting evidence and an honest unresolved state when cause is unknown.

## Slide 3: Agree on the test before the agent spends

The buyer starts with a URL and goal. The agent generates a longer pool of planning questions. Laya scores their usefulness and reviews the wording; the buyer sees up to ten at a time, with required fields first. Unclear questions are rewritten before the agent proposes cases and a fixed quote. Laya's review is advisory; the buyer approves the exact expectations and spending limits. That approval binds the payment and later evidence. Green steps are application code; amber steps still require a trusted host or operator. Payment confirmation does not automatically start a browser worker today.

## Slide 4: A five-step buyer journey

This is the intended buyer experience, shown as a concept where screens are unfinished. Request the journey, answer the ranked planning questions, approve assertions and limits, fund the service, watch the bounded run, then read findings with evidence and reproduction steps. Each screen should make the next decision clear, especially the difference between the service fee and test funds. The report should also explain when delivery needs human review.

## Slide 5: The swap landed. The test failed.

Here is the useful distinction in our recorded Qwap run. The browser wallet signed one 0.01 QMS swap. The chain receipt succeeded, and read-only reconciliation found 0.009915 USDC delivered. The Playwright test still failed because the expected explorer tab did not open. We have not established why, so this is a failed browser assertion with an unresolved cause, not a proven app defect. The evidence lets a developer investigate without confusing transaction success with test success.

## Slide 6: What Cardano contributes to the purchase

Cardano is the settlement layer for buying the QA service; the application under test can be on another chain. Masumi provides service identity, escrow, and a path to submit a result hash. The prior preprod rehearsal reached a confirmed funds lock, but its paid QA result was not submitted. A result hash binds delivered bytes; it does not prove our QA judgment is right, and result submission alone is not seller collection. That complete paid loop is our next milestone.

## Slide 7: A separate direct x402 route for agent buyers

We also built a separate direct x402 route for an agent buyer. The buyer receives an exact quote bound to an approved plan, signs one Cardano payment, and retries an uncertain settlement with the same signature. This is a direct transfer, so it does not inherit Masumi escrow refunds. Local tests cover the protocol and state transitions, but live preprod settlement and automatic browser dispatch still need validation.

## Slide 8: Evidence before verdict

The host checks that captured observations and files match the approved plan, session, and payment. Missing critical work or an unresolved transaction blocks paid finalization. When delivery is complete, the buyer receives an inspectable HTML report with machine-readable data, an evidence ZIP containing screenshots, the recording, RPC proof, and logs, plus a manifest listing file sizes and SHA-256 hashes. The package makes the finding reviewable; it does not prove payment completion by itself. Optional agent commentary cannot override recorded outcomes.

## Slide 9: A narrow buyer, a measurable service

Our first buyer is a small Web3 team with one important wallet journey and no dedicated wallet QA specialist. The current workaround is a developer manually checking the UI, wallet, and explorer. A pilot should measure elapsed time, execution cost, and whether the resulting finding was actionable. Pricing and adoption are hypotheses today; we have not invented traction or unit economics.

## Slide 10: Proven today. Next: one paid QA loop.

Today we can show the planning and report core, wallet connection, and one browser swap whose chain result we reconciled. The browser run and paid payment rehearsal are separate pieces. Our next proof is one approved scope, confirmed Cardano funding, bounded execution, and a delivered report all linked to the same job. We are looking for one pilot team and one scoped wallet journey to validate that full purchase and delivery experience.
