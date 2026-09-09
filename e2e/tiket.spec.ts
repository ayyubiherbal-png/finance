import { test, expect } from '@playwright/test'
import { ownerClient, seedDataUji, hapusDataUji, type DataUji } from './fixtures/db'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabase: SupabaseClient
let data: DataUji

test.beforeAll(async () => {
  supabase = await ownerClient()
  data = await seedDataUji(supabase, 'tiket')
})

test.afterAll(async () => {
  if (data) await hapusDataUji(supabase, data)
})

test.describe('Tiket (CRM)', () => {
  // Serial: test-test di file ini berbagi 1 data seed (beforeAll) -- paralel penuh
  // bikin tiap worker seeding sendiri-sendiri secara redundan (boros & rawan race).
  test.describe.configure({ mode: 'serial' })

  test('happy path: buat tiket, ubah status jadi Selesai', async ({ page }) => {
    await page.goto('/tiket/baru')

    await page.getByRole('button', { name: 'Cari nama atau kode pelanggan...' }).click()
    await page.getByPlaceholder('Ketik untuk cari...').fill(data.pelangganNama)
    await page.getByRole('button', { name: data.pelangganNama }).click()

    await page.getByPlaceholder('Ringkasan singkat keluhan/permintaan').fill('Tiket uji E2E -- keluhan pengiriman')
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()

    await expect(page).toHaveURL(/\/tiket\/[0-9a-f-]+$/, { timeout: 15_000 })
    // Select "Status" cuma muncul di halaman edit (bukan saat isBaru) -- satu-satunya <select> di sini.
    const selectStatus = page.locator('select').last()
    await expect(selectStatus).toHaveValue('terbuka')

    await selectStatus.selectOption('selesai')
    await expect(selectStatus).toHaveValue('selesai')
  })

  test('gagal: simpan tiket tanpa pilih pelanggan', async ({ page }) => {
    await page.goto('/tiket/baru')
    await page.getByPlaceholder('Ringkasan singkat keluhan/permintaan').fill('Tiket tanpa pelanggan')
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByTestId('pesan-error')).toHaveText('Pilih pelanggan dulu.')
  })

  test('gagal: simpan tiket tanpa judul', async ({ page }) => {
    await page.goto('/tiket/baru')
    await page.getByRole('button', { name: 'Cari nama atau kode pelanggan...' }).click()
    await page.getByPlaceholder('Ketik untuk cari...').fill(data.pelangganNama)
    await page.getByRole('button', { name: data.pelangganNama }).click()

    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByTestId('pesan-error')).toHaveText('Judul tiket wajib diisi.')
  })

  test('gagal: network error saat menyimpan tiket', async ({ page }) => {
    await page.route(/\/rest\/v1\/tiket(\?|$)/, (route) => route.abort('failed'))
    await page.goto('/tiket/baru')
    await page.getByRole('button', { name: 'Cari nama atau kode pelanggan...' }).click()
    await page.getByPlaceholder('Ketik untuk cari...').fill(data.pelangganNama)
    await page.getByRole('button', { name: data.pelangganNama }).click()
    await page.getByPlaceholder('Ringkasan singkat keluhan/permintaan').fill('Tiket uji network error')

    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByTestId('pesan-error')).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/tiket\/baru$/)
  })
})
