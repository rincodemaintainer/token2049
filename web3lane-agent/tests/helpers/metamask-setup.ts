import { expect, type BrowserContext, type Page } from "@playwright/test";
import { openAccountMenu } from "./metamask-ui";

// Keep this outside defineWalletSetup: Synpress's callback regex cannot parse deeply nested blocks.
export async function importRecoveryPhrase(page: Page, mnemonic: string, password: string) {
  await page.getByRole("button", { name: "I have an existing wallet", exact: true }).click();
  await page.getByRole("button", { name: "Import using Secret Recovery Phrase", exact: true }).click();
  const words = mnemonic.split(" ");
  for (let index = 0; index < words.length; index++) {
    const field = page.locator("input,textarea").nth(index);
    await field.fill(words[index]!);
    if (index < words.length - 1) await field.press("Space");
  }
  await page.getByRole("heading", { name: "Import a wallet", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("textbox", { name: "Create new password", exact: true }).fill(password);
  await page.getByRole("textbox", { name: "Confirm password", exact: true }).fill(password);
  await page.getByRole("checkbox", { name: /If I lose this password/ }).check();
  await page.getByRole("button", { name: "Create password", exact: true }).click();
  if (await page.getByRole("checkbox", { name: /Gather basic usage data/ }).isChecked()) {
    await page.getByRole("button", { name: /^Gather basic usage data/ }).click();
  }
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

export async function usePopupMode(context: BrowserContext, extensionId: string) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await openAccountMenu(popup);
  const switchToPopup = popup.getByRole("button", { name: "Switch to popup", exact: true });
  if (await switchToPopup.isVisible()) {
    await switchToPopup.click();
    await openAccountMenu(popup);
  }
  await expect(popup.getByRole("button", { name: "Switch to side panel", exact: true })).toBeVisible();
  // Close the side panel created by onboarding; all dApp requests must use popups.
  const session = await context.newCDPSession(popup);
  const { targetInfos } = await session.send("Target.getTargets");
  for (const target of targetInfos) {
    if (target.type === "page" && target.url.startsWith(`chrome-extension://${extensionId}/sidepanel.html`)) {
      await session.send("Target.closeTarget", { targetId: target.targetId });
    }
  }
  await session.detach();
  await popup.close();
}

