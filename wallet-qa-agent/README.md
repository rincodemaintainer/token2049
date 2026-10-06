# Wallet QA agent

An [eve](https://eve.dev) agent that turns a Web3 team's short QA request into confirmed requirements, a versioned test plan, bounded wallet policy, structured session evidence, and a sealed report. Cardano/Masumi handles service payment; the tested app can be another chain. **Token swap testing is one journey template**, not the product itself.

## What works now

Deterministic core under `agent/lib/` implements the [handoff](../wallet-qa-handoff/) rules:

| Area | Behavior |
| --- | --- |
| Interview | Essential questions only (`list_essential_questions`) |
| Plan + quote | Versioned plan, ~25% contingency fixed fee (`build_test_plan`) |
| Signing policy | Chain/domain/spender/amount/tx caps (`check_signing_policy`) |
| Outcomes | PASS requires evidence; FLAKY/FAIL/BLOCKED/INCONCLUSIVE/RUNNER_ERROR/NOT_RUN (`classify_case_outcome`) |
| Recovery | Three-attempt default; no resubmit while tx status unknown |
| Report | Delivery completeness separate from app defects (`build_result_report`) |
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

Fresh setup and the wallet browser test passed on 2026-10-07 (19.3s for the wallet test); the public Qwap test also passed. Typecheck passed. Browser assertions cover full address, connection and network popup contents, connected account, and the extension's QMS balance display. Signing and swap execution remain unverified.

Two runner issues were isolated. Synpress's callback-extraction regex hung on deeply nested setup code; moving the import steps into a helper fixed the extractor and cache build. Separately, both the original saved profile and its copy reopened onboarding after restart. Adding the extension launch flag did not fix that. MetaMask debounces persistence without an awaited flush, making a write race plausible, but the exact persistence failure is unconfirmed. Fresh UI initialization avoids relying on that cache behavior; it does not claim to fix persistence.

Do not treat RPC swaps, CLI transfers, or plan/report fixtures as browser QA success. The earlier Qwap swap used direct RPC calls, not browser automation. No browser swap has been verified.

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

## Local model smoke

In eve's TUI (`npm run dev`, then `/login`):

> Plan a wallet QA job for a Base Sepolia dApp. I need connect + one critical transaction journey and a UI success check. What information is missing?

Or exercise the swap journey template:

> Build the swap_demo test plan for https://swap.example.invalid and summarize cases, quote, and evidence. Then build the swap_demo_fixture report.

Masumi payment rehearsal scripts (`agent-api.mjs`, `paid-flow.mjs`) remain separate from the planning/report core. See [payment-incident.md](./payment-incident.md) before creating another paid claim.

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
