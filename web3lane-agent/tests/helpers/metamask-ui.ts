import { expect, type Page } from "@playwright/test";

export async function openAccountMenu(page: Page) {
  // The unread badge overlaps the mouse target in MetaMask 13.13.1.
  await page.getByRole("button", { name: "Account options", exact: true }).focus();
  await page.keyboard.press("Enter");
}

export async function verifyWalletAddress(page: Page, expectedAddress: string) {
  await openAccountMenu(page);
  await page.getByRole("button", { name: "Account details", exact: true }).click();
  await page.getByRole("button", { name: "Addresses", exact: true }).click();
  await page.getByRole("button", { name: "Show QR code", exact: true }).first().click();
  const address = page.getByRole("dialog").getByText(/^0x[0-9a-fA-F]{40}$/);
  await expect(address).toHaveText(expectedAddress);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  return expectedAddress;
}
