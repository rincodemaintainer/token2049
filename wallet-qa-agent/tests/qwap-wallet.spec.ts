import { chromium, expect, test, type Page } from "@playwright/test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { connectWallet, approveNetwork } from "./helpers/wallet-connection";
import walletSetup from "./wallet-setup/qms.setup";
import { swapQms } from "./helpers/qms-swap";

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
    await connectWallet(context, extensionId, "testnet.qwap.xyz",
      () => page.getByText("MetaMask", { exact: true }).click(), testInfo);
    let networkPopup: Page | undefined;
    await expect.poll(async () => {
      for (const candidate of context.pages()) {
        if (!candidate.url().startsWith(`chrome-extension://${extensionId}/notification.html`)) continue;
        if (await candidate.getByRole("heading", { name: "Add QMS Testnet", exact: true }).isVisible().catch(() => false)) {
          networkPopup = candidate;
          return true;
        }
      }
      return false;
    }).toBe(true);
    await approveNetwork(networkPopup!, { name: "QMS Testnet", rpcHost: "rpc.testnet.qms.finance" });
    await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeHidden();
    await expect(page.getByText(new RegExp(`${expectedAddress.slice(0, 6)}.*${expectedAddress.slice(-4)}`, "i")).first()).toBeVisible();
    await expect(metamaskPage.getByRole("button", { name: "QMS Testnet", exact: true })).toBeVisible();
    await expect(metamaskPage.getByText(/^[\d,.]+ QMS$/)).toBeVisible();
    const walletText = await metamaskPage.locator("body").innerText();
    await testInfo.attach("wallet-balance", { body: await metamaskPage.screenshot(), contentType: "image/png" });
    await testInfo.attach("wallet-text", { body: walletText, contentType: "text/plain" });
    await testInfo.attach("connected-app", { body: await page.screenshot(), contentType: "image/png" });
    if (testInfo.project.name === "swap") await swapQms(context, page, testInfo);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
