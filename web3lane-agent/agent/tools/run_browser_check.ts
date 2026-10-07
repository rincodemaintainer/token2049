import { defineTool } from "eve/tools";
import { z } from "zod";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

export default defineTool({
  description: "Run the local Qwap Playwright/Synpress connection checks and return actual test results and evidence paths. Imports the saved test wallet through MetaMask UI in a temporary profile, verifies its address, connects Qwap, confirms QMS Testnet configuration, and reads the displayed balance. Does not approve tokens or submit transactions. A skipped wallet check is BLOCKED, never PASS. No automatic retries.",
  inputSchema: z.object({}),
  async execute() {
    const outputDir = path.resolve(".local/browser-runs", randomUUID());
    await mkdir(outputDir, { recursive: true, mode: 0o700 });
    const reportPath = path.join(outputDir, "playwright.json");
    let exitCode = 0;
    try {
      await promisify(execFile)(process.execPath, [
        "node_modules/@playwright/test/cli.js", "test", "--reporter=json", "--output", outputDir,
      ], { timeout: 150_000, maxBuffer: 1024 * 1024,
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath } });
    } catch (error) {
      exitCode = typeof (error as { code?: unknown }).code === "number"
        ? (error as { code: number }).code : -1;
    }
    const setup = await readFile(".local/browser-setup/result.json", "utf8")
      .then(text => JSON.parse(text)).catch(() => ({ status: "unavailable" }));
    const report = await readFile(reportPath, "utf8").then(text => JSON.parse(text)).catch(() => null);
    const cases: { title: string; status: string; evidence: string[] }[] = [];
    function collect(suites: any[]) {
      for (const suite of suites) {
        for (const spec of suite.specs ?? []) {
          for (const test of spec.tests ?? []) {
            const result = test.results?.at(-1);
            cases.push({ title: spec.title, status: result?.status ?? "not-run",
              evidence: (result?.attachments ?? []).flatMap((a: { path?: string }) => a.path ? [a.path] : []) });
          }
        }
        collect(suite.suites ?? []);
      }
    }
    collect(report?.suites ?? []);
    return { target: "https://testnet.qwap.xyz", exitCode, cases, walletSetup: setup,
      outcome: !report || exitCode !== 0 || cases.length !== 2 ? "RUNNER_ERROR"
        : cases.some(c => c.status === "skipped") ? "BLOCKED"
        : cases.every(c => c.status === "passed") ? "PASS" : "RUNNER_ERROR",
      reportPath, transactionsSubmitted: 0 };
  },
});
