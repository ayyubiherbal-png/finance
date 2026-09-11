import { expect, test } from '@playwright/test'

test.describe('integrasi P0', () => {
  test('dashboard memuat ringkasan tanpa error sumber data', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dasbor' })).toBeVisible()
    await expect(page.getByText(/relation .* does not exist/i)).toHaveCount(0)
    await expect(page.getByText('Posisi saat ini')).toBeVisible()
  })

  test('audit log dapat dibuka', async ({ page }) => {
    await page.goto('/riwayat-perubahan')
    await expect(page.getByRole('heading', { name: 'Riwayat Perubahan' })).toBeVisible()
    await expect(page.getByText(/relation .*audit_log.* does not exist/i)).toHaveCount(0)
  })

  test('settlement marketplace dapat dibuka', async ({ page }) => {
    await page.goto('/settlement-marketplace')
    await expect(page.getByRole('heading', { name: 'Settlement Marketplace' })).toBeVisible()
    await expect(page.getByText(/relation .*settlement_marketplace.* does not exist/i)).toHaveCount(0)
  })
})
