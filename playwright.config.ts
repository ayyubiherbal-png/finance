import { defineConfig, devices } from '@playwright/test'

/**
 * E2E dijalankan lawan project Supabase TERPISAH untuk testing -- JANGAN pernah
 * arahkan ke project produksi (lihat e2e/README.md). Vite otomatis memuat
 * `.env.test`/`.env.test.local` saat dijalankan dengan `--mode test` (lihat
 * `webServer.command` di bawah), jadi VITE_SUPABASE_URL/ANON_KEY di sana yang
 * dipakai baik oleh dev server maupun oleh test yang bicara langsung ke Supabase
 * lewat REST (seeding/cleanup, lihat e2e/fixtures/).
 */
const PORT = 5174
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  // CI: jangan sampai `test.only` yang lolos review diam-diam mempersempit suite.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Data di Supabase (stok, saldo kas, nomor dokumen berurutan) dibagi antar test --
  // paralel penuh di CI gampang bikin race condition. Lokal boleh default (banyak worker).
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev -- --mode test',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
