import { test, expect, type Page } from '@playwright/test'
import { ownerClient, seedDataUji, hapusDataUji, type DataUji } from './fixtures/db'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabase: SupabaseClient
let data: DataUji

test.beforeAll(async () => {
  supabase = await ownerClient()
  data = await seedDataUji(supabase, 'penyesuaian-stok')
})

test.afterAll(async () => {
  if (data) await hapusDataUji(supabase, data)
})

/**
 * Buka form baru dan tunggu fetch gudang aktif selesai -- gudang_id diisi
 * OTOMATIS lewat efek async begitu query itu resolve (cuma 1 gudang di
 * project test, dropdownnya tidak ditampilkan sama sekali jadi tidak ada
 * elemen buat ditunggu). Tanpa ini, "Simpan sebagai Draf" bisa keklik
 * sebelum gudang_id terisi -> ditolak "Belum ada gudang aktif."
 */
async function bukaFormBaru(page: Page) {
  const responGudang = page.waitForResponse((r) => r.url().includes('/rest/v1/gudang'))
  await page.goto('/penyesuaian-stok/baru')
  await responGudang
}

test.describe('Penyesuaian Stok', () => {
  // Serial: test-test di file ini berbagi 1 data seed (beforeAll) -- paralel penuh
  // bikin tiap worker seeding sendiri-sendiri secara redundan (boros & rawan race).
  test.describe.configure({ mode: 'serial' })

  test('happy path: buat penyesuaian, kurangi stok (barang rusak), posting -> selesai', async ({ page }) => {
    await bukaFormBaru(page)
    // Jenis default "Penyesuaian" (bukan Saldo Awal) -- tidak perlu diubah.
    await page.getByRole('button', { name: 'Simpan sebagai Draf' }).click()
    await expect(page).toHaveURL(/\/penyesuaian-stok\/[0-9a-f-]+$/, { timeout: 15_000 })
    await expect(page.getByText('Draf', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Cari produk...' }).click()
    const responSatuan = page.waitForResponse((r) => r.url().includes('/rest/v1/produk_satuan'))
    await page.getByPlaceholder('Ketik untuk cari...').fill(data.produkNama)
    await page.getByRole('button', { name: data.produkNama }).click()
    await responSatuan

    // Qty negatif = barang rusak/hilang, HPP tidak berlaku (stok seed 100 pcs, aman dikurangi).
    await page.locator('input[type=number]').fill('-5')
    await page.getByRole('button', { name: 'Tambah', exact: true }).click()
    await expect(page.getByRole('cell', { name: data.produkNama })).toBeVisible()

    await page.getByRole('button', { name: 'Posting' }).click()
    await expect(page.getByText('Selesai', { exact: true })).toBeVisible()
  })

  test('gagal: saldo awal qty positif tanpa isi HPP ditolak', async ({ page }) => {
    await bukaFormBaru(page)
    // Ganti jenis ke "Saldo Awal" (satu-satunya <select> di halaman ini -- Gudang
    // disembunyikan karena cuma ada 1 gudang aktif di project test).
    await page.locator('select').first().selectOption('saldo_awal')
    await page.getByRole('button', { name: 'Simpan sebagai Draf' }).click()
    await expect(page).toHaveURL(/\/penyesuaian-stok\/[0-9a-f-]+$/, { timeout: 15_000 })

    await page.getByRole('button', { name: 'Cari produk...' }).click()
    const responSatuan = page.waitForResponse((r) => r.url().includes('/rest/v1/produk_satuan'))
    await page.getByPlaceholder('Ketik untuk cari...').fill(data.produkNama)
    await page.getByRole('button', { name: data.produkNama }).click()
    await responSatuan
    // Qty positif (default 1) tapi HPP dibiarkan kosong/0 -- harus ditolak.
    await page.getByRole('button', { name: 'Tambah', exact: true }).click()
    await expect(page.getByTestId('pesan-error')).toHaveText('Saldo awal dengan qty positif wajib mengisi HPP per satuan dasar.')
  })

  test('gagal: tambah item tanpa pilih produk', async ({ page }) => {
    await bukaFormBaru(page)
    await page.getByRole('button', { name: 'Simpan sebagai Draf' }).click()
    await expect(page).toHaveURL(/\/penyesuaian-stok\/[0-9a-f-]+$/, { timeout: 15_000 })

    await page.getByRole('button', { name: 'Tambah', exact: true }).click()
    await expect(page.getByTestId('pesan-error')).toHaveText('Pilih produk, satuan, dan isi qty (tidak boleh 0).')
  })

  test('gagal: network error saat menyimpan draf penyesuaian', async ({ page }) => {
    await page.route(/\/rest\/v1\/penyesuaian_stok(\?|$)/, (route) => route.abort('failed'))
    await bukaFormBaru(page)
    await page.getByRole('button', { name: 'Simpan sebagai Draf' }).click()

    await expect(page.getByTestId('pesan-error')).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/penyesuaian-stok\/baru$/)
  })
})
