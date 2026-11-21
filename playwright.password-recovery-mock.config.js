import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/password-recovery-mock",
  outputDir: "./test-results/password-recovery-mock",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:39114",
    trace: "off",
    screenshot: "off",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command:
      "npm run dev -- --mode password-recovery-mock --host 127.0.0.1 --port 39114 --strictPort",
    url: "http://127.0.0.1:39114",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
