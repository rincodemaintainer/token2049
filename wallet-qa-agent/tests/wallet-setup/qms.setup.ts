import { defineWalletSetup } from "@synthetixio/synpress";
import { getExtensionId, MetaMask } from "@synthetixio/synpress/playwright";

process.loadEnvFile(".env");

const password = process.env.QMS_TEST_WALLET_PASSWORD;
const privateKey = process.env.QMS_TEST_WALLET_PRIVATE_KEY;
const expectedAddress = process.env.QMS_TEST_WALLET_ADDRESS;
if (!password || !privateKey || !expectedAddress) {
  throw new Error("QMS test wallet configuration is incomplete");
}

// This public seed only initializes MetaMask. The funded test account is imported afterward.
const emptyWalletSeed = "test test test test test test test test test test test junk";

export default defineWalletSetup(password, async (context, walletPage) => {
  const extensionId = await getExtensionId(context, "MetaMask");
  const metamask = new MetaMask(context, walletPage, password, extensionId);
  await metamask.importWallet(emptyWalletSeed);
  await walletPage.getByRole("button", { name: "Open wallet" }).click();
  await walletPage.goto(`chrome-extension://${extensionId}/home.html`);
  await walletPage.getByPlaceholder("Enter your password").fill(password);
  await walletPage.getByRole("button", { name: "Unlock" }).click();
  await walletPage.waitForTimeout(15000);
  await walletPage.screenshot({ path: ".local/metamask-after-unlock-wait.png" });
  throw new Error("MetaMask post-unlock screenshot saved");
  await metamask.importWalletFromPrivateKey(privateKey);
  await metamask.addNetwork({
    name: "QMS Testnet",
    chainId: 19480,
    rpcUrl: "https://rpc.testnet.qms.finance",
    symbol: "QMS",
    blockExplorerUrl: "https://testnet.qmsscan.io",
  });
  const actualAddress = await metamask.getAccountAddress();
  if (actualAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error("MetaMask selected account does not match the funded QMS test wallet");
  }
});
