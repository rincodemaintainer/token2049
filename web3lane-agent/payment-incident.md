# Preprod paid Task incident — 2026-10-06

- Coworker: `01a111a5-30d6-7004-80d9-bba2a0a1ff9c`; Masumi registration: `cmuwttitd00009y9hg1xigtqo` (`RegistrationConfirmed`).
- Task: `01a111d4-d4a2-76cc-a903-bac8ab4ba797` (`RUNNING`); Core claim transaction: `01a111d7-8abc-763e-8573-7fc093b7a330` (`PURCHASED`, Core receipt `FundsLocked`).
- Seller MPS payment: `cmuwu5jq000089y9hr29tu8r0`; Cardano lock transaction: `d3b4d78fdc8dede7c968f6ae8ee81c35d4023d52feaddc092bd190d873b6ebec` at 15:33:23 UTC, containing 1 test USDM.
- MPS timeout marked the request `FundsOrDatumInvalid` / `WaitingForManualAction` at 15:47:05 UTC, before its scanner reached the lock at 15:47:07 UTC. The scanner then skipped the row because it no longer awaited external action.
- MPS repair preview verified the lock transaction carries this payment's blockchain identifier, but returned HTTP 400: local `collateralReturnLovelace` is null and does not match the datum. No forced repair or cursor rewind was applied.
- The web3lane model result is saved at `../.private/paid-result.txt`, with SHA-256 `659eb677b0706eedae656768840f9cb45bd474567d18dd13b11a206fb8cbb740`. The signed result deadline expired before MPS submission. Task completion and seller collection were not attempted.
- Preserve the Task, payment row, DB encryption key, and private checkpoints. Reconcile buyer escrow/refund and the local request's datum fields before a new paid claim. Do not treat `PURCHASED` or `FundsLocked` as seller receipt.

## Read-only check — 2026-10-07

- The local payment row still reports `FundsOrDatumInvalid` / `WaitingForManualAction`, with no result hash or confirmed transaction history. The local Payment Service API is stopped.
- No second paid claim, refund, cursor rewind, or error-state recovery was attempted. A fresh paid run needs the old escrow and datum mismatch reconciled first.
- New quote deadlines in `payment-deadlines.mjs` allow 45 minutes to pay, 135 minutes to submit a result, 195 minutes to unlock, and 255 minutes for external dispute unlock. They have unit coverage but no live paid-run validation.
