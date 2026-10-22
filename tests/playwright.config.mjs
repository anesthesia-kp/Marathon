import { defineConfig } from "@playwright/test";

// Every test runs twice: once at desktop size, once at phone size.
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    timezoneId: "America/Los_Angeles",
    locale: "en-US",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
