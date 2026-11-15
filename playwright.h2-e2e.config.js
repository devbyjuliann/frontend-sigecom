import { defineConfig, devices } from "@playwright/test";

if (
  process.env.SIGECOM_H2_E2E_TARGET !== "sigecom_h2_concurrency" ||
  process.env.SIGECOM_H2_E2E_FRONTEND_PORT !== "5175" ||
  process.env.SIGECOM_API_TARGET !== "http://127.0.0.1:3202"
) {
  throw new Error(
    "Playwright H2 E2E requires the explicit isolated loopback target.",
  );
}

export default defineConfig({
  testDir: "./tests/h2-e2e",
  outputDir: process.env.SIGECOM_H2_E2E_RESULTS_DIR,
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 12_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5175",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: "node ../backend-sigecom/scripts/h2-e2e/server-entry.js",
      url: "http://127.0.0.1:3202/api/v1/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command:
        "npm run dev -- --mode h2-e2e --host 127.0.0.1 --port 5175 --strictPort",
      url: "http://127.0.0.1:5175/ingresar",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
