import { test, expect, type Page } from '@playwright/test'
import { ownerClient, seedDataUji, hapusDataUji, type DataUji } from './fixtures/db'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabase: SupabaseClient
let data: DataUji

test.beforeAll(async () => {
  supabase = await ownerClient()
  data = await seedDataUji(supabase, 'po-cycle')
})

test.afterAll(async () => {
  await hapusDataUji(supabase, data)
})

async function pilihComboboxUji(page: Page, tombolPlaceholder: string, kueri: string, hasil: string) {
  await page.getByRole('button', { name: tombolPlaceholder }).click()
  await page.getByPlaceholder('Ketik untuk cari...').fill(kueri)
  await page.getByRole('button', { name: hasil }).click()
}

test.describe('Siklus Purchase Order penuh (Procure to Pay)', () => {
  test('happy path: PO -> Penerimaan Barang -> Faktur Pembelian -> Bayar Supplier -> Lunas', async ({ page }) => {
    // 1) Buat & setujui Purchase Order
    await page.goto('/purchase-order/baru')
    await pilihComboboxUji(page, 'Cari nama atau kode supplier...', data.supplierNama, data.supplierNama)
    await page.getByRole('button', { name: 'Simpan sebagai Draf' }).click()
    await expect(page).toHaveURL(/\/purchase-order\/[0-9a-f-]+$/, { timeout: 15_000 })
    await expect(page.getByText('Draf', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Cari produk...' }).click()
    await page.getByPlaceholder('Ketik untuk cari...').fill(data.produkNama)
    await page.getByRole('button', { name: data.produkNama }).click()
    // Harga beli tidak auto-fill (beda dari sisi jual) -- isi manual.
    await page.locator('input[inputmode=numeric]').first().fill('15000')
    await page.getByRole('button', { name: 'Tambah', exact: true }).click()
    await expect(page.getByText(data.produkNama)).toBeVisible()

    await page.getByRole('button', { name: 'Setujui' }).click()
    await expect(page.getByText('Disetujui', { exact: true })).toBeVisible()

    // 2) Terima barang
    await page.getByRole('link', { name: 'Buat Penerimaan Barang' }).click()
    await expect(page).toHaveURL(/\/penerimaan-barang\/baru\?po=/)
    await page.getByRole('button', { name: 'Terima Sekarang' }).click()
    await expect(page).toHaveURL(/\/penerimaan-barang\/[0-9a-f-]+$/, { timeout: 15_000 })
    await expect(page.getByText('Selesai', { exact: true })).toBeVisible()

    // 3) Lanjut ke Faktur Pembelian
    await page.getByRole('link', { name: 'Lanjut ke Faktur Pembelian' }).click()
    await expect(page).toHaveURL(/\/faktur-pembelian\/baru/)
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: 'Buat Faktur' }).click()
    await expect(page).toHaveURL(/\/faktur-pembelian\/[0-9a-f-]+$/, { timeout: 15_000 })
    const fakturUrl = page.url()
    await expect(page.getByText('Belum Bayar', { exact: true })).toBeVisible()

    // 4) Bayar penuh
    await page.getByRole('link', { name: 'Bayar Sekarang' }).click()
    await expect(page).toHaveURL(/\/pembayaran-supplier\/baru/)
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page).toHaveURL(/\/pembayaran-supplier\/[0-9a-f-]+$/, { timeout: 15_000 })

    // 5) Faktur pembelian sekarang Lunas
    await page.goto(fakturUrl)
    await expect(page.getByText('Lunas', { exact: true })).toBeVisible()
  })

  test('gagal: simpan draf PO tanpa pilih supplier', async ({ page }) => {
    await page.goto('/purchase-order/baru')
    await page.getByRole('button', { name: 'Simpan sebagai Draf' }).click()
    await expect(page.getByTestId('pesan-error')).toHaveText('Pilih supplier dulu.')
  })

  test('gagal: tambah item PO tanpa pilih produk', async ({ page }) => {
    await page.goto('/purchase-order/baru')
    await pilihComboboxUji(page, 'Cari nama atau kode supplier...', data.supplierNama, data.supplierNama)
    await page.getByRole('button', { name: 'Simpan sebagai Draf' }).click()
    await expect(page).toHaveURL(/\/purchase-order\/[0-9a-f-]+$/, { timeout: 15_000 })

    await page.getByRole('button', { name: 'Tambah', exact: true }).click()
    await expect(page.getByTestId('pesan-error')).toHaveText('Pilih produk, satuan, dan isi qty lebih dari 0.')
  })

  test('gagal: network error saat menyimpan draf PO', async ({ page }) => {
    await page.goto('/purchase-order/baru')
    await pilihComboboxUji(page, 'Cari nama atau kode supplier...', data.supplierNama, data.supplierNama)

    await page.route('**/rest/v1/purchase_order', (route) => route.abort('failed'))
    await page.getByRole('button', { name: 'Simpan sebagai Draf' }).click()

    await expect(page.getByTestId('pesan-error')).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/purchase-order\/baru$/)
  })
})
