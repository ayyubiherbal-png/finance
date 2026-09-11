import { expect, test } from '@playwright/test'

test.describe('workflow P1', () => {
  test('CRM memakai pencarian dan filter segmen tanpa error', async ({ page }) => {
    await page.goto('/crm')
    await expect(page.getByRole('heading', { name: 'CRM Pelanggan' })).toBeVisible()
    await expect(page.getByPlaceholder('Cari nama atau ID...')).toBeVisible()
    await expect(page.getByText(/Failed to|Could not find|relation .* does not exist/i)).toHaveCount(0)

    await page.getByRole('button', { name: /Mulai Hilang/ }).click()
    await expect(page.getByText(/Menampilkan segmen/)).toBeVisible()
  })
})
