import { defineConfig, devices } from '@playwright/test'

/**
 * E2E dijalankan lawan project Supabase TERPISAH untuk testing -- JANGAN pernah
 * arahkan ke project produksi (lihat e2e/README.md). Vite otomatis memuat
 * `.env.test`/`.env.test.local` untuk DEV SERVER-nya sendiri saat dijalankan
 * dengan `--mode test` (lihat `webServer.command` di bawah) -- TAPI proses
 * Playwright/Node yang menjalankan config & test file ini (termasuk
 * e2e/auth.setup.ts, e2e/fixtures/db.ts) TIDAK ikut kebagian env itu secara
 * otomatis, jadi dimuat manual di sini lewat API bawaan Node (tanpa dependency
 * tambahan). Di CI, `.env.test` tidak ada -- env sudah diisi langsung lewat
 * GitHub Actions secrets, jadi pemuatan ini di-skip kalau file tidak ada.
 */
try {
  process.loadEnvFile('.env.test')
} catch {
  // Tidak ada .env.test (mis. di CI, env sudah diisi lewat secrets) -- aman diabaikan.
}

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
    // Login sekali per peran, simpan storageState -- lihat e2e/auth.owner.setup.ts /
    // e2e/auth.sales.setup.ts. SENGAJA 2 project setup terpisah (bukan 1 gabungan) --
    // supaya kredensial sales yang belum/salah diisi tidak ikut memblokir seluruh
    // suite yang sebenarnya cuma butuh login owner (dependency Playwright bersifat
    // all-or-nothing per project, jadi 1 setup test gagal = semua dependent-nya gagal).
    { name: 'setup-owner', testMatch: /auth\.owner\.setup\.ts/ },
    { name: 'setup-sales', testMatch: /auth\.sales\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/owner.json' },
      dependencies: ['setup-owner'],
      // role-otorisasi.spec.ts jalan di project chromium-sales sendiri (di bawah).
      testIgnore: /role-otorisasi\.spec\.ts/,
    },
    {
      // Khusus test batasan otorisasi antar peran -- login sebagai staf 'sales'
      // (bukan owner) supaya bisa memastikan data/menu yang seharusnya
      // tersembunyi/terbatas untuk peran ini benar-benar begitu. Butuh KEDUA
      // storageState (bukan cuma sales) -- role-otorisasi.spec.ts punya describe
      // block "kontrol pembanding" yang login sebagai owner lewat test.use().
      name: 'chromium-sales',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/sales.json' },
      dependencies: ['setup-owner', 'setup-sales'],
      testMatch: /role-otorisasi\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run dev -- --mode test',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
