---
description: Use when a buyer asks Wallet QA to generate, review, or explain Cypress assertions for a deployed dApp from an approved test plan.
---

# Cypress dApp assertions

Use this skill for Cypress requests about the buyer's dApp. The trusted host owns the approved plan and generates the spec through `generate_cypress_spec`; you do not edit repository files or run Cypress in this agent.

1. Identify the approved case IDs and expected behavior from the buyer-approved plan. Do not infer a passing result or a required assertion from the current UI alone. If the plan is not approved, finish planning and approval before requesting a spec.
2. For each assertion, choose a stable dApp selector. Prefer `data-cy`, `data-test`, `data-testid`, `data-test-id`, or `data-qa`; then stable `id` or `name` attributes. Avoid CSS classes, DOM position, and generated attributes. Ask for a stable selector when none is known.
3. Supply `expected_text` only when the approved expectation specifies that text. Otherwise request a visibility assertion. Keep each assertion within its approved case and use the stored plan version and hash when calling `generate_cypress_spec`.
4. Return the generated filename and source as a proposed spec. State that it has not been run. Never describe generated source as browser, wallet, transaction, or chain evidence.

Do not add arbitrary sleeps, cross-test dependencies, or wallet-popup interactions to a Cypress proposal. Wallet connection, signing, and transaction submission belong to the separate trusted browser runner and its signing policy. If asked for an exact Cypress API or version-specific behavior, verify it against official Cypress documentation before claiming it; if documentation access is unavailable, say that the claim is unverified.

This procedure adapts the relevant authoring practices from the [Cypress AI Toolkit](https://github.com/cypress-io/ai-toolkit/tree/main/skills/cypress-author) to Wallet QA's approved-plan tool boundary.
