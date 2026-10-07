import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command: "npx next start --hostname 127.0.0.1 --port 3001",
    url: "http://127.0.0.1:3001/api/health",
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
