import { defineConfig, devices } from "@playwright/test";

// Runs against the local dev stack (FastAPI on :8787 + Vite on :5173). Uses the installed
// Chrome so no browser download is needed; set PW_CHANNEL=msedge to use Edge instead.
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    channel: process.env.PW_CHANNEL ?? "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL ?? "chrome" } },
    { name: "phone", use: { ...devices["Pixel 7"], channel: process.env.PW_CHANNEL ?? "chrome" }, testMatch: /mobile\.spec/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: "http://localhost:5173", reuseExistingServer: true, timeout: 120_000 },
});
