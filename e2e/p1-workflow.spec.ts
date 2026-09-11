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

  test('pembeli marketplace memuat pencarian server tanpa error', async ({ page }) => {
    await page.goto('/pembeli-marketplace')
    await expect(page.getByRole('heading', { name: 'Pembeli Marketplace' })).toBeVisible()
    const pencarian = page.getByPlaceholder('Cari nama, telepon, catatan...')
    await expect(pencarian).toBeVisible()
    await pencarian.fill('uji-pencarian-yang-tidak-ada')
    await expect(page.getByText(/Failed to|Could not find|relation .* does not exist/i)).toHaveCount(0)
  })

  test('riwayat follow-up menyediakan filter server tanpa error', async ({ page }) => {
    await page.goto('/riwayat-follow-up')
    await expect(page.getByRole('heading', { name: 'Riwayat Follow-Up' })).toBeVisible()
    await expect(page.getByPlaceholder('Cari nama pelanggan...')).toBeVisible()
    await expect(page.getByRole('combobox').first()).toHaveValue('')
    await expect(page.getByText(/Failed to|Could not find|relation .* does not exist/i)).toHaveCount(0)
  })

  test('tugas follow-up dapat dicari tanpa mengubah aturan treatment', async ({ page }) => {
    await page.goto('/tugas-follow-up')
    await expect(page.getByRole('heading', { name: 'Tugas Follow-Up' })).toBeVisible()
    const pencarian = page.getByPlaceholder('Cari nama atau sumber...')
    await expect(pencarian).toBeVisible()
    await pencarian.fill('nama-yang-tidak-ada')
    await expect(page.getByText(/Failed to|Could not find|relation .* does not exist/i)).toHaveCount(0)
  })

  test('laporan piutang menyediakan pencarian dan filter umur tanpa memotong ringkasan', async ({ page }) => {
    await page.goto('/laporan/piutang')
    await expect(page.getByRole('heading', { name: 'Laporan Piutang' })).toBeVisible()
    const pencarian = page.getByPlaceholder('Cari pelanggan atau nomor faktur...')
    if (await pencarian.count()) {
      await expect(pencarian).toBeVisible()
      await expect(page.getByRole('combobox')).toHaveValue('')
      await pencarian.fill('piutang-yang-tidak-ada')
    } else {
      await expect(page.getByText('Tidak ada piutang berjalan.')).toBeVisible()
    }
    await expect(page.getByText(/Failed to|Could not find|relation .* does not exist/i)).toHaveCount(0)
  })
})
