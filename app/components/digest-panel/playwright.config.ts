import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8742",
    headless: true,
    viewport: { width: 1280, height: 900 },
    actionTimeout: 10_000,
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 8742",
    cwd: "../../..",
    url: "http://127.0.0.1:8742/e2e/fixtures/digest-panel.html",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
