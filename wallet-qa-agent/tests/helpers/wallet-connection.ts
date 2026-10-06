import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

// App-specific controls stay in the caller; this helper handles the wallet popup.
export async function connectWallet(
  context: BrowserContext, extensionId: string, domain: string,
  requestConnection: () => Promise<void>, testInfo: TestInfo,
) {
  const popupPromise = context.waitForEvent("page", {
    predicate: popup => popup.url().startsWith(`chrome-extension://${extensionId}/notification.html`),
  });
  await requestConnection();
  const popup = await popupPromise;
  await expect(popup.getByRole("heading", { name: domain, exact: true })).toBeVisible();
  await testInfo.attach("connection-popup", { body: await popup.screenshot(), contentType: "image/png" });
  await popup.getByRole("button", { name: "Connect", exact: true }).click();
  return popup;
}

export async function approveNetwork(popup: Page, network: { name: string; rpcHost: string }) {
  await expect(popup.getByRole("heading", { name: `Add ${network.name}`, exact: true })).toBeVisible();
  await expect(popup.getByText(network.rpcHost, { exact: true })).toBeVisible();
  await popup.getByRole("button", { name: "Confirm", exact: true }).click();
}
