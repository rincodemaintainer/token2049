# web3lane session evidence and refund review

Each delivered report has a recording and a structured account of the session. These records support a human assessment of what happened, why a case stopped, and whether the service met its agreed obligations. Responsibility remains unknown when the available evidence cannot establish it.

## Record every relevant interaction and action

Record intake messages, agent questions, user answers, approval/revision events, funding requests, preflight checks, browser actions, wallet prompts, signature decisions, transactions, model-directed recovery, retries, checkpoints, limits and final results. Store concise decisions and observable actions rather than private model reasoning.

Use a monotonically sequenced append-only event stream with UTC timestamps for correlation. Display times to the user in their timezone. Each event includes session/job IDs, plan version, case/step/attempt IDs where applicable, actor, action, sanitized inputs, observation, result, related transaction reference, usage counters and evidence references.

Capturing every relevant action does not require storing credentials or secrets. Keep provisioning and wallet unlock credentials outside recordings; log that those operations occurred with sensitive values omitted. Protect private documents and redact authentication headers before delivery. Flag recording gaps explicitly.

## Evidence bundle

| Artifact | Required value |
| --- | --- |
| Approved plan | Exact requirements, expected results, limits and buyer approval |
| Session log | Ordered events, interactions, retries and stop reasons |
| Recording | Browser journey and wallet interactions for every attempt |
| Trace and screenshots | Reproduction detail and assertions tied to steps |
| Chain evidence | Submitted hashes, receipts, network, amounts, allowances and balance changes |
| Result report | Case outcomes, actual versus expected behavior and unresolved work |
| Manifest | Artifact IDs, byte sizes, digests and links to cases/events |

Align video offsets with event times. Preserve original failure evidence when a retry succeeds. Validate capture across dApp pages and wallet windows; one page recording may omit an extension popup. [Playwright video](https://playwright.dev/docs/videos), [Trace viewer](https://playwright.dev/docs/trace-viewer)

Provide a whole-session replay that pairs conversations and approvals with synchronized browser/wallet recordings. Capture relevant chat and approval screens; retain original asynchronous messages as timestamped replay entries. Show waiting periods and recording gaps explicitly. Later review events remain linked to the original session.

Seal the execution bundle before submitting its result hash. Hash exact delivered bytes using the applicable Masumi input/output hashing rules; follow-ups must not mutate that delivered artifact. Store later review and settlement events in a continuing audit journal referencing the sealed bundle. An amended report is a new version with its own digest.

Hashes detect later changes when compared with a trusted anchor. They do not establish that capture was honest, prove unseen events, or automatically decide fault. Human reviewers may need independent receipt checks, a replay, or additional buyer/operator evidence.

## Assess the blocker

For each stopped case, include the approved precondition, observed state, last successful step, attempted recovery, evidence and remaining uncertainty. Keep `case_outcome`, `cause_category`, `attribution_status` and `delivery_complete` separate.

| Observed evidence | Proposed interpretation |
| --- | --- |
| Required funds absent despite a recorded preflight check | Investigate service validation failure and later wallet activity |
| Supplied account denied permission | Account/environment blocker; determine whether the requirement was discoverable and confirmed |
| Submitted swap succeeds but UI notification is absent | App mismatch if notification was an approved assertion |
| Locator fails although the expected element is visible | Likely runner problem; inspect trace and replay |
| RPC times out and transaction status is unresolved | External or unknown cause; stop resubmission |
| Expected behavior was never confirmed | Specification gap; do not invent an app defect |
| Three attempts without diagnostic evidence | Unresolved outcome; eligible for human delivery review |

These interpretations are hypotheses until reviewed. A blocker involving a third party is not automatically outside the operator's responsibility: the service may have promised to handle that dependency or validate it before accepting the job.

## Human review policy

The buyer selects affected cases and a reason from the report. The agent assembles the approved terms, evidence and attempts. A human operator makes the seller-side decision and records its rationale.

| Delivery condition | Proposed remedy |
| --- | --- |
| Reproducible app defect with required proof | Testing delivered; no refund solely because the app failed |
| Promised critical work not executed because of the service | Human refund or replacement-run review |
| Required evidence missing or unusable | Human refund or replacement-run review |
| Inconclusive or disputed attribution | Review agreed scope and evidence; do not automatically blame buyer or service |
| New requested work | New plan and quote |

Start with full-job refunds or replacement runs. Partial escrow refunds remain an integration decision, not an MVP promise. Show the actual review deadline and reminders. A support ticket must be paired with the necessary protocol request before that deadline; after settlement, reimbursement is a separate operator decision.

## Masumi protocol boundary

Buyer requests use `/purchase/request-refund` before `unlockTime`; accepted seller requests use `/payment/authorize-refund`. Unresolved disputes escalate to the Masumi team. The app's human reviewer cannot independently replace that escalation authority. Configure delivery, review and escalation timestamps explicitly and read live payment state. [Masumi Refunds and Disputes](https://www.masumi.network/dev/masumi/core-concepts/refunds-and-disputes)

## How to Avoid Refunds checklist

Adapted from the linked Masumi seller checklist:

- Describe supported scope accurately in the registry.
- Publish a genuine example deliverable.
- Monitor credentials, dependencies and uptime.
- Hash exact input and output bytes consistently.
- Set conservative delivery deadlines with a buffer.

The product applies these through explicit assertions, preflight checks, complete evidence and a named human reviewer. Service operations should detect missing artifacts and approaching deadlines before the buyer has to report them.
