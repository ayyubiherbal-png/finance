import { test, expect } from '@playwright/test'
import { ownerClient, seedDataUji, hapusDataUji, type DataUji } from './fixtures/db'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabase: SupabaseClient
let data: DataUji

test.beforeAll(async () => {
  supabase = await ownerClient()
  data = await seedDataUji(supabase, 'poin-loyalitas')
})

test.afterAll(async () => {
  if (data) await hapusDataUji(supabase, data)
})

/**
 * Poin loyalitas (migrasi 0040) -- BELUM PERNAH diverifikasi lewat browser sejak
 * dibuat (lihat supabase/README.md), padahal langsung menyentuh saldo pelanggan.
 * Angka saldo di-assert lewat query DB langsung (bukan scraping teks UI) -- kartu
 * "Poin Loyalitas" di CrmPelangganProfil.tsx tidak punya elemen unik buat
 * membedakan "saldo 5" dari angka lain di halaman yang sama.
 */
test.describe('Poin Loyalitas', () => {
  // Serial: saldo poin terakumulasi lintas test dalam file ini (tukar poin di test
  // ke-2 mengasumsikan saldo dari test ke-1) -- paralel akan salah hitung urutannya.
  test.describe.configure({ mode: 'serial' })

  test('happy path: faktur lunas via Penjualan Cepat -> poin bertambah otomatis (1 poin/Rp10.000)', async ({ page }) => {
    await page.goto('/penjualan-cepat')

    await page.getByRole('button', { name: 'Cari nama atau kode pelanggan...' }).click()
    await page.getByPlaceholder('Ketik untuk cari...').fill(data.pelangganNama)
    await page.getByRole('button', { name: data.pelangganNama }).click()

    await page.getByRole('button', { name: 'Cari produk...' }).click()
    const responHarga = page.waitForResponse((r) => r.url().includes('/rpc/harga_produk'))
    await page.getByPlaceholder('Ketik untuk cari...').fill(data.produkNama)
    await page.getByRole('button', { name: data.produkNama }).click()
    await responHarga
    // Harga seed 25.000/pcs (lihat fixtures/db.ts) -- qty 2 = Rp50.000 -> 5 poin (floor(50000/10000)).
    await page.locator('input[type=number]').first().fill('2')
    await page.getByRole('button', { name: 'Tambah', exact: true }).click()

    await page.getByRole('button', { name: 'Proses Penjualan' }).click()
    await expect(page).toHaveURL(/\/faktur-penjualan\/[0-9a-f-]+$/, { timeout: 15_000 })
    await expect(page.getByText('Lunas', { exact: true })).toBeVisible()

    const { data: poin, error: ePoin } = await supabase
      .from('poin_pelanggan')
      .select('saldo_poin')
      .eq('pelanggan_id', data.pelangganId)
      .single()
    expect(ePoin).toBeNull()
    expect(poin?.saldo_poin).toBe(5)

    const { data: riwayat, error: eRiwayat } = await supabase
      .from('riwayat_poin')
      .select('perubahan, alasan')
      .eq('pelanggan_id', data.pelangganId)
    expect(eRiwayat).toBeNull()
    expect(riwayat).toHaveLength(1)
    expect(riwayat![0]!.perubahan).toBe(5)
  })

  test('happy path: tukar 2 poin -- saldo berkurang & tercatat di riwayat', async ({ page }) => {
    await page.goto(`/crm/pelanggan/${data.pelangganId}`)
    await page.getByPlaceholder('Jumlah').fill('2')
    await page.getByPlaceholder('mis. Potongan pembelian, hadiah').fill('Uji tukar poin E2E')
    await page.getByRole('button', { name: 'Tukar', exact: true }).click()

    // Query React invalidate-nya async -- tunggu sampai DB benar-benar mencerminkan hasilnya.
    await expect(async () => {
      const { data: poin } = await supabase.from('poin_pelanggan').select('saldo_poin').eq('pelanggan_id', data.pelangganId).single()
      expect(poin?.saldo_poin).toBe(3)
    }).toPass({ timeout: 10_000 })

    const { data: riwayat } = await supabase
      .from('riwayat_poin')
      .select('perubahan')
      .eq('pelanggan_id', data.pelangganId)
      .order('dibuat_pada', { ascending: false })
      .limit(1)
    expect(riwayat?.[0]?.perubahan).toBe(-2)
  })

  test('gagal: tukar poin lebih dari saldo ditolak RPC', async ({ page }) => {
    await page.goto(`/crm/pelanggan/${data.pelangganId}`)
    await page.getByPlaceholder('Jumlah').fill('999999')
    await page.getByRole('button', { name: 'Tukar', exact: true }).click()
    await expect(page.getByTestId('pesan-error')).toHaveText('Saldo poin tidak cukup.')
  })

  test('gagal: tukar poin jumlah 0 ditolak client-side', async ({ page }) => {
    await page.goto(`/crm/pelanggan/${data.pelangganId}`)
    await page.getByPlaceholder('Jumlah').fill('0')
    await page.getByRole('button', { name: 'Tukar', exact: true }).click()
    await expect(page.getByTestId('pesan-error')).toHaveText('Jumlah poin harus lebih dari 0.')
  })

  test('gagal: network error saat tukar poin', async ({ page }) => {
    await page.route(/\/rest\/v1\/rpc\/tukar_poin/, (route) => route.abort('failed'))
    await page.goto(`/crm/pelanggan/${data.pelangganId}`)
    await page.getByPlaceholder('Jumlah').fill('1')
    await page.getByRole('button', { name: 'Tukar', exact: true }).click()
    await expect(page.getByTestId('pesan-error')).toBeVisible({ timeout: 10_000 })
  })
})
