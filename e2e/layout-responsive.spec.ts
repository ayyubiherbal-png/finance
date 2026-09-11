import { expect, test } from '@playwright/test'

test.describe('layout responsif', () => {
  test('mobile punya menu navigasi yang dapat dibuka dan tertutup setelah pindah halaman', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    const tombolMenu = page.getByTestId('mobile-menu-button')
    await expect(tombolMenu).toBeVisible()
    await expect(page.getByTestId('sidebar-desktop')).toBeHidden()

    await tombolMenu.click()
    const drawer = page.getByTestId('mobile-menu-drawer')
    await expect(drawer).toBeVisible()
    await expect(tombolMenu).toHaveAttribute('aria-expanded', 'true')

    await drawer.getByRole('link', { name: 'Inventori' }).click()
    await expect(page).toHaveURL(/\/stok$/)
    await expect(drawer).toBeHidden()
  })

  test('tablet memakai sidebar rail dan desktop memakai sidebar penuh', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')

    const sidebar = page.getByTestId('sidebar-desktop')
    await expect(sidebar).toBeVisible()
    await expect(page.getByTestId('mobile-menu-button')).toBeHidden()
    await expect(sidebar.getByText('Ayyubi Finance')).toBeHidden()
    await expect(sidebar.getByRole('link', { name: 'Inventori' })).toBeVisible()

    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(sidebar.getByText('Ayyubi Finance')).toBeVisible()
    await expect(sidebar.getByText('Inventori')).toBeVisible()
  })
})

test.describe('perlindungan entri data', () => {
  test('memperingatkan saat meninggalkan form yang belum disimpan', async ({ page }) => {
    await page.goto('/produk/baru')
    await page.locator('input').first().fill('P0-UNSAVED')
    await page.locator('a[href="/produk"]').first().click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Perubahan belum disimpan')
    await dialog.getByRole('button', { name: 'Batal' }).click()
    await expect(page).toHaveURL(/\/produk\/baru$/)

    await page.locator('a[href="/produk"]').first().click()
    await dialog.getByRole('button', { name: 'Lanjutkan' }).click()
    await expect(page).toHaveURL(/\/produk$/)
  })
})
