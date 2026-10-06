import { test, expect } from "@playwright/test";

test("Qwap public swap form", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Swap", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "QMS", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "USDC", exact: true })).toBeVisible();
  await page.getByPlaceholder("0.00").first().fill("0.2");
  await expect(page.getByPlaceholder("0.00").first()).toHaveValue("0.2");
  await testInfo.attach("public-form", { body: await page.screenshot(), contentType: "image/png" });
});
