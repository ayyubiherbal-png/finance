import { test, expect } from '@playwright/test'
import { ownerClient, seedDataUji, hapusDataUji, type DataUji } from './fixtures/db'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabase: SupabaseClient
let data: DataUji
/** Pelanggan "rujukan" (B) dibuat ad-hoc lewat UI di test happy path -- BUKAN
 * bagian dari seedDataUji(), jadi dibersihkan manual sendiri di afterAll. */
let pelangganBaruId: string | null = null

test.beforeAll(async () => {
  supabase = await ownerClient()
  data = await seedDataUji(supabase, 'kode-referral')
})

test.afterAll(async () => {
  if (pelangganBaruId) {
    await supabase.from('penerimaan_kas').delete().eq('pelanggan_id', pelangganBaruId)
    await supabase.from('faktur_penjualan').delete().eq('pelanggan_id', pelangganBaruId)
    await supabase.from('surat_jalan').delete().eq('pelanggan_id', pelangganBaruId)
    await supabase.from('sales_order').delete().eq('pelanggan_id', pelangganBaruId)
    // cascade otomatis: poin_pelanggan, riwayat_poin, kode_referral, referral_pemakaian miliknya sendiri.
    await supabase.from('pelanggan').delete().eq('id', pelangganBaruId)
  }
  if (data) await hapusDataUji(supabase, data)
})

/**
 * Kode referral (migrasi 0041) -- BELUM PERNAH diverifikasi lewat browser sejak
 * dibuat (lihat supabase/README.md), padahal menyentuh bonus poin pelanggan lain.
 * Angka poin & status bonus di-assert lewat query DB langsung (presisi), UI cuma
 * dicek untuk memastikan yang ditampilkan konsisten dengan itu.
 */
test.describe('Kode Referral', () => {
  // Serial: test ke-2/3 butuh kode referral A yang sudah ada dari seed, dan test
  // happy path membuat pelanggan B yang jadi prasyarat verifikasi bonusnya.
  test.describe.configure({ mode: 'serial' })

  test('happy path: kode otomatis dibuat, dipakai pelanggan baru, bonus masuk saat lunas pertama', async ({ page }) => {
    // 1) Kode referral A dibuat OTOMATIS oleh trigger saat pelanggan diseed -- ambil dari DB.
    const { data: kodeA, error: eKode } = await supabase
      .from('kode_referral')
      .select('kode')
      .eq('pelanggan_id', data.pelangganId)
      .single()
    expect(eKode).toBeNull()
    expect(kodeA?.kode).toBeTruthy()

    // 2) Buat pelanggan baru (B), pakai kode referral A saat dibuat.
    const kodeBaru = `${data.prefix}-CST`.toUpperCase()
    const namaBaru = `Pelanggan Rujukan Uji ${data.prefix}`
    await page.goto('/pelanggan/baru')
    await page.getByTestId('pelanggan-kode').fill(kodeBaru)
    await page.getByTestId('pelanggan-nama').fill(namaBaru)
    await page.getByPlaceholder(/kalau dirujuk pelanggan lain/).fill(kodeA!.kode)
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page).toHaveURL(/\/pelanggan\/[0-9a-f-]+$/, { timeout: 15_000 })
    pelangganBaruId = page.url().split('/').pop()!

    // 3) Lunas-kan faktur PERTAMA pelanggan B lewat Penjualan Cepat -- ini yang memicu bonus ke A.
    await page.goto('/penjualan-cepat')
    await page.getByRole('button', { name: 'Cari nama atau kode pelanggan...' }).click()
    await page.getByPlaceholder('Ketik untuk cari...').fill(namaBaru)
    await page.getByRole('button', { name: namaBaru }).click()

    await page.getByRole('button', { name: 'Cari produk...' }).click()
    const responHarga = page.waitForResponse((r) => r.url().includes('/rpc/harga_produk'))
    await page.getByPlaceholder('Ketik untuk cari...').fill(data.produkNama)
    await page.getByRole('button', { name: data.produkNama }).click()
    await responHarga
    await page.getByRole('button', { name: 'Tambah', exact: true }).click()
    await page.getByRole('button', { name: 'Proses Penjualan' }).click()
    await expect(page).toHaveURL(/\/faktur-penjualan\/[0-9a-f-]+$/, { timeout: 15_000 })
    await expect(page.getByText('Lunas', { exact: true })).toBeVisible()

    // 4) Bonus ke A -- verifikasi presisi lewat DB (trigger jalan async relatif terhadap UI).
    await expect(async () => {
      const { data: pemakaian } = await supabase
        .from('referral_pemakaian')
        .select('bonus_diberikan, bonus_poin')
        .eq('pelanggan_baru_id', pelangganBaruId)
        .single()
      expect(pemakaian?.bonus_diberikan).toBe(true)
      expect(pemakaian?.bonus_poin).toBe(50)
    }).toPass({ timeout: 10_000 })

    const { data: poinA } = await supabase.from('poin_pelanggan').select('saldo_poin').eq('pelanggan_id', data.pelangganId).single()
    expect(poinA?.saldo_poin).toBe(50)

    // 5) Kartu "Kode Referral" di profil A menampilkan pemakaiannya.
    await page.goto(`/crm/pelanggan/${data.pelangganId}`)
    await expect(page.getByText(namaBaru)).toBeVisible()
    await expect(page.getByText('+50 poin diberikan')).toBeVisible()
  })

  test('gagal (langsung lewat RPC): pakai kode referral sendiri ditolak', async () => {
    const { data: kodeA } = await supabase.from('kode_referral').select('kode').eq('pelanggan_id', data.pelangganId).single()
    // RPC dipanggil langsung (bukan lewat UI) -- "Kode referral" di PelangganForm.tsx
    // cuma muncul saat BIKIN pelanggan baru, jadi skenario "pakai kode milik sendiri
    // yang sudah ada" ini tidak reachable dari alur UI mana pun -- tetap layak diuji
    // sebagai lapis pertahanan RPC-nya sendiri (defense in depth).
    const { error } = await supabase.rpc('pakai_kode_referral', {
      p_kode: kodeA!.kode,
      p_pelanggan_baru_id: data.pelangganId,
    })
    expect(error?.message).toContain('Tidak bisa pakai kode referral sendiri.')
  })

  test('gagal: kode referral tidak ada -- pelanggan tetap tersimpan (best-effort), ada peringatan', async ({ page }) => {
    const kodeBaru2 = `${data.prefix}-CST2`.toUpperCase()
    const namaBaru2 = `Pelanggan Tanpa Referral Uji ${data.prefix}`
    await page.goto('/pelanggan/baru')
    await page.getByTestId('pelanggan-kode').fill(kodeBaru2)
    await page.getByTestId('pelanggan-nama').fill(namaBaru2)
    await page.getByPlaceholder(/kalau dirujuk pelanggan lain/).fill('KODE-YANG-PASTI-TIDAK-PERNAH-ADA-000')
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()

    // Best-effort -- pelanggan TETAP tersimpan (bukan diblokir simpannya), cuma toast peringatan.
    await expect(page).toHaveURL(/\/pelanggan\/[0-9a-f-]+$/, { timeout: 15_000 })
    await expect(page.getByText(/kode referral gagal dipakai/)).toBeVisible({ timeout: 5_000 })

    const idKedua = page.url().split('/').pop()!
    await supabase.from('pelanggan').delete().eq('id', idKedua)
  })
})
