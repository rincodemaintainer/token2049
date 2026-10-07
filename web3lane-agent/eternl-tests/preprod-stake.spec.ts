import { expect, test } from "@playwright/test";

test("Eternl Preprod staking prerequisites", async ({ page }, testInfo) => {
  await page.goto("https://eternl.io/");
  await page.getByRole("button", { name: "Start setup" }).click();
  await page.getByRole("button", { name: /Cardano mainnet/ }).last().click();
  await page.getByRole("button", { name: /Pre-Production testnet/ }).click();
  await page.locator("#modelSetupSettingsBtnNext").click();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.locator("#modelSetupSettingsBtnNext").click();

  await expect(page).toHaveURL(/\/preprod\/wallet\/home/);
  await expect(page.getByText("Please review and accept our Terms of Service and Privacy Policy to continue using the wallet.")).toBeVisible();
  await expect(page.getByText("Select wallet type")).toBeVisible();
  await expect(page.getByText("100%", { exact: true })).toBeHidden({ timeout: 20_000 });
  const screenshot = testInfo.outputPath("eternl-preprod-blocked.png");
  await page.screenshot({ path: screenshot });
  await testInfo.attach("eternl-preprod-blocked", { path: screenshot, contentType: "image/png" });

  test.skip(true, "BLOCKED: fresh Chromium has no accepted Eternl terms or funded Preprod wallet; no delegation was submitted");
});
