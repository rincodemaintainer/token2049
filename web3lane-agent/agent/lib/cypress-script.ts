import { hashPlan } from "./plan.ts";
import type { ApprovedPlan } from "./types.ts";

export type CypressAssertion = {
  case_id: string;
  selector: string;
  expected_text?: string;
};

export function assertExactApprovedPlan(
  plan: ApprovedPlan,
  approved_plan_hash: string,
  plan_version: number,
): void {
  if (!plan.approval?.approved_plan_hash) {
    throw new Error("Cypress generation requires an approved plan artifact");
  }
  if (plan.plan_version !== plan_version) {
    throw new Error("Cypress generation plan version does not match the approved artifact");
  }
  const computedHash = hashPlan(plan);
  if (
    plan.approval.approved_plan_hash !== computedHash ||
    approved_plan_hash !== computedHash
  ) {
    throw new Error("Cypress generation plan hash does not match the approved artifact");
  }
}

/**
 * Generates dApp-only Cypress assertions. Wallet popups, signatures, and swaps
 * remain in the approved wallet runner, which provides the chain evidence.
 */
export function generateCypressSpec(input: {
  plan: ApprovedPlan;
  approved_plan_hash: string;
  plan_version: number;
  assertions: CypressAssertion[];
}): { filename: string; source: string } {
  assertExactApprovedPlan(
    input.plan,
    input.approved_plan_hash,
    input.plan_version,
  );
  const cases = new Map(input.plan.cases.map((testCase) => [testCase.id, testCase]));
  if (!input.assertions.length) {
    throw new Error("At least one stable dApp selector is required for Cypress generation");
  }
  for (const assertion of input.assertions) {
    if (!cases.has(assertion.case_id)) {
      throw new Error(`Cypress assertion references unknown case ${assertion.case_id}`);
    }
  }

  const timeoutMs = input.plan.limits.case_timeout_seconds * 1000;
  const source = [
    `// Generated only from approved plan ${input.plan.plan_version} (${input.approved_plan_hash}).`,
    "// Wallet popups and signing are intentionally out of scope for Cypress.",
    `describe(${literal(`web3lane dApp assertions: ${input.plan.job_id}`)}, () => {`,
    "  beforeEach(() => {",
    `    cy.visit(${literal(input.plan.target.url)});`,
    "  });",
    ...input.assertions.map((assertion) => {
      const testCase = cases.get(assertion.case_id)!;
      const expected = assertion.expected_text
        ? `.should("contain.text", ${literal(assertion.expected_text)})`
        : ".should(\"be.visible\")";
      return [
        `  it(${literal(`${testCase.id}: ${testCase.steps.map((step) => step.expected).join("; ")}`)}, () => {`,
        `    cy.get(${literal(assertion.selector)}, { timeout: ${timeoutMs} })${expected};`,
        "  });",
      ].join("\n");
    }),
    "});",
    "",
  ].join("\n");
  return {
    filename: `web3lane-${safeFilePart(input.plan.job_id)}-v${input.plan.plan_version}.cy.ts`,
    source,
  };
}

function literal(value: string): string {
  return JSON.stringify(value);
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
