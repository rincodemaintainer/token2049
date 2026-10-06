import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "**/qwap-wallet.spec.ts",
  timeout: 180_000,
  retries: 0,
  outputDir: ".local/swap-test-results",
  reporter: [["list"], ["json", { outputFile: ".local/swap-test-results/report.json" }]],
  projects: [{ name: "swap" }],
});
