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
