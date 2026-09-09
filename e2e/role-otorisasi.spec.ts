import { test, expect } from '@playwright/test'

/**
 * Jalan di project "chromium-sales" (lihat playwright.config.ts) -- login
 * sebagai staf peran 'sales', BUKAN owner seperti semua spec lain.
 *
 * Cakupan: dua bentuk pembatasan peran yang BENAR-BENAR ditegakkan di app
 * ini -- sembunyikan tab menu (Layout.tsx, `peran` di MENU) dan RLS Kas &
 * Bank (`boleh_finance()`, migrasi 0043 -- perbaikan dari audit keamanan
 * sesi ini). Beberapa halaman lain (mis. /supplier, /gudang) SENGAJA tidak
 * disentuh di sini -- itu cuma disembunyikan dari sidebar, datanya sendiri
 * tetap terbaca lewat RLS blanket `user_aktif()` untuk semua peran (temuan
 * audit yang perlu keputusan bisnis, bukan sesuatu untuk "dites benar").
 */
test.describe('Otorisasi peran -- staf sales dibatasi', () => {
  test('tab Supplier & Gudang tersembunyi dari menu Master', async ({ page }) => {
    await page.goto('/produk')
    await expect(page.getByRole('link', { name: 'Produk', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Supplier', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Gudang', exact: true })).toHaveCount(0)
  })

  test('tab Omzet & Laba Kotor tersembunyi dari menu Laporan', async ({ page }) => {
    await page.goto('/laporan/piutang')
    await expect(page.getByRole('link', { name: 'Piutang', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Omzet', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Laba Kotor', exact: true })).toHaveCount(0)
  })

  test('Kas & Bank: RLS mengembalikan kosong untuk peran sales (bukan cuma UI yang menyembunyikan)', async ({ page }) => {
    const respon = page.waitForResponse((r) => r.url().includes('/rest/v1/v_saldo_kas_bank'))
    await page.goto('/kas-bank')
    const isi = await (await respon).json()
    expect(isi).toEqual([])
  })
})

test.describe('Kontrol pembanding -- peran owner tetap lihat semuanya', () => {
  test.use({ storageState: 'playwright/.auth/owner.json' })

  test('tab Supplier, Gudang, Omzet, Laba Kotor tetap tampil untuk owner', async ({ page }) => {
    await page.goto('/produk')
    await expect(page.getByRole('link', { name: 'Supplier', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Gudang', exact: true })).toBeVisible()

    await page.goto('/laporan/piutang')
    await expect(page.getByRole('link', { name: 'Omzet', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Laba Kotor', exact: true })).toBeVisible()
  })

  test('Kas & Bank: owner tetap bisa lihat datanya', async ({ page }) => {
    const respon = page.waitForResponse((r) => r.url().includes('/rest/v1/v_saldo_kas_bank'))
    await page.goto('/kas-bank')
    const isi = await (await respon).json()
    expect(Array.isArray(isi)).toBe(true)
    expect(isi.length).toBeGreaterThan(0)
  })
})
