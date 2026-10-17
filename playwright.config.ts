process.env.NEXLET_TEST_LOCALE ||= 'zh-CN';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
  outputDir: 'test-results',
});
