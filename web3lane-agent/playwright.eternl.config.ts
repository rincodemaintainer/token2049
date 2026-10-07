import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./eternl-tests",
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [["list"], ["json", { outputFile: ".local/eternl-test-results/report.json" }]],
  outputDir: ".local/eternl-test-results",
  use: { trace: "off", video: "off" },
});
