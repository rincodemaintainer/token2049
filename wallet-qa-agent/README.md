# Wallet QA agent

An [eve](https://eve.dev) agent for Web3 teams to plan wallet tests and report supplied evidence. Browser wallet execution, signing controls, and recording are not connected yet; it cannot complete the Qwap UI swap test.

## Browser automation status — reset on 2026-10-07

The required outcome is an automated browser test: open Qwap, connect the intended wallet, approve the swap through the wallet UI, and verify the app's result with browser evidence. This has not been completed.

- The earlier swap was submitted directly to the router through RPC. Using it as a substitute for the requested browser test was wrong. It provides no evidence that wallet connection, browser signing, or Qwap's success notification worked.
- The public swap form preflight only checked page controls. It did not connect a wallet or execute a browser swap.
- The opened MetaMask profile used the public example account `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`. The intended funded test wallet is `0x5a6208aD268C30D9641EDce35F420B61bEAF6819`; its saved private key was checked against that address without printing it. Its import, selection, and balance were not verified in the browser.
- Direct Playwright attempts reached onboarding and stalled after “Open wallet.” A subsequent Synpress cache build timed out before account import. Interactive inspection reported “Background connection unresponsive”; restarting MetaMask did not produce a verified wallet session.
- At the user's request, the browser setup was removed: Playwright/Synpress dependencies, test configuration and fixtures, browser profiles, downloaded extensions, helper scripts, caches, reports, screenshots, and recordings. Wallet credentials and historical transaction/payment records were preserved.

A future browser runner must verify the selected and connected wallet address before any transaction. If browser automation fails, report that failure; do not fall back to direct RPC transactions or claim a successful browser test.

## Local setup

Use Node.js 24 (the Codex bundled runtime is available at `/Users/rinnguyen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`). Install the locked dependencies, then start eve:

```sh
npm ci
npm run dev
```

In eve's terminal UI, use `/login` to connect a model. The current `agent/agent.ts` uses a ChatGPT subscription for local development; it cannot serve a hosted deployment. Send a small request such as:

> Plan a Base Sepolia Token A to Token B swap check. Verify the success notification. What information is missing?

For an HTTP client or worker, start `npm exec -- eve dev --no-ui` and use the [eve client](https://eve.dev/docs/guides/client/overview) against `http://127.0.0.1:2000`. Keep the model credential on the server side. The Coworker runtime key belongs in an ignored `.env.local` file and must not be sent to the model.

## Verified on 2026-10-06

- `npm run typecheck` passes with eve 0.71.2.
- A real local model turn produced a two-sentence swap QA plan using a synthetic request.
- A second local model turn reported a synthetic missing-notification finding and identified absent recording and chain evidence.
- Sokosumi rehearsal Task `01a111b3-3bd4-72a7-9aaa-49db0b051164` completed.
- QMS Testnet transaction `0xbf2dc8012be42f98dd2e208f42536fd796a77da639113335517e64c3de94b619` swapped 0.2 QMS for 0.205119 USDC, above the approved 2.5% slippage minimum of 0.200026 USDC. This was a direct router transaction, not a browser QA run; it does not verify Qwap's wallet flow or success toast.
- Local MPS is healthy, with a funded Cardano Preprod selling wallet. Wallet QA Masumi registration `cmuwttitd00009y9hg1xigtqo` confirmed on chain. A Preprod-only, seller-scoped ReadAndPay key works.
- Paid Sokosumi Task `01a111d4-d4a2-76cc-a903-bac8ab4ba797` is RUNNING. Core marked its 1 test USDM claim PURCHASED and FundsLocked. The seller MPS marked the payment `FundsOrDatumInvalid` after its timeout job ran before the scanner reached the lock. Its repair preview found the on-chain transaction has the expected blockchain identifier but the local request has no `collateralReturnLovelace`. The model result is saved, but the signed submission deadline expired; Task completion and seller collection were not attempted. See [payment-incident.md](./payment-incident.md) and private checkpoints before any recovery or retry.

Never treat the PURCHASED claim or Task completion as seller receipt. Do not create another payment claim while this one is unresolved.
