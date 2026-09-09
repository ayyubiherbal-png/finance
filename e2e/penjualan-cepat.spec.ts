import { test, expect, type Page } from '@playwright/test'
import { ownerClient, seedDataUji, hapusDataUji, type DataUji } from './fixtures/db'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabase: SupabaseClient
let data: DataUji

test.beforeAll(async () => {
  supabase = await ownerClient()
  data = await seedDataUji(supabase, 'penjualan-cepat')
})

test.afterAll(async () => {
  await hapusDataUji(supabase, data)
})

/** Pilih pelanggan uji lewat Combobox "1. Pembeli". */
async function pilihPelangganUji(page: Page) {
  await page.getByRole('button', { name: 'Cari nama atau kode pelanggan...' }).click()
  await page.getByPlaceholder('Ketik untuk cari...').fill(data.pelangganNama)
  await page.getByRole('button', { name: data.pelangganNama }).click()
}

/** Pilih produk uji di baris tambah "2. Barang", tunggu harga otomatis terisi, lalu klik Tambah. */
async function tambahBarangUji(page: Page, qty = 1) {
  await page.getByRole('button', { name: 'Cari produk...' }).click()
  const responHarga = page.waitForResponse((r) => r.url().includes('/rpc/harga_produk'))
  await page.getByPlaceholder('Ketik untuk cari...').fill(data.produkNama)
  await page.getByRole('button', { name: data.produkNama }).click()
  await responHarga
  if (qty !== 1) {
    await page.locator('input[type=number]').first().fill(String(qty))
  }
  await page.getByRole('button', { name: 'Tambah', exact: true }).click()
}

test.describe('Penjualan Cepat', () => {
  test('happy path: pilih pelanggan, tambah barang, bayar tunai -> faktur langsung lunas', async ({ page }) => {
    await page.goto('/penjualan-cepat')

    await pilihPelangganUji(page)
    await tambahBarangUji(page, 2)
    await expect(page.getByTestId(`baris-item-${data.produkId}`)).toBeVisible()

    // "Sudah dibayar sekarang" tercentang & metode Tunai adalah default -- langsung proses.
    await page.getByRole('button', { name: 'Proses Penjualan' }).click()

    await expect(page).toHaveURL(/\/faktur-penjualan\/[0-9a-f-]+$/, { timeout: 15_000 })
    await expect(page.getByText('Lunas', { exact: true })).toBeVisible()
  })

  test('gagal: proses penjualan tanpa pilih pelanggan', async ({ page }) => {
    await page.goto('/penjualan-cepat')
    await page.getByRole('button', { name: 'Proses Penjualan' }).click()
    await expect(page.getByTestId('pesan-error')).toHaveText('Pilih pelanggan dulu.')
  })

  test('gagal: klik Tambah tanpa memilih produk', async ({ page }) => {
    await page.goto('/penjualan-cepat')
    await page.getByRole('button', { name: 'Tambah', exact: true }).click()
    await expect(page.getByTestId('pesan-error')).toHaveText('Pilih produk, satuan, dan isi qty lebih dari 0.')
  })

  test('gagal: network error saat submit RPC penjualan_cepat', async ({ page }) => {
    await page.goto('/penjualan-cepat')
    await pilihPelangganUji(page)
    await tambahBarangUji(page)

    await page.route('**/rest/v1/rpc/penjualan_cepat', (route) => route.abort('failed'))
    await page.getByRole('button', { name: 'Proses Penjualan' }).click()

    await expect(page.getByTestId('pesan-error')).toBeVisible({ timeout: 10_000 })
    // Tetap di halaman Penjualan Cepat, tidak diam-diam pindah seolah sukses.
    await expect(page).toHaveURL(/\/penjualan-cepat$/)
  })
})
