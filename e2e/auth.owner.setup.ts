import { test as setup } from '@playwright/test'
import { login } from './fixtures/auth-helper'

/**
 * Login sekali sebagai owner, simpan storageState -- dependency project
 * "chromium" (lihat playwright.config.ts). File TERPISAH dari
 * auth.sales.setup.ts SENGAJA -- supaya kredensial sales yang belum/salah
 * diisi tidak ikut menggagalkan (jadi memblokir) seluruh suite yang
 * sebetulnya cuma butuh login owner.
 */
setup('login sebagai owner', async ({ page }) => {
  const email = process.env.E2E_EMAIL_OWNER
  const password = process.env.E2E_PASSWORD_OWNER
  if (!email || !password) {
    throw new Error('E2E_EMAIL_OWNER / E2E_PASSWORD_OWNER belum diisi -- lihat e2e/README.md.')
  }
  await login(page, email, password, 'playwright/.auth/owner.json')
})
