import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";

export async function swapQms(context: BrowserContext, page: Page, testInfo: TestInfo) {
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
  const beforeBalances = await page.getByText(/^Balance [\d,.]+$/).allTextContents();
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Swap", exact: true }).click();
  const popup = await popupPromise;
  await expect(page.getByText("Confirm this transaction in your wallet now.", { exact: true })).toBeVisible();
  await expect(popup.getByRole("heading", { name: "Transaction request", exact: true })).toBeVisible();
  await capture("wallet-request", popup);
  await expect(popup.getByText("testnet.qwap.xyz", { exact: true })).toBeVisible();
  await expect(popup.getByText("QMS Testnet", { exact: true })).toBeVisible();
  await expect(popup.locator("body")).toContainText(/Amount\s*0\.01\s*QMS/);
  await popup.getByRole("button", { name: "Advanced tx details", exact: true }).click();
  await expect(popup.getByText("swapExactETHForTokens", { exact: true })).toBeVisible();
  for (const [short, full] of [
    ["0x93AFF...12619", "0x93AFF45f28e5DF1b55f5AEFEfB807De843b12619"],
    ["0x9AA51...12c34", "0x9AA510295aC664A3d5A3182a3eFe959DE2B12c34"],
    ["0xDfF68...42a04", "0xDfF68E53a0A8275212927c12017f5aB5f1842a04"],
  ]) {
    await popup.getByText(short!, { exact: true }).click();
    await expect(popup.getByRole("textbox", { name: "Address", exact: true })).toHaveValue(full!);
    await popup.getByRole("button", { name: "Close", exact: true }).click();
  }
  const details = await popup.locator("body").innerText();
  const minimumOut = details.match(/Param #1\s+(\d+)/)?.[1];
  expect(minimumOut, "Positive USDC minimum output in wallet calldata").toBeDefined();
  expect(BigInt(minimumOut!)).toBeGreaterThan(0n);
  await capture("wallet-transaction", popup);
  await capture("wallet-pending", page);
  const journal = testInfo.outputPath("swap-result.json");
  const result = { amountQms: "0.01", minimumUsdcRaw: minimumOut, beforeBalances,
    wallet: process.env.QMS_TEST_WALLET_ADDRESS, status: "confirmation-requested",
    transactionUrl: "", afterBalances: [] as string[] };
  // Persist before the only signing click. Unknown confirmation is never retried.
  await writeFile(journal, JSON.stringify(result, null, 2), { mode: 0o600 });
  await popup.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("The transaction completed successfully on the network.", { exact: true }))
    .toBeVisible({ timeout: 60_000 });
  await capture("swap-success", page);
  const explorer = page.getByRole("link", { name: /View on QMS Explorer/i });
  if (await explorer.count()) {
    result.transactionUrl = await explorer.getAttribute("href") ?? "";
  } else {
    const explorerPromise = context.waitForEvent("page");
    await page.getByRole("button", { name: /View on QMS Explorer/i }).click();
    const explorerPage = await explorerPromise;
    await explorerPage.waitForURL(/testnet\.qmsscan\.io\/tx\/0x[0-9a-fA-F]{64}/);
    result.transactionUrl = explorerPage.url();
  }
  expect(result.transactionUrl).toMatch(/^https:\/\/testnet\.qmsscan\.io\/tx\/0x[0-9a-fA-F]{64}$/);
  result.afterBalances = await page.getByText(/^Balance [\d,.]+$/).allTextContents();
  result.status = "confirmed-in-qwap";
  await writeFile(journal, JSON.stringify(result, null, 2), { mode: 0o600 });
  await testInfo.attach("swap-result", { path: journal, contentType: "application/json" });
}
