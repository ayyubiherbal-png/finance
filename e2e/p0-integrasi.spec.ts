import { expect, test } from '@playwright/test'

test.describe('integrasi P0', () => {
  test('dashboard memuat ringkasan tanpa error sumber data', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dasbor' })).toBeVisible()
    await expect(page.getByText(/relation .* does not exist/i)).toHaveCount(0)
    await expect(page.getByText('Posisi saat ini')).toBeVisible()
  })

  test('kartu tindakan membuka daftar dengan filter yang sesuai', async ({ page }) => {
    await page.goto('/')
    await page.locator('a[href="/produk?stok=restock"]').click()
    await expect(page).toHaveURL(/\/produk\?stok=restock$/)
    await expect(page.getByRole('button', { name: /Perlu restock/ })).toBeVisible()

    await page.goto('/')
    await page.locator('a[href="/faktur-penjualan?jatuhTempo=1"]').click()
    await expect(page).toHaveURL(/\/faktur-penjualan\?jatuhTempo=1$/)
    await expect(page.getByRole('button', { name: /Jatuh tempo/ })).toBeVisible()

    await page.goto('/')
    await page.locator('a[href="/sales-order?status=menunggu"]').click()
    await expect(page).toHaveURL(/\/sales-order\?status=menunggu$/)
    await expect(page.locator('select').first()).toHaveValue('menunggu')
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
