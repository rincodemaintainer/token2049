import { chromium, expect, test } from "@playwright/test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import walletSetup from "./wallet-setup/qms.setup";

test("Funded wallet connection and displayed balance", async ({}, testInfo) => {
  // Cached profiles reopen onboarding on this runtime. Initialize through the UI on each run.
  await mkdir(".local/browser-profiles", { recursive: true, mode: 0o700 });
  const profile = await mkdtemp(path.resolve(".local/browser-profiles/qwap-"));
  const extension = path.resolve(".cache-synpress/metamask-chrome-13.13.1");
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    context.setDefaultTimeout(20_000);
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    const metamaskPage = context.pages()[0] ?? await context.newPage();
    await metamaskPage.goto(`chrome-extension://${extensionId}/home.html`);
    await walletSetup.fn(context, metamaskPage);
    const expectedAddress = process.env.QMS_TEST_WALLET_ADDRESS!;
    const page = await context.newPage();
    await page.goto("https://testnet.qwap.xyz/");
    await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
    const popupPromise = context.waitForEvent("page", {
      predicate: popup => popup.url().startsWith(`chrome-extension://${extensionId}/notification.html`),
    });
    await page.getByText("MetaMask", { exact: true }).click();
    const popup = await popupPromise;
    await expect(popup.getByRole("heading", { name: "testnet.qwap.xyz", exact: true })).toBeVisible();
    await testInfo.attach("connection-popup", { body: await popup.screenshot(), contentType: "image/png" });
    await popup.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(popup.getByRole("heading", { name: "Add QMS Testnet", exact: true })).toBeVisible();
    await expect(popup.getByText("rpc.testnet.qms.finance", { exact: true })).toBeVisible();
    await popup.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeHidden();
    await expect(page.getByText(new RegExp(`${expectedAddress.slice(0, 6)}.*${expectedAddress.slice(-4)}`, "i")).first()).toBeVisible();
    await expect(metamaskPage.getByRole("button", { name: "QMS Testnet", exact: true })).toBeVisible();
    await expect(metamaskPage.getByText(/^[\d,.]+ QMS$/)).toBeVisible();
    const walletText = await metamaskPage.locator("body").innerText();
    await testInfo.attach("wallet-balance", { body: await metamaskPage.screenshot(), contentType: "image/png" });
    await testInfo.attach("wallet-text", { body: walletText, contentType: "text/plain" });
    await testInfo.attach("connected-app", { body: await page.screenshot(), contentType: "image/png" });
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
