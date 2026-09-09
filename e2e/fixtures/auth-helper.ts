import { expect, type Page } from '@playwright/test'

export async function login(page: Page, email: string, password: string, authFile: string) {
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Kata sandi').fill(password)
  await page.getByRole('button', { name: 'Masuk' }).click()

  // Tunggu keluar dari halaman login (form emailnya hilang) sebagai bukti sesi aktif.
  await expect(page.getByLabel('Email')).toHaveCount(0, { timeout: 15_000 })

  await page.context().storageState({ path: authFile })
}
