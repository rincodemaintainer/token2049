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

Fresh setup and the wallet browser test passed on 2026-10-07 (19.3s for the wallet test); the public Qwap test also passed. Typecheck passed. Browser assertions cover full address, connection and network popup contents, connected account, and the extension's QMS balance display.

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

## Swap evidence export

`reports/INPUT-CONTRACT.md` defines the input JSON and finalizer data contract. From this directory, run `node scripts/build-evidence-report.mjs reports/swap-demo.input.json`. The output is `.local/evidence-report/index.html` plus `evidence.zip`, `report-data.json`, and a SHA-256 manifest. The archive contains allowlisted evidence, raw RPC proof, and relevant source files captured at export time. The new run includes the Qwap page recording, screenshots, full Playwright JSON, and runner console log. Its trace did not finalize, and the exact run-time source tree was not saved; the page labels both gaps. The earlier run is preserved under `.local/historic-swap-2026-10-07/`.

For a new swap run, Playwright records pages opened after wallet setup and starts its trace after setup. Onboarding recordings are deleted because they can show the recovery phrase. Capture console output with `set -o pipefail; npm run browser:swap 2>&1 | tee .local/swap-run.log`, then set `runnerLog` in the input JSON before export. A new run sends a new testnet transaction; reconcile it before retrying if browser feedback times out.
