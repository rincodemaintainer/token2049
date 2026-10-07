# web3lane user journey and test specification

The workflow follows a compact testing lifecycle: user goal, confirmed requirements, test design, approved execution, evidence, findings and optional retest. The interview asks only for information that changes the task's assertions, prerequisites or permitted actions.

## Main user journey

1. The buyer supplies the URL, testing goal, budget ceiling and whether transactions are permitted.
2. The agent inspects a bounded set of pages and identifies visible flows, likely wallet/network requirements and missing context.
3. The UI presents the agent's understanding with source labels and a short batch of essential questions.
4. The buyer corrects assumptions, confirms intended behavior and supplies prerequisites. Funding requests specify the address, network, asset and amount.
5. The agent proposes prioritized cases, expected outcomes, required proof, fixed price, deadlines and execution limits.
6. The buyer approves the exact plan version and quote. Funds lock in Masumi escrow before paid execution.
7. The runner executes the plan. Unexpected prerequisites produce a checkpoint; independent cases may continue within the approved scope.
8. The buyer receives the report and evidence, then accepts delivery or requests human review within the settlement deadline.

UI completion and settlement completion are separate. A report can be ready while a refund request or payment collection is still pending.

## Context and essential questions

| Context source | Use |
| --- | --- |
| Deployed URL | Visible behavior, navigation, console and network observations |
| Product requirements or walkthrough | Intended behavior and meaningful assertions |
| Optional repository read access | Relevant routes, existing tests, contract configuration and deployment mapping |
| Test fixtures | Allowlisted accounts, required balances, seeded data and repeatable conditions |

Store the provenance of each context field as user-confirmed, documented, observed or assumed. Code and current UI behavior are inputs; either can contain the bug being tested.

Question fields: `id`, `field`, `why_needed`, `options`, `required`, `affected_case_ids`, `answer`, `source`. Ask before execution when missing input changes correctness or spending. Bundle a few essential questions and use discovered values as editable defaults. Optional preferences can use disclosed defaults.

For a swap, confirm the network and wallet; input/output token identities and decimals; allowed router/spender; input amount and minimum output or slippage policy; expected notification behavior and timeout; required account/data/funding; and the target deployment.

## Shared job specification

Store environment and limits once per plan: URL, build identifier, chain ID, wallet, contracts, asset metadata, fixture references, budgets, recording requirements and deadlines. Test cases reference those fields by ID.

The approved plan includes its version, approval identity/time, exact input snapshot, case list, scope exclusions and quote. Freeze the snapshot once funded. Relevant environment or expectation changes invalidate affected cases and require a recorded revision; a funded job does not silently become a larger job.

## Test case specification

| Field | Required content |
| --- | --- |
| Case ID and requirement ID | Stable traceability between intent and test |
| Priority | Critical, high or normal |
| Preconditions and dependencies | Wallet/data state and cases that must succeed first |
| Steps | Ordered observable actions |
| Expected results | Specific assertions, including thresholds and timeouts |
| Evidence | Recording segments, screenshots, trace entries and chain checks |
| Recovery limits | Maximum attempts and case time budget |

Example: `SWAP-01` covers the approved swap requirement. Given a funded wallet with zero allowance, connect, approve the exact input amount, and submit one swap. Verify the selected account, successful approval receipt and allowance, successful swap receipt, and output amount at least the approved minimum. A linked `NOTIFY-01` case checks the expected UI notification without sending another swap. Gas is accounted separately from ERC20 balance changes.

Use Given/When/Then reasoning, explicit prerequisites, positive and negative cases, risk-based priority, and requirement-to-evidence links. Keep a transaction journey dependent where necessary; isolate negative cases with separate fixtures so they do not corrupt the main run.

## Result states

| State | Meaning |
| --- | --- |
| PASS | Approved assertions met with required evidence |
| FLAKY | Passed only after a recoverable failure; earlier evidence retained |
| FAIL | Evidence shows an app mismatch against a confirmed expectation |
| BLOCKED | A prerequisite prevents the case from running |
| INCONCLUSIVE | Attempts exhausted without enough evidence to determine the outcome |
| RUNNER_ERROR | Service automation failed to execute reliably |
| NOT_RUN | Case omitted because of a dependency, limit or explicit stop |

Do not label a case PASS when its required proof is missing. Separate case outcome from the proposed cause and from service delivery completeness. A report containing a defect can be fully delivered; a report containing several unfinished critical cases can be incomplete.

## Token economy

- Reuse short templates for wallet connection, approval, rejection and confirmation.
- Persist structured answers and send changed fields rather than whole chat histories.
- Fetch relevant repository files and DOM regions rather than repeatedly scanning everything.
- Generate the test script after approval; use deterministic runner assertions for execution.
- Request model diagnosis only for new evidence or recovery decisions.
- Store large logs and recordings as artifacts; pass excerpts and references to the model.

A later machine client can receive the same questions as an input schema. Masumi's service interface supports structured input and an awaiting-input state; public agent hiring remains deferred. [MIP-003](https://www.masumi.network/dev/masumi/mips/_mip-003)
