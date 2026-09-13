import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser", timeout: 45000, fullyParallel: false,
  use: { baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000", channel: "chrome", trace: "retain-on-failure" },
  projects: [{ name: "android-layout", use: { ...devices["Pixel 7"], defaultBrowserType: "chromium" } }, { name: "iphone-layout", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }],
  reporter: "list"
});
