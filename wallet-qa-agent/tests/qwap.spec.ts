import { testWithSynpress } from "@synthetixio/synpress";
import { MetaMask, metaMaskFixtures } from "@synthetixio/synpress/playwright";
import qmsSetup from "./wallet-setup/qms.setup";

const test = testWithSynpress(metaMaskFixtures(qmsSetup));
const { expect } = test;

test("Qwap browser wallet preflight", async ({ context, page, metamaskPage, extensionId }) => {
  process.loadEnvFile(".env");
  const metamask = new MetaMask(context, metamaskPage, qmsSetup.walletPassword, extensionId);
  const expectedAddress = process.env.QMS_TEST_WALLET_ADDRESS!;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Swap" })).toBeVisible();
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByText("MetaMask", { exact: true })).toBeVisible();
  await page.getByText("MetaMask", { exact: true }).click();
  await metamask.connectToDapp([expectedAddress]);
  await expect(page.getByRole("button", { name: "Connect wallet" })).toBeHidden();
  await expect.poll(() => metamask.getAccountAddress()).toBe(expectedAddress);

  await page.getByRole("button", { name: "Open swap settings" }).click();
  await expect(page.getByText(/slippage/i).first()).toBeVisible();
});
