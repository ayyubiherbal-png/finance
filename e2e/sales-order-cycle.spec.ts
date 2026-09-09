import { test, expect, type Page } from '@playwright/test'
import { ownerClient, seedDataUji, hapusDataUji, type DataUji } from './fixtures/db'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabase: SupabaseClient
let data: DataUji

test.beforeAll(async () => {
  supabase = await ownerClient()
  data = await seedDataUji(supabase, 'so-cycle')
})

test.afterAll(async () => {
  await hapusDataUji(supabase, data)
})

async function pilihComboboxUji(page: Page, tombolPlaceholder: string, kueri: string, hasil: string) {
  await page.getByRole('button', { name: tombolPlaceholder }).click()
  await page.getByPlaceholder('Ketik untuk cari...').fill(kueri)
  await page.getByRole('button', { name: hasil }).click()
}

test.describe('Siklus Sales Order penuh (Order to Cash)', () => {
  test('happy path: SO -> Surat Jalan -> Faktur -> Penerimaan Kas -> Lunas', async ({ page }) => {
    // 1) Buat & setujui Sales Order
    await page.goto('/sales-order/baru')
    await pilihComboboxUji(page, 'Cari nama atau kode pelanggan...', data.pelangganNama, data.pelangganNama)
    await page.getByRole('button', { name: 'Simpan sebagai Draf' }).click()
    await expect(page).toHaveURL(/\/sales-order\/[0-9a-f-]+$/, { timeout: 15_000 })
    const soUrl = page.url()
    await expect(page.getByText('Draf', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Cari produk...' }).click()
    const responHarga = page.waitForResponse((r) => r.url().includes('/rpc/harga_produk'))
    await page.getByPlaceholder('Ketik untuk cari...').fill(data.produkNama)
    await page.getByRole('button', { name: data.produkNama }).click()
    await responHarga
    await page.getByRole('button', { name: 'Tambah', exact: true }).click()
    await expect(page.getByText(data.produkNama)).toBeVisible()

    await page.getByRole('button', { name: 'Setujui' }).click()
    await expect(page.getByText('Disetujui', { exact: true })).toBeVisible()

    // 2) Buat Surat Jalan, kirim langsung
    await page.getByRole('link', { name: 'Buat Surat Jalan' }).click()
    await expect(page).toHaveURL(/\/surat-jalan\/baru\?so=/)
    await page.getByRole('button', { name: 'Kirim Sekarang' }).click()
    await expect(page).toHaveURL(/\/surat-jalan\/[0-9a-f-]+$/, { timeout: 15_000 })
    await expect(page.getByText('Selesai', { exact: true })).toBeVisible()

    // 3) Lanjut ke Faktur, tagih SJ yang baru dikirim
    await page.getByRole('link', { name: 'Lanjut ke Faktur' }).click()
    await expect(page).toHaveURL(/\/faktur-penjualan\/baru/)
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: 'Buat Faktur' }).click()
    await expect(page).toHaveURL(/\/faktur-penjualan\/[0-9a-f-]+$/, { timeout: 15_000 })
    const fakturUrl = page.url()
    await expect(page.getByText('Belum Bayar', { exact: true })).toBeVisible()

    // 4) Catat pembayaran penuh
    await page.getByRole('link', { name: 'Catat Pembayaran' }).click()
    await expect(page).toHaveURL(/\/penerimaan-kas\/baru/)
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page).toHaveURL(/\/penerimaan-kas\/[0-9a-f-]+$/, { timeout: 15_000 })

    // 5) Faktur sekarang Lunas
    await page.goto(fakturUrl)
    await expect(page.getByText('Lunas', { exact: true })).toBeVisible()
    void soUrl // dipakai untuk debugging manual kalau test ini gagal di tengah jalan
  })

  test('gagal: simpan draf SO tanpa pilih pelanggan', async ({ page }) => {
    await page.goto('/sales-order/baru')
    await page.getByRole('button', { name: 'Simpan sebagai Draf' }).click()
    await expect(page.getByTestId('pesan-error')).toHaveText('Pilih pelanggan dulu.')
  })

  test('gagal: tambah item SO tanpa pilih produk', async ({ page }) => {
    await page.goto('/sales-order/baru')
    await pilihComboboxUji(page, 'Cari nama atau kode pelanggan...', data.pelangganNama, data.pelangganNama)
    await page.getByRole('button', { name: 'Simpan sebagai Draf' }).click()
    await expect(page).toHaveURL(/\/sales-order\/[0-9a-f-]+$/, { timeout: 15_000 })

    await page.getByRole('button', { name: 'Tambah', exact: true }).click()
    await expect(page.getByTestId('pesan-error')).toHaveText('Pilih produk, satuan, dan isi qty lebih dari 0.')
  })

  test('gagal: network error saat menyimpan draf SO', async ({ page }) => {
    await page.goto('/sales-order/baru')
    await pilihComboboxUji(page, 'Cari nama atau kode pelanggan...', data.pelangganNama, data.pelangganNama)

    await page.route('**/rest/v1/sales_order', (route) => route.abort('failed'))
    await page.getByRole('button', { name: 'Simpan sebagai Draf' }).click()

    await expect(page.getByTestId('pesan-error')).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/sales-order\/baru$/)
  })
})
