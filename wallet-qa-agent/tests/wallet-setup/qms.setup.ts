import { defineWalletSetup } from "@synthetixio/synpress";
import { getExtensionId } from "@synthetixio/synpress/playwright";
import { expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { testWallet } from "../helpers/wallet-bootstrap";
import { importRecoveryPhrase, usePopupMode } from "../helpers/metamask-setup";
import { verifyWalletAddress } from "../helpers/metamask-ui";

const { password, mnemonic, expectedAddress } = testWallet;

export default defineWalletSetup(password, async (context, walletPage) => {
  context.setDefaultTimeout(20_000);
  mkdirSync(".local/browser-setup", { recursive: true, mode: 0o700 });
  const extensionId = await getExtensionId(context, "MetaMask");
  let stage = "initialize-wallet";
  try {
    console.log(`Browser setup: ${stage}`);
    await importRecoveryPhrase(walletPage, mnemonic, password);
    stage = "open-wallet";
    console.log(`Browser setup: ${stage}`);
    await walletPage.getByRole("button", { name: "Open wallet", exact: true }).click();
    // The button disables after side-panel onboarding succeeds; the tab does not navigate.
    await expect(walletPage.getByRole("button", { name: "Open wallet", exact: true })).toBeDisabled();
    await walletPage.reload();
    await walletPage.getByRole("button", { name: "Account options", exact: true }).waitFor();
    stage = "enable-popup-mode";
    await usePopupMode(context, extensionId);
    stage = "verify-funded-account";
    const address = await verifyWalletAddress(walletPage, expectedAddress);
    await walletPage.screenshot({ path: ".local/browser-setup/wallet.png", fullPage: true });
    writeFileSync(".local/browser-setup/result.json", JSON.stringify({
      status: "ready", address, popupMode: true, timestamp: new Date().toISOString(),
    }, null, 2), { mode: 0o600 });
  } catch (error) {
    await walletPage.screenshot({ path: ".local/browser-setup/failure.png", fullPage: true,
      mask: [walletPage.locator("input, textarea")] }).catch(() => {});
    const message = String(error).split("\n")[0].replaceAll(mnemonic, "[redacted]").replaceAll(password, "[redacted]");
    writeFileSync(".local/browser-setup/result.json", JSON.stringify({
      status: "RUNNER_ERROR", stage, message, url: walletPage.url(),
      timestamp: new Date().toISOString(),
    }, null, 2), { mode: 0o600 });
    await context.close();
    throw new Error(`${stage}: ${message}`);
  }
});
