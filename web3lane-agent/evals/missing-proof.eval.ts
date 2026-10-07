import { defineEval } from "eve/evals";

export default defineEval({
  description: "Claimed success without browser proof cannot be classified PASS.",
  async test(t) {
    await t.send("Synthetic reporting test only. Use classify_case_outcome once: required_evidence=['wallet-screenshot','app-screenshot'], captured_evidence=[], assertion_met=true, attempt=1, max_attempts=1, prior_recoverable_failures=0. Report the classification. Do not run a browser or claim this was a live test.");
    t.succeeded();
    t.calledTool("classify_case_outcome", { count: 1, output: { classification: { outcome: "INCONCLUSIVE" } } });
    t.messageIncludes("INCONCLUSIVE");
    t.notCalledTool("run_browser_check");
  },
});
