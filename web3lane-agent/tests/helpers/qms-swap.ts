import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { open, rename } from "node:fs/promises";
import { installQmsTransactionCapture, loadQmsRunContext, verifyQmsWalletPopup } from "./qms-transaction-capture";

async function writeSynced(file: string, contents: unknown, flags: "w" | "wx") {
  const handle = await open(file, flags, 0o600);
  try {
    await handle.writeFile(JSON.stringify(contents, null, 2));
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function replaceAtomically(file: string, contents: unknown) {
  const temporary = `${file}.next-${process.pid}`;
  await writeSynced(temporary, contents, "wx");
  await rename(temporary, file);
}

export async function swapQms(context: BrowserContext, page: Page, testInfo: TestInfo) {
  const runContext = await loadQmsRunContext();
  // Avoid the app's 2.5% default rounding below the approved minimum output.
  await page.getByRole("button", { name: "Open swap settings", exact: true }).click();
  await page.getByRole("textbox", { name: "Slippage tolerance", exact: true }).fill("0.5");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const capture = async (name: string, target: Page) => {
    const file = testInfo.outputPath(`${name}.png`);
    await target.screenshot({ path: file, fullPage: true });
    await testInfo.attach(name, { path: file, contentType: "image/png" });
    await testInfo.attach(`${name}-text`, { body: await target.locator("body").ariaSnapshot(), contentType: "text/plain" });
  };
  await page.getByRole("textbox", { name: "Sell amount", exact: true }).fill("0.01");
  await expect(page.getByRole("button", { name: "Swap", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "QMS", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "USDC", exact: true })).toBeVisible();
  await capture("swap-quote", page);
  const transactionCapture = await installQmsTransactionCapture(page, runContext);
  const beforeBalances = await page.getByText(/^Balance [\d,.]+$/).allTextContents();
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Swap", exact: true }).click();
  const popup = await popupPromise;
  await expect(page.getByText("Confirm this transaction in your wallet now.", { exact: true })).toBeVisible();
  const capturedTransaction = await transactionCapture.read();
  await verifyQmsWalletPopup(popup, runContext, capturedTransaction);
  await capture("wallet-request", popup);
  await capture("wallet-transaction", popup);
  await capture("wallet-pending", page);
  const journal = testInfo.outputPath("swap-result.json");
  const request = testInfo.outputPath("wallet-transaction-request.json");
  await writeSynced(request, capturedTransaction, "w");
  await testInfo.attach("wallet-transaction-request", { path: request, contentType: "application/json" });
  const result = { amountQms: "0.01", minimumUsdcRaw: capturedTransaction.decoded.minimumOutput, beforeBalances,
    wallet: capturedTransaction.transaction.from, status: "confirmation-requested",
    approved_job_id: runContext.job.input.approved_job_id, plan_version: runContext.job.input.plan_version,
    approved_plan_hash: runContext.job.input.approved_plan_hash, session_id: runContext.authorization.session_id,
    started_at: runContext.authorization.started_at,
    transaction_request: capturedTransaction,
    transactionHash: "", transactionUrl: "", afterBalances: [] as string[] };
  // Persist before the only signing click. Unknown confirmation is never retried.
  await replaceAtomically(journal, result);
  await popup.getByRole("button", { name: "Confirm", exact: true }).click();
  result.transactionHash = await transactionCapture.readHash();
  result.status = "submitted";
  const submitted = {
    status: "submitted",
    submittedAt: new Date().toISOString(),
    transactionHash: result.transactionHash,
    approved_job_id: result.approved_job_id,
    plan_version: result.plan_version,
    approved_plan_hash: result.approved_plan_hash,
    session_id: result.session_id,
    started_at: result.started_at,
    transaction_request: result.transaction_request,
  };
  const submittedJournal = testInfo.outputPath("submitted.json");
  await writeSynced(submittedJournal, submitted, "wx");
  await testInfo.attach("submitted", { path: submittedJournal, contentType: "application/json" });
  await expect(page.getByText("The transaction completed successfully on the network.", { exact: true }))
    .toBeVisible({ timeout: 60_000 });
  await capture("swap-success", page);
  const explorer = page.getByRole("link", { name: /View on QMS Explorer/i });
  if (await explorer.count()) {
    result.transactionUrl = await explorer.getAttribute("href") ?? "";
  }
  expect(result.transactionHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  result.afterBalances = await page.getByText(/^Balance [\d,.]+$/).allTextContents();
  result.status = "confirmed-in-qwap";
  await replaceAtomically(journal, result);
  await testInfo.attach("swap-result", { path: journal, contentType: "application/json" });
}
