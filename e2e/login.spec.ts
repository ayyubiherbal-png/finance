import { test, expect } from '@playwright/test'

/**
 * Login diuji TANPA storageState (project chromium biasanya sudah login
 * lewat e2e/auth.setup.ts) -- justru mau menguji form login itu sendiri.
 */
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Login', () => {
  test('kredensial benar -> masuk ke dashboard', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Ayyubi Finance' })).toBeVisible()

    await page.getByLabel('Email').fill(process.env.E2E_EMAIL_OWNER!)
    await page.getByLabel('Kata sandi').fill(process.env.E2E_PASSWORD_OWNER!)
    await page.getByRole('button', { name: 'Masuk' }).click()

    // Form login hilang (diganti Layout aplikasi) -- bukti sesi berhasil.
    await expect(page.getByLabel('Email')).toHaveCount(0, { timeout: 15_000 })
  })

  test('kata sandi salah -> pesan error, tetap di halaman login', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Email').fill(process.env.E2E_EMAIL_OWNER!)
    await page.getByLabel('Kata sandi').fill('kata-sandi-yang-pasti-salah-123')
    await page.getByRole('button', { name: 'Masuk' }).click()

    await expect(page.getByTestId('pesan-error')).toHaveText('Email atau kata sandi salah.')
    await expect(page.getByLabel('Email')).toBeVisible()
  })

  test('kolom kosong -> browser menahan submit (validasi required)', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Masuk' }).click()
    // required HTML -- form tidak submit, masih di halaman yang sama tanpa error server.
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByTestId('pesan-error')).toHaveCount(0)
  })

  test('network error saat login -> pesan error tampil, tidak macet diam', async ({ page }) => {
    await page.route('**/auth/v1/token**', (route) => route.abort('failed'))
    await page.goto('/')
    await page.getByLabel('Email').fill(process.env.E2E_EMAIL_OWNER!)
    await page.getByLabel('Kata sandi').fill(process.env.E2E_PASSWORD_OWNER!)
    await page.getByRole('button', { name: 'Masuk' }).click()

    await expect(page.getByTestId('pesan-error')).toBeVisible({ timeout: 10_000 })
  })
})
