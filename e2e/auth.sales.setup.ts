import { test as setup } from '@playwright/test'
import { login } from './fixtures/auth-helper'

/**
 * Login sekali sebagai staf peran 'sales', simpan storageState -- dependency
 * project "chromium-sales" (role-otorisasi.spec.ts saja, lihat
 * playwright.config.ts). Peran default user baru (trigger trg_user_baru,
 * lihat 0002_master_data.sql) SUDAH 'sales' -- tidak perlu langkah SQL
 * tambahan seperti owner, cukup buat user-nya lewat Authentication > Users
 * di dashboard project test.
 */
setup('login sebagai sales', async ({ page }) => {
  const email = process.env.E2E_EMAIL_SALES
  const password = process.env.E2E_PASSWORD_SALES
  if (!email || !password || password === 'ganti-ini') {
    throw new Error('E2E_EMAIL_SALES / E2E_PASSWORD_SALES belum diisi -- lihat e2e/README.md.')
  }
  await login(page, email, password, 'playwright/.auth/sales.json')
})
