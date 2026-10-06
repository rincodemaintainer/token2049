# Wallet QA agent developer handoff

[15-slide pitch deck](pitch-deck.html) — each slide opens as its own page, with Previous/Next links. Print each page to PDF in landscape with background graphics enabled, then combine them. The deck distinguishes planned work from verified prototype work.

Prepared on 6 October 2026, Asia Singapore. This is a product and engineering brief for a developer team taking over the selected TOKEN2049 Origins idea. It contains planning documents and illustrative records, with no application implementation or completed test runs.

Build a paid Web3 QA agent that agrees on expected behavior with a buyer, uses a real isolated browser wallet, executes an approved test plan, and delivers recordings plus a structured account of the session. Cardano and Masumi handle service payment; the tested app can use a different chain.

## Read in this order

| Document | Purpose |
| --- | --- |
| [01 Product and scope](01-product-and-scope.md) | Product promise, MVP boundaries, agreed decisions and proposed defaults |
| [02 User journey and test specification](02-user-journey-and-test-specification.md) | Concise interview, requirements, test cases and report states |
| [03 Execution and budgets](03-execution-and-budgets.md) | Pricing, contingency, wallet controls, retries and checkpoints |
| [04 Session evidence and refund review](04-session-evidence-and-refund-review.md) | Session logging, fault attribution, human review and Masumi checklist |
| [05 Architecture and implementation sequence](05-architecture-and-implementation-sequence.md) | Components, integration boundaries and dependencies |
| [06 Swap demo and acceptance](06-swap-demo-and-acceptance.md) | Manageable full swap demo and delivery checks |

The [examples directory](examples/) contains an approved-plan example, a structured session log, and a report example. All are synthetic illustrations of a missing notification after a successful testnet swap. IDs and artifact paths refer to fictional records; hashes and real addresses are deliberately unset.

[Wallet QA Handoff.pdf](Wallet%20QA%20Handoff.pdf) combines the documents for easy reading. The Markdown files remain the editable source; the JSON examples are supplied separately.

## Decision status

**Agreed:** structured interviews and test cases; task-relevant clarification; real wallet interaction; separate testing funds; approved plan and price before execution; escrow before execution; buffered costs; bounded recovery; recordings and step logs; human refund review; a complete swap demo. Agent-to-agent mode is paused until the main flow works. Telegram is optional and lower priority.

**Proposed defaults:** MetaMask on Base Sepolia for testing, Cardano preprod for payment, approximately 25 percent contingency, three attempts total per eligible case, two included clarification rounds, and full-job refund or replacement run for the MVP. Validate these defaults before implementing production behavior.

**Must resolve early:** exact demo app and pool, runner and extension compatibility, evidence capture across wallet windows, Masumi hosting and payment asset, deadline configuration, and the responsible human reviewer.

## Hackathon constraints

The supplied TOKEN2049 Origins Hackathon Singapore PDF specifies a 36-hour build, meaningful partner integration, and projects built during the event. Existing public tools and libraries are permitted. Execution and technical integration together account for 55 percent of main-track scoring.

Submit a repository, hosted demo, and a Google Drive link to a PPT or Keynote file. Final-stage demos must use recordings embedded in the slides; external video links and live demos are not accepted. The supplied deadline is 11:59 pm on 7 October 2026; confirm the organizer's timezone before submission. Display the project clock in Asia Singapore for this event.

The relevant partner track is Cardano Agentic Commerce. Testing an EVM app does not by itself qualify for the Solana track. Additional partner-track conditions should be checked with organizers.
