import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  preserveOutput: 'always',
  use: {
    baseURL: 'http://127.0.0.1:43218',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 43218',
    url: 'http://127.0.0.1:43218',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      COWART_PROJECT_DIR: path.join(os.tmpdir(), 'cowart-playwright-project')
    }
  }
})
