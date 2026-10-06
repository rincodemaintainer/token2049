import { chromium, expect, test, type Page } from "@playwright/test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { connectWallet, approveNetwork } from "./helpers/wallet-connection";
import walletSetup from "./wallet-setup/qms.setup";
import { swapQms } from "./helpers/qms-swap";

test("Funded wallet connection and displayed balance", async ({}, testInfo) => {
  // Cached profiles reopen onboarding on this runtime. Initialize through the UI on each run.
  await mkdir(".local/browser-profiles", { recursive: true, mode: 0o700 });
  const profile = await mkdtemp(path.resolve(".local/browser-profiles/qwap-"));
  const recordingDir = testInfo.outputPath("recordings");
  const extension = path.resolve(".cache-synpress/metamask-chrome-13.13.1");
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    recordVideo: { dir: recordingDir },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const evidencePages: Page[] = [];
  let tracing = false;
  try {
    context.setDefaultTimeout(20_000);
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    const metamaskPage = context.pages()[0] ?? await context.newPage();
    await metamaskPage.goto(`chrome-extension://${extensionId}/home.html`);
    await walletSetup.fn(context, metamaskPage);
    if (testInfo.project.name === "swap") {
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      tracing = true;
    }
    context.on("page", (opened) => evidencePages.push(opened));
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
    const safeVideos = new Set<string>();
    try {
      // Close safe pages first so their videos finalize even when trace shutdown fails.
      for (const [index, opened] of evidencePages.entries()) {
        await opened.close().catch(() => {});
        const file = await opened.video()?.path().catch(() => undefined);
        if (!file) continue;
        safeVideos.add(file);
        await testInfo.attach(`recording-${index + 1}`, { path: file, contentType: "video/webm" });
      }
      if (tracing) {
        const trace = testInfo.outputPath("swap-trace.zip");
        const saved = await Promise.race([
          context.tracing.stop({ path: trace }).then(() => true, () => false),
          new Promise<false>(resolve => setTimeout(() => resolve(false), 5000)),
        ]);
        if (saved) await testInfo.attach("swap-trace", { path: trace, contentType: "application/zip" });
      }
    } finally {
      await Promise.race([context.close().catch(() => {}), new Promise<void>(resolve => setTimeout(resolve, 5000))]);
      // Onboarding videos contain the recovery phrase. Remove every unallowlisted clip.
      for (const file of await readdir(recordingDir).catch(() => [])) {
        const absolute = path.join(recordingDir, file);
        if (!safeVideos.has(absolute)) await rm(absolute, { force: true });
      }
      await rm(profile, { recursive: true, force: true });
    }
  }
});
