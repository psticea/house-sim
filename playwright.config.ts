import { defineConfig, devices } from '@playwright/test';

// Headless Chromium renders WebGL 2 with SwiftShader (software) — slow but deterministic.
const gpuArgs = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${PORT}/house-sim/`,
    // Tracing (screencast + snapshots) slows SwiftShader rendering ~50×; opt in with TRACE=1.
    trace: process.env.TRACE ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
    launchOptions: { args: gpuArgs },
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/house-sim/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      // Quick functional pass (`npm run e2e`): small viewport, no screenshots.
      name: 'desktop',
      testMatch: /(walk|perf|style)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 640, height: 360 },
        deviceScaleFactor: 1,
      },
    },
    // The projects below only run in the final pass (`npm run e2e:full`).
    {
      // Review screenshots of both styles at a real desktop size.
      name: 'desktop-hd',
      testMatch: /style\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'pixel-7',
      testMatch: /(mobile|perf)\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'iphone-13',
      testMatch: /(mobile|style)\.spec\.ts/,
      // Device metrics/touch of an iPhone 13, rendered by Chromium (WebKit has no
      // software WebGL 2 in CI).
      use: { ...devices['iPhone 13'], browserName: 'chromium', defaultBrowserType: 'chromium' },
    },
  ],
});
