import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Helper seeding/cleanup lewat Supabase langsung (bukan lewat UI) -- dipakai
 * di awal/akhir tiap spec untuk menyiapkan & membersihkan data referensi
 * (produk, pelanggan, supplier) yang test itu butuhkan. Dokumen transaksi
 * (SO, PO, faktur, dst.) sengaja TETAP dibuat lewat UI di dalam test itu
 * sendiri -- itu justru bagian yang mau diuji.
 *
 * WAJIB lawan project Supabase TESTING, lihat e2e/README.md.
 */

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    throw new Error(
      `${name} belum diisi. Salin .env.test.example jadi .env.test (dan isi juga sebagai GitHub secret untuk CI) -- lihat e2e/README.md.`,
    )
  }
  return v
}

/** Client Supabase yang login sebagai user peran owner di project TEST -- dipakai untuk seeding/cleanup langsung, bukan untuk mengklik UI. */
export async function ownerClient(): Promise<SupabaseClient> {
  const supabase = createClient(requireEnv('VITE_SUPABASE_URL'), requireEnv('VITE_SUPABASE_ANON_KEY'))
  const { error } = await supabase.auth.signInWithPassword({
    email: requireEnv('E2E_EMAIL_OWNER'),
    password: requireEnv('E2E_PASSWORD_OWNER'),
  })
  if (error) throw new Error(`Login owner untuk seeding gagal: ${error.message}`)
  return supabase
}

export interface DataUji {
  prefix: string
  produkId: string
  produkKode: string
  produkNama: string
  pelangganId: string
  pelangganKode: string
  pelangganNama: string
  supplierId: string
  supplierKode: string
  supplierNama: string
  gudangId: string
  satuanId: string
  tierHargaId: string
  penyesuaianStokId: string
}

/**
 * Buat 1 set data referensi unik (produk + pelanggan + supplier, ditandai
 * `label` + timestamp supaya tidak tabrakan antar test yang jalan paralel)
 * plus stok awal 100 pcs lewat jalur RESMI penyesuaian_stok (bukan insert
 * langsung ke tabel stok/stok_mutasi) supaya trigger HPP & kartu stok jalan
 * sama seperti kalau staf yang input manual.
 *
 * Asumsi: migrasi 0009_seed_awal.sql sudah dijalankan di project test
 * (satuan PCS, tier_harga default, gudang utama harus sudah ada).
 */
export async function seedDataUji(supabase: SupabaseClient, label: string): Promise<DataUji> {
  // Worker berbeda bisa memanggil ini nyaris bersamaan (mode paralel Playwright) --
  // Date.now() saja tidak cukup anti-tabrakan, tambahkan komponen acak.
  const acak = Math.random().toString(36).slice(2, 8)
  const prefix = `E2E-${label}-${Date.now()}-${acak}`

  const { data: satuanPcs, error: eSatuan } = await supabase.from('satuan').select('id').eq('kode', 'PCS').single()
  if (eSatuan || !satuanPcs) throw new Error('Satuan PCS tidak ditemukan -- pastikan migrasi 0009_seed_awal.sql sudah dijalankan di project test.')

  const { data: tierDefault, error: eTier } = await supabase.from('tier_harga').select('id').eq('jadi_default', true).single()
  if (eTier || !tierDefault) throw new Error('Tier harga default tidak ditemukan -- pastikan migrasi 0009_seed_awal.sql sudah dijalankan.')

  const { data: gudangUtama, error: eGudang } = await supabase.from('gudang').select('id').eq('utama', true).single()
  if (eGudang || !gudangUtama) throw new Error('Gudang utama tidak ditemukan -- pastikan migrasi 0009_seed_awal.sql sudah dijalankan.')

  const produkKode = `${prefix}-PRD`
  const produkNama = `Produk Uji ${prefix}`
  const { data: produk, error: eProduk } = await supabase
    .from('produk')
    .insert({ kode: produkKode, nama: produkNama, satuan_dasar_id: satuanPcs.id, aktif: true })
    .select('id')
    .single()
  if (eProduk || !produk) throw new Error(`Gagal seed produk uji: ${eProduk?.message}`)

  const { error: eProdukSatuan } = await supabase
    .from('produk_satuan')
    .insert({ produk_id: produk.id, satuan_id: satuanPcs.id, konversi: 1 })
  if (eProdukSatuan) throw new Error(`Gagal seed produk_satuan: ${eProdukSatuan.message}`)

  const { error: eHarga } = await supabase
    .from('produk_harga')
    .insert({ produk_id: produk.id, tier_harga_id: tierDefault.id, satuan_id: satuanPcs.id, min_qty: 1, harga: 25000 })
  if (eHarga) throw new Error(`Gagal seed produk_harga: ${eHarga.message}`)

  const pelangganKode = `${prefix}-CUST`
  const pelangganNama = `Pelanggan Uji ${prefix}`
  const { data: pelanggan, error: ePelanggan } = await supabase
    .from('pelanggan')
    .insert({ kode: pelangganKode, nama: pelangganNama, tipe: 'mitra', tier_harga_id: tierDefault.id, termin: 'cod', aktif: true })
    .select('id')
    .single()
  if (ePelanggan || !pelanggan) throw new Error(`Gagal seed pelanggan uji: ${ePelanggan?.message}`)

  const supplierKode = `${prefix}-SUP`
  const supplierNama = `Supplier Uji ${prefix}`
  const { data: supplier, error: eSupplier } = await supabase
    .from('supplier')
    .insert({ kode: supplierKode, nama: supplierNama, termin_hari: 0, aktif: true })
    .select('id')
    .single()
  if (eSupplier || !supplier) throw new Error(`Gagal seed supplier uji: ${eSupplier?.message}`)

  // Stok awal 100 pcs @ HPP 15.000 -- lewat penyesuaian_stok posting resmi
  // (status draf -> selesai memicu trigger fn_posting_penyesuaian di 0006).
  const { data: adj, error: eAdj } = await supabase
    .from('penyesuaian_stok')
    .insert({ gudang_id: gudangUtama.id, jenis: 'saldo_awal', status: 'draf', alasan: `Seed E2E ${prefix}` })
    .select('id')
    .single()
  if (eAdj || !adj) throw new Error(`Gagal seed penyesuaian_stok: ${eAdj?.message}`)

  const { error: eAdjItem } = await supabase
    .from('penyesuaian_stok_item')
    .insert({ penyesuaian_id: adj.id, produk_id: produk.id, satuan_id: satuanPcs.id, konversi: 1, qty: 100, hpp_satuan: 15000 })
  if (eAdjItem) throw new Error(`Gagal seed penyesuaian_stok_item: ${eAdjItem.message}`)

  const { error: eAdjPost } = await supabase.from('penyesuaian_stok').update({ status: 'selesai' }).eq('id', adj.id)
  if (eAdjPost) throw new Error(`Gagal posting penyesuaian_stok seed: ${eAdjPost.message}`)

  return {
    prefix,
    produkId: produk.id,
    produkKode,
    produkNama,
    pelangganId: pelanggan.id,
    pelangganKode,
    pelangganNama,
    supplierId: supplier.id,
    supplierKode,
    supplierNama,
    gudangId: gudangUtama.id,
    satuanId: satuanPcs.id,
    tierHargaId: tierDefault.id,
    penyesuaianStokId: adj.id,
  }
}

/**
 * Hapus semua dokumen transaksi yang dibuat test (lewat UI) untuk
 * pelanggan/supplier uji ini, lalu pelanggan/supplier-nya sendiri.
 *
 * `produk` (+ `penyesuaian_stok` seed & riwayat `stok_mutasi`-nya) SENGAJA
 * TIDAK ikut dihapus -- `stok_mutasi` tidak punya policy tulis sama sekali
 * (lihat 0008_rls.sql, kartu stok harus permanen/append-only bahkan untuk
 * data test), jadi `produk` juga tidak akan pernah bisa dihapus selama
 * masih ada riwayat stoknya (FK restrict). Nama produk unik per run
 * (timestamp di `kode`), jadi aman menumpuk di project test yang memang
 * disposable -- bukan kebocoran, cuma histori.
 *
 * Urutan dokumen transaksi WAJIB mengikuti arah FK (banyak kolom
 * `on delete restrict` di skema ini -- lihat supabase/migrations/0004 &
 * 0005): header dihapus dari yang PALING BARU di alur (kas/bayar) mundur
 * ke yang paling awal (SO/PO) supaya tidak kena constraint. Tabel
 * `_item`/`_alokasi`/`_sj`/`_pb` OTOMATIS ikut terhapus (on delete cascade
 * dari headernya), tidak perlu dihapus manual.
 *
 * Best-effort: tiap langkah gagal cuma di-warn, tidak menghentikan
 * cleanup langkah lain -- supaya satu tabel yang gagal tidak menyisakan
 * SEMUA data lain tak terhapus. Kalau ada warning, bersihkan manual lewat
 * Supabase Studio project test.
 */
export async function hapusDataUji(supabase: SupabaseClient, data: DataUji): Promise<void> {
  async function hapus(label: string, p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p
    if (error) console.warn(`[e2e cleanup] gagal hapus ${label}: ${error.message}`)
  }

  await hapus('penerimaan_kas', supabase.from('penerimaan_kas').delete().eq('pelanggan_id', data.pelangganId))
  await hapus('retur_penjualan', supabase.from('retur_penjualan').delete().eq('pelanggan_id', data.pelangganId))
  await hapus('faktur_penjualan', supabase.from('faktur_penjualan').delete().eq('pelanggan_id', data.pelangganId))
  await hapus('surat_jalan', supabase.from('surat_jalan').delete().eq('pelanggan_id', data.pelangganId))
  await hapus('sales_order', supabase.from('sales_order').delete().eq('pelanggan_id', data.pelangganId))

  await hapus('pembayaran_supplier', supabase.from('pembayaran_supplier').delete().eq('supplier_id', data.supplierId))
  await hapus('retur_pembelian', supabase.from('retur_pembelian').delete().eq('supplier_id', data.supplierId))
  await hapus('faktur_pembelian', supabase.from('faktur_pembelian').delete().eq('supplier_id', data.supplierId))
  await hapus('penerimaan_barang', supabase.from('penerimaan_barang').delete().eq('supplier_id', data.supplierId))
  await hapus('purchase_order', supabase.from('purchase_order').delete().eq('supplier_id', data.supplierId))

  // `stok_mutasi` SENGAJA tidak punya policy tulis sama sekali (lihat 0008_rls.sql --
  // kartu stok harus permanen/append-only, bahkan untuk data test). Akibatnya `produk`
  // uji juga tidak akan pernah bisa dihapus selama masih ada riwayat stoknya (FK restrict)
  // -- ini konsisten dengan desain aplikasi, bukan sesuatu yang perlu "diperbaiki" di sini.
  // Produk + penyesuaian_stok seed-nya SENGAJA dibiarkan (nama unik per run, tidak
  // tabrakan, aman menumpuk di project test yang memang disposable).
  await hapus('pelanggan', supabase.from('pelanggan').delete().eq('id', data.pelangganId))
  await hapus('supplier', supabase.from('supplier').delete().eq('id', data.supplierId))
}
