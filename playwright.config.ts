import { defineConfig, devices } from "@playwright/test";
import path from "path";
import dotenv from "dotenv";

// Load .env.local for Supabase env vars (needed for auth setup)
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

const authFile = path.join(__dirname, "e2e", ".auth", "user.json");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,  // Limit workers to avoid overloading dev server
  reporter: "html",
  timeout: 45_000,

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    locale: "tr-TR",
  },

  projects: [
    // Setup project — runs auth first
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    // Main tests — depend on auth setup
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
