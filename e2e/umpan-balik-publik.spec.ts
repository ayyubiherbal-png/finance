import { test, expect } from '@playwright/test'
import { ownerClient, seedDataUji, hapusDataUji, type DataUji } from './fixtures/db'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabase: SupabaseClient
let data: DataUji

test.beforeAll(async () => {
  supabase = await ownerClient()
  data = await seedDataUji(supabase, 'umpan-balik')
})

test.afterAll(async () => {
  if (data) await hapusDataUji(supabase, data)
})

/**
 * Halaman /u/:token SENGAJA di luar AuthProvider (lihat App.tsx) -- pelanggan
 * tidak punya akun sama sekali. Diuji lewat browser context BARU tanpa
 * storageState/login sama sekali (bukan project chromium yang sudah login
 * lewat auth.setup.ts), supaya benar-benar meniru pengunjung anonim.
 */
test.describe('Umpan Balik Pelanggan (link publik tanpa login)', () => {
  test.describe.configure({ mode: 'serial' })

  test('happy path: minta link dari profil pelanggan, isi lewat halaman publik', async ({ page, browser }) => {
    await page.goto(`/crm/pelanggan/${data.pelangganId}`)
    await page.getByRole('button', { name: 'Minta Umpan Balik' }).click()
    // Data uji tidak punya nomor WA -> fallback toast berisi tautannya (bukan window.open ke WhatsApp).
    await expect(page.getByText(/Tautan umpan balik dibuat:/)).toBeVisible({ timeout: 10_000 })

    // Ambil token langsung dari DB -- lebih tahan-banting daripada parsing teks toast.
    const { data: link, error } = await supabase
      .from('link_umpan_balik')
      .select('token')
      .eq('entitas_id', data.pelangganId)
      .order('dibuat_pada', { ascending: false })
      .limit(1)
      .single()
    expect(error).toBeNull()
    expect(link?.token).toBeTruthy()

    // Context browser BARU, tanpa storageState sama sekali -- pengunjung anonim sungguhan.
    const contextPublik = await browser.newContext()
    const halamanPublik = await contextPublik.newPage()
    try {
      await halamanPublik.goto(`/u/${link!.token}`)

      await halamanPublik.getByRole('button', { name: 'Beri skor 5 dari 5' }).click()
      await halamanPublik.getByPlaceholder(/Cerita singkat pengalaman/).fill('Pelayanan cepat, barang sesuai pesanan.')
      await halamanPublik.getByRole('button', { name: 'Kirim' }).click()

      await expect(halamanPublik.getByText('Terima kasih atas masukannya!')).toBeVisible({ timeout: 10_000 })
    } finally {
      await contextPublik.close()
    }
  })

  test('gagal: token acak/salah menampilkan pesan tautan tidak ditemukan', async ({ browser }) => {
    const contextPublik = await browser.newContext()
    const halamanPublik = await contextPublik.newPage()
    try {
      await halamanPublik.goto('/u/token-acak-yang-pasti-tidak-pernah-dibuat-000000')
      await expect(halamanPublik.getByText('Tautan tidak ditemukan atau sudah kedaluwarsa.')).toBeVisible({ timeout: 10_000 })
    } finally {
      await contextPublik.close()
    }
  })

  test('gagal: kirim tanpa pilih skor bintang ditolak client-side', async ({ browser }) => {
    const { data: link } = await supabase
      .from('link_umpan_balik')
      .insert({ entitas_tipe: 'pelanggan', entitas_id: data.pelangganId, nama: data.pelangganNama })
      .select('token')
      .single()

    const contextPublik = await browser.newContext()
    const halamanPublik = await contextPublik.newPage()
    try {
      await halamanPublik.goto(`/u/${link!.token}`)
      // Tombol Kirim disabled selama skor belum dipilih -- pastikan tetap di form, tidak submit apa pun.
      await expect(halamanPublik.getByRole('button', { name: 'Kirim' })).toBeDisabled()
    } finally {
      await contextPublik.close()
    }
  })
})
