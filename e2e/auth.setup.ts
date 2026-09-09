import { test as setup, expect } from '@playwright/test'

/**
 * Login sekali lewat UI sebagai owner, simpan storageState (Supabase JS
 * menyimpan sesi di localStorage, bukan cookie -- Playwright storageState
 * menangkap keduanya) supaya spec lain tidak perlu mengulang alur login.
 * Dijalankan sebagai project terpisah ("setup") yang jadi dependency
 * project chromium, lihat playwright.config.ts.
 */
const authFile = 'playwright/.auth/owner.json'

setup('login sebagai owner', async ({ page }) => {
  const email = process.env.E2E_EMAIL_OWNER
  const password = process.env.E2E_PASSWORD_OWNER
  if (!email || !password) {
    throw new Error('E2E_EMAIL_OWNER / E2E_PASSWORD_OWNER belum diisi -- lihat e2e/README.md.')
  }

  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Kata sandi').fill(password)
  await page.getByRole('button', { name: 'Masuk' }).click()

  // Tunggu keluar dari halaman login (form emailnya hilang) sebagai bukti sesi aktif.
  await expect(page.getByLabel('Email')).toHaveCount(0, { timeout: 15_000 })

  await page.context().storageState({ path: authFile })
})
