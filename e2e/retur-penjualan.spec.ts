import { test, expect } from '@playwright/test'
import { ownerClient, seedDataUji, hapusDataUji, type DataUji } from './fixtures/db'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabase: SupabaseClient
let data: DataUji

test.beforeAll(async () => {
  supabase = await ownerClient()
  data = await seedDataUji(supabase, 'retur-jual')
})

test.afterAll(async () => {
  if (data) await hapusDataUji(supabase, data)
})

/**
 * Sengaja retur TANPA faktur asal (bukan lanjutan dari siklus SO/faktur)
 * supaya spec ini berdiri sendiri -- tidak bergantung urutan jalan dengan
 * sales-order-cycle.spec.ts. Retur dari faktur asli sudah tercakup selama
 * siklus SO berjalan normal (menu "Muat Item dari Faktur" di halaman yang
 * sama, cuma beda titik masuk).
 */
test.describe('Retur Penjualan (freeform, tanpa faktur asal)', () => {
  // Serial: test-test di file ini berbagi 1 data seed (beforeAll) -- paralel penuh
  // bikin tiap worker seeding sendiri-sendiri secara redundan (boros & rawan race).
  test.describe.configure({ mode: 'serial' })

  test('happy path: buat retur, tambah barang, posting -> stok kembali', async ({ page }) => {
    await page.goto('/retur-penjualan/baru')

    await page.getByRole('button', { name: 'Cari nama atau kode pelanggan...' }).click()
    await page.getByPlaceholder('Ketik untuk cari...').fill(data.pelangganNama)
    await page.getByRole('button', { name: data.pelangganNama }).click()

    await page.getByRole('button', { name: 'Simpan sebagai Draf' }).click()
    await expect(page).toHaveURL(/\/retur-penjualan\/[0-9a-f-]+$/, { timeout: 15_000 })
    await expect(page.getByText('Draf', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Cari produk...' }).click()
    const responSatuan = page.waitForResponse((r) => r.url().includes('/rest/v1/produk_satuan'))
    await page.getByPlaceholder('Ketik untuk cari...').fill(data.produkNama)
    await page.getByRole('button', { name: data.produkNama }).click()
    await responSatuan // tunggu satuan (PCS) otomatis terisi sebelum lanjut, retur tidak auto-fill harga
    await page.locator('input[inputmode=numeric]').fill('20000')
    await page.getByRole('button', { name: 'Tambah', exact: true }).click()
    // Baris item beneran (di dalam tabel), bukan combobox produk yang masih menampilkan nama sama.
    await expect(page.getByRole('cell', { name: data.produkNama })).toBeVisible()

    await page.getByRole('button', { name: 'Posting' }).click()
    await expect(page.getByText('Selesai', { exact: true })).toBeVisible()
  })

  test('gagal: simpan draf retur tanpa pilih pelanggan', async ({ page }) => {
    await page.goto('/retur-penjualan/baru')
    await page.getByRole('button', { name: 'Simpan sebagai Draf' }).click()
    await expect(page.getByTestId('pesan-error')).toHaveText('Pilih pelanggan dan gudang dulu.')
  })

  test('gagal: tambah item retur tanpa pilih produk', async ({ page }) => {
    await page.goto('/retur-penjualan/baru')
    await page.getByRole('button', { name: 'Cari nama atau kode pelanggan...' }).click()
    await page.getByPlaceholder('Ketik untuk cari...').fill(data.pelangganNama)
    await page.getByRole('button', { name: data.pelangganNama }).click()
    await page.getByRole('button', { name: 'Simpan sebagai Draf' }).click()
    await expect(page).toHaveURL(/\/retur-penjualan\/[0-9a-f-]+$/, { timeout: 15_000 })

    await page.getByRole('button', { name: 'Tambah', exact: true }).click()
    await expect(page.getByTestId('pesan-error')).toHaveText('Pilih produk, satuan, dan isi qty lebih dari 0.')
  })

  test('gagal: network error saat menyimpan draf retur', async ({ page }) => {
    await page.goto('/retur-penjualan/baru')
    await page.getByRole('button', { name: 'Cari nama atau kode pelanggan...' }).click()
    await page.getByPlaceholder('Ketik untuk cari...').fill(data.pelangganNama)
    await page.getByRole('button', { name: data.pelangganNama }).click()

    // Regex, bukan glob string -- request insert Supabase selalu bawa query string
    // (mis. "?select=id"), glob "**/rest/v1/retur_penjualan" tanpa akhiran tidak cocok itu.
    await page.route(/\/rest\/v1\/retur_penjualan(\?|$)/, (route) => route.abort('failed'))
    await page.getByRole('button', { name: 'Simpan sebagai Draf' }).click()

    await expect(page.getByTestId('pesan-error')).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/retur-penjualan\/baru$/)
  })
})
