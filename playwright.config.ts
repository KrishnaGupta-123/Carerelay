import { defineConfig, devices } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
process.env.CARERELAY_TEST_DB ||= `.data/e2e-${randomUUID()}`;
process.env.DEMO_PASSWORD ||= `E2E-${randomBytes(12).toString("base64url")}!`;
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: {
    command: "npm run dev -- --port 3001",
    url: "http://127.0.0.1:3001/login",
    reuseExistingServer: false,
    env: {
      CARERELAY_TEST_DB: process.env.CARERELAY_TEST_DB,
      LOCAL_DEVELOPMENT_MODE: "true",
      NEXT_BUILD_DIR: ".next-e2e",
      RESEND_API_KEY: "",
      CRON_SECRET: "isolated-e2e-worker-secret-at-least-32-chars",
    },
    timeout: 120000,
  },
});
