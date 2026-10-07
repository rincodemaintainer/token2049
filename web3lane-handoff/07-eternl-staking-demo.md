# Eternl Preprod staking demo

This is a second wallet journey. The Qwap swap remains the first demo. This case has not been run; a plan or screenshot is not evidence of a completed delegation.

## Meaning of 4 tADA

Eternl delegates an account's stake to a pool. It does not ask for a staking amount, and delegation does not transfer or lock the ADA. Use a dedicated Cardano Preprod account whose available balance is **4 tADA after** the delegation transaction. A newly registered stake key also needs the refundable 2 tADA deposit and a transaction fee; check the actual preview before signing. An already registered account needs the fee. An account holding more than 4 tADA would delegate more than requested and is unsuitable for this exact-amount case.

“Connect” means opening the selected wallet/account in the Eternl web app on Preprod. No third-party dApp is in scope. If a dApp connection is intended, its URL and expected CIP-30 permissions must be added to the approved plan.

## Preconditions

- Use `https://eternl.io/` on **Pre-Production testnet** with one isolated account. Record the wallet version, account address or stake credential, network, and initial balance. Never record its recovery phrase, PIN, or spending password.
- Confirm the account has enough tADA for a 4 tADA post-transaction balance, any required stake-key deposit, and the displayed network fee. Stop if the balance, network, or existing delegation differs from the approved fixture.
- Choose one active Preprod stake pool and record its pool ID in the approved plan before signing. Do not silently switch pools if it becomes unavailable.
- Permit at most one delegation transaction. Keep the service fee and test-wallet funds separate.

## Case: ETERNL-STAKE-01

| Step | Action | Required assertion and evidence |
| --- | --- | --- |
| 1 | Open Eternl and select the test account | Eternl origin, selected account, and Pre-Production testnet visible; screenshot or recording after wallet unlock. |
| 2 | Open Staking and select the approved pool | Pool ID matches the plan; screenshot of the pool and delegation control. |
| 3 | Review the delegation transaction | Preview shows stake registration if needed, the approved pool, deposit, fee, and no unrelated outputs; capture a redacted preview. Stop on mismatch. |
| 4 | Sign and submit once in Eternl | Capture the wallet confirmation, transaction hash, and submission state. If status is unknown, reconcile before any retry. |
| 5 | Reconcile chain and wallet | Confirm the transaction includes the intended delegation certificate, the pool ID and stake credential match, and Eternl shows the delegation after synchronization. Record the final available balance and explain deposit/fee separately. |

**PASS** needs both the Eternl result and independent chain evidence. A successful transaction with stale or missing wallet UI is a separate UI finding; a pending transaction is INCONCLUSIVE. An unfunded wallet, absent pool, or unavailable wallet session is BLOCKED. Do not infer staking rewards during this run; reward eligibility begins after later epoch snapshots.

## Live-run status

No funded Eternl Preprod wallet, approved pool ID, or captured delegation evidence is available in this repository. Browser signing stays disabled until the trusted full-request authorization adapter checks the actual transaction. The live case remains BLOCKED until those prerequisites are supplied and verified.

## Eternl references

- [How staking works and the in-wallet delegation path](https://wiki.eternl.io/cardano-basics/how-staking-works)
- [Stake-key deposit and reward timing](https://wiki.eternl.io/faq-and-troubleshooting/troubleshooting/staking-and-rewards)
- [Account selection for dApp connections](https://wiki.eternl.io/using-eternl/dapp-connection-options)
