import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  // CI'da hatalar GitHub annotation olarak da raporlanır (job loglarını açmadan görülebilir).
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: { trace: 'retain-on-failure' }
})
