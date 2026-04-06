import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  expect: { timeout: 10000 },
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:8742",
    headless: true,
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 10000,
  },
});
