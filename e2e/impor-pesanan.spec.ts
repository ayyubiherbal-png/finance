import { test, expect } from '@playwright/test'
import * as XLSX from 'xlsx'
import { ownerClient, seedDataUji, hapusDataUji, type DataUji } from './fixtures/db'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabase: SupabaseClient
let data: DataUji

test.beforeAll(async () => {
  supabase = await ownerClient()
  data = await seedDataUji(supabase, 'impor-pesanan')
})

test.afterAll(async () => {
  if (!data) return
  // Dokumen dari RPC penjualan_cepat yang dipanggil Impor Pesanan terikat ke
  // pelanggan AGREGAT (mis. SHOPEE) yang dipakai BERSAMA lintas test/produksi --
  // TIDAK BOLEH dihapus lewat pelanggan_id seperti cleanup umum (bisa kehapus
  // data SHOPEE yang bukan milik test ini). Dilacak presisi lewat
  // pesanan_marketplace_impor (nomor_pesanan_platform unik per test run) -> faktur_id.
  const { data: rows } = await supabase
    .from('pesanan_marketplace_impor')
    .select('id, faktur_id')
    .ilike('nomor_pesanan_platform', `${data.prefix}-%`)
  for (const r of rows ?? []) {
    if (r.faktur_id) {
      const { data: alokasi } = await supabase.from('penerimaan_kas_alokasi').select('penerimaan_id').eq('faktur_id', r.faktur_id)
      for (const a of alokasi ?? []) {
        await supabase.from('penerimaan_kas').delete().eq('id', a.penerimaan_id) // cascade ke alokasinya sendiri
      }
      const { data: faktur } = await supabase.from('faktur_penjualan').select('so_id').eq('id', r.faktur_id).single()
      await supabase.from('faktur_penjualan').delete().eq('id', r.faktur_id) // cascade item + junction SJ
      if (faktur?.so_id) {
        await supabase.from('surat_jalan').delete().eq('so_id', faktur.so_id) // cascade item
        await supabase.from('sales_order').delete().eq('id', faktur.so_id) // cascade item
      }
    }
    await supabase.from('pesanan_marketplace_impor').delete().eq('id', r.id)
  }
  await hapusDataUji(supabase, data)
})

/** Bangun file .xlsx di memori (bukan file di disk) meniru export Shopee -- header
 * yang dipakai sengaja cocok dengan kata kunci tebakan di src/lib/importPesanan.ts
 * supaya kolomnya otomatis kepetakan tanpa perlu dipilih manual di UI. */
function buatFileUjiXlsx(nomorPesanan: string): Buffer {
  const baris = [
    {
      'No. Pesanan': nomorPesanan,
      'Tanggal Pesanan': new Date().toISOString().slice(0, 10),
      'Status Pesanan': 'Selesai',
      'Nama Pembeli': 'Pembeli Uji E2E',
      SKU: data.produkKode,
      'Nama Produk': data.produkNama,
      Jumlah: 2,
      'Total Harga': 50000,
    },
  ]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(baris)
  XLSX.utils.book_append_sheet(wb, ws, 'Pesanan')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

test.describe('Impor Pesanan Marketplace', () => {
  // Serial: test-test di file ini berbagi 1 data seed (beforeAll) -- paralel penuh
  // bikin tiap worker seeding sendiri-sendiri secara redundan (boros & rawan race).
  test.describe.configure({ mode: 'serial' })

  test('happy path: unggah .xlsx, kolom & produk kepetakan otomatis, impor 1 pesanan', async ({ page }) => {
    const nomorPesanan = `${data.prefix}-ORDER-1`
    await page.goto('/impor-pesanan')
    // Kanal default sudah "Shopee" -- tidak perlu diubah.

    await page.locator('input[type=file]').setInputFiles({
      name: 'export-shopee-uji.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: buatFileUjiXlsx(nomorPesanan),
    })

    const tombolCocokkan = page.getByRole('button', { name: 'Cocokkan Produk' })
    await expect(tombolCocokkan).toBeEnabled({ timeout: 10_000 })
    await tombolCocokkan.click()

    const tombolLanjut = page.getByRole('button', { name: 'Lanjut ke Pratinjau' })
    await expect(tombolLanjut).toBeEnabled({ timeout: 10_000 })
    await tombolLanjut.click()

    await expect(page.getByRole('cell', { name: nomorPesanan })).toBeVisible()
    await page.getByRole('button', { name: /^Impor 1 Pesanan$/ }).click()

    // exact:true -- teks yang sama juga muncul di toast ("1 pesanan berhasil diimpor.", beda titik).
    await expect(page.getByText('1 pesanan berhasil diimpor', { exact: true })).toBeVisible({ timeout: 15_000 })
  })

  test('gagal: file kosong ditolak dengan pesan jelas', async ({ page }) => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([[]])
    XLSX.utils.book_append_sheet(wb, ws, 'Kosong')
    const bufKosong = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    await page.goto('/impor-pesanan')
    await page.locator('input[type=file]').setInputFiles({
      name: 'file-kosong.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: bufKosong,
    })

    await expect(page.getByTestId('pesan-error')).toHaveText('File kosong atau formatnya tidak terbaca.', { timeout: 10_000 })
  })

  test('gagal: kolom wajib belum lengkap -- tombol Cocokkan Produk tetap nonaktif', async ({ page }) => {
    // File cuma punya kolom nama produk & qty -- "No. Pesanan"/"Tanggal"/"Total Harga" (wajib) hilang.
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet([{ 'Nama Produk': data.produkNama, Jumlah: 1 }])
    XLSX.utils.book_append_sheet(wb, ws, 'Pesanan')
    const bufKurang = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    await page.goto('/impor-pesanan')
    await page.locator('input[type=file]').setInputFiles({
      name: 'kolom-kurang.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: bufKurang,
    })

    await expect(page.getByRole('button', { name: 'Cocokkan Produk' })).toBeDisabled({ timeout: 10_000 })
  })
})
