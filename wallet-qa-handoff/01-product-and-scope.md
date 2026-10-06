# Wallet QA agent product and scope

The buyer hires a QA agent to investigate a deployed Web3 app and execute a confirmed testing task. The service turns a short request into test cases with explicit expectations, then returns evidence the buyer can inspect and a record a human can use to review delivery disputes.

## Buyer and product promise

The initial buyer is a small Web3 team without dedicated end-to-end QA. Its request might be: "Test the complete token swap flow, including wallet approval and success notification."

The purchased deliverable is an evidence-backed test run against agreed requirements. A reproducible app defect is useful delivery. An inability to execute the agreed work is a delivery issue that can be reviewed for a refund or replacement run.

The agent needs a browser wallet with its own isolated test identity. It can connect, approve a bounded amount, sign permitted requests, and execute approved test transactions. The service wallet on Cardano is a separate identity used for Masumi settlement.

## MVP scope

- One desktop browser and one supported wallet.
- One deployed app, one test network, and one transaction journey per job.
- A bounded initial inspection followed by a structured interview.
- A reviewable test plan, fixed quote, execution limits and refund deadline.
- Real wallet connection and testnet transactions.
- Recorded browser and wallet interactions, step logs, traces and chain evidence.
- A report distinguishing defects from blockers and automation problems.
- Human review for contested refunds, integrated with Masumi's settlement lifecycle.

The proposed first target is a small EVM staging swap app on Base Sepolia with MetaMask and two test tokens. Cardano preprod pays for the QA service. The user has selected a full swap demo but has not confirmed the exact wallet, chain, app or provider.

## Testing modes

| Mode | Behavior |
| --- | --- |
| Quick check | Apply a standard wallet-onboarding checklist to a confirmed scope |
| User-defined cases | Convert supplied cases into executable assertions and required evidence |
| Explore and propose | Discover accessible features, clarify intent and propose prioritized coverage |

A budget is a constraint across every mode. Exploration produces a coverage map of tested, discovered, blocked and unexplored features; it does not establish exhaustive coverage of an arbitrary website.

## Core product decisions

The buyer approves expected behavior rather than asking the model to infer correctness entirely from the app. The plan is versioned and preserved during execution. A change in scope, assertions or spending requires an explicit revision.

The quote contains a bounded allowance for hidden clarification and recovery costs. Recovery stops after its approved limit. Cases that remain unresolved are visible in the report and eligible for human delivery review.

Every job-relevant interaction and execution action is captured in a structured session record. Browser and wallet actions also have recordings where applicable. Fault attribution distinguishes observed evidence, proposed cause and the human decision; unknown responsibility remains unknown.

## Deferred work

Agent-to-agent hiring is paused until the human main flow works. Preserve structured input and status boundaries so a later agent client can use the same backend. Do not build external agent discovery, payment delegation or multi-agent negotiations in the MVP.

Telegram is an optional later communication channel over the same job record. Interviews, progress and report delivery can happen in chat; authenticated plan approval and funding can use a web or Mini App flow.

GitHub read access, recurring runs, additional wallets, mobile wallet flows, multiple networks, partial escrow refunds, and unattended mainnet execution are later work. A URL and confirmed acceptance criteria are sufficient for the first demo.

## Definition of useful delivery

A buyer can see what was requested, what was attempted, what happened, which evidence supports each result, and what remains unresolved. Another developer can reproduce an app finding from the recorded conditions and steps. A human reviewer can assess whether promised testing and evidence were delivered.
