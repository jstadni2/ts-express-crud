import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 5010);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // Only the TypeScript specs; the ported Pytest-Playwright suite (.py) is
  // run separately via `make e2e-test`.
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    headless: true,
  },
});
