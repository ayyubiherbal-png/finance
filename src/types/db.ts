/**
 * Tipe domain hasil pemetaan manual dari supabase/migrations.
 *
 * Setelah proyek Supabase dibuat, jalankan `npm run db:types` untuk
 * menghasilkan src/types/database.ts (lengkap, 39 tabel) langsung dari
 * database. File ini tetap berguna sebagai alias yang enak dibaca.
 */

export type PeranPengguna = 'owner' | 'admin' | 'sales' | 'gudang' | 'finance'

export type StatusDokumen =
  | 'draf'
  | 'menunggu'
  | 'disetujui'
  | 'sebagian'
  | 'selesai'
  | 'ditolak'
  | 'dibatalkan'

export type JenisMutasiStok =
  | 'saldo_awal'
  | 'pembelian'
  | 'penjualan'
  | 'retur_pembelian'
  | 'retur_penjualan'
  | 'transfer_masuk'
  | 'transfer_keluar'
  | 'penyesuaian'

export type StatusBayar = 'belum' | 'sebagian' | 'lunas'
export type MetodeBayar = 'tunai' | 'transfer' | 'qris' | 'giro' | 'kartu'
export type TerminBayar = 'cod' | 'tempo'
export type TipePelanggan = 'customer' | 'mitra' | 'horeka' | 'perusahaan'

/** Dari mana pelanggan ini didapat (beda dari kanal penjualan per-order). */
export type SumberPelanggan = 'relasi' | 'sosmed' | 'shopee' | 'tiktok' | 'website' | 'custom'

/** Dari mana order datang. 'canvassing' = sales bawa barang langsung. */
export type KanalPenjualan = 'canvassing' | 'tokopedia' | 'shopee' | 'tiktok' | 'whatsapp' | 'lainnya'

export type JenisAkunKas = 'kas' | 'bank'

export interface Profil {
  id: string
  nama: string
  peran: PeranPengguna
  telepon: string | null
  aktif: boolean
}

export interface Gudang {
  id: string
  kode: string
  nama: string
  alamat: string | null
  utama: boolean
  aktif: boolean
}

export interface Satuan {
  id: string
  kode: string
  nama: string
}

export interface KategoriProduk {
  id: string
  kode: string
  nama: string
  induk_id: string | null
  aktif: boolean
}

export interface Produk {
  id: string
  kode: string
  barcode: string | null
  nama: string
  kategori_id: string | null
  satuan_dasar_id: string
  hpp_rata2: number
  stok_min: number
  berat_gram: number | null
  pakai_batch: boolean
  aktif: boolean
  catatan: string | null
}

export interface ProdukSatuan {
  id: string
  produk_id: string
  satuan_id: string
  konversi: number
  barcode: string | null
  urutan: number
}

export interface TierHarga {
  id: string
  kode: string
  nama: string
  urutan: number
  jadi_default: boolean
  aktif: boolean
}

export interface ProdukHarga {
  id: string
  produk_id: string
  tier_harga_id: string
  satuan_id: string
  min_qty: number
  harga: number
  berlaku_mulai: string
  berlaku_sampai: string | null
}

export interface Pelanggan {
  id: string
  kode: string
  nama: string
  tipe: TipePelanggan
  tier_harga_id: string | null
  sales_id: string | null
  kontak_nama: string | null
  telepon: string | null
  email: string | null
  alamat: string | null
  kota: string | null
  npwp: string | null
  termin: TerminBayar
  termin_hari: number
  limit_kredit: number
  aktif: boolean
  catatan: string | null
  whatsapp: string | null
  sosial_media: string | null
  tanggal_lahir: string | null
  sumber: SumberPelanggan | null
  sumber_custom: string | null
  tag: string[]
  provinsi_kode: string | null
  kabupaten_kode: string | null
  kecamatan_kode: string | null
  kelurahan_kode: string | null
  akun_agregat: boolean
}

export interface WilayahProvinsi {
  kode: string
  nama: string
}

export interface WilayahKabupatenKota {
  kode: string
  provinsi_kode: string
  nama: string
}

export interface WilayahKecamatan {
  kode: string
  kabupaten_kode: string
  nama: string
}

export interface WilayahKelurahan {
  kode: string
  kecamatan_kode: string
  nama: string
  kode_pos: string | null
}

export interface Supplier {
  id: string
  kode: string
  nama: string
  kontak_nama: string | null
  telepon: string | null
  email: string | null
  alamat: string | null
  kota: string | null
  npwp: string | null
  termin_hari: number
  aktif: boolean
  catatan: string | null
  provinsi_kode: string | null
  kabupaten_kode: string | null
  kecamatan_kode: string | null
  kelurahan_kode: string | null
}

export interface AkunKasBank {
  id: string
  kode: string
  nama: string
  jenis: JenisAkunKas
  bank_nama: string | null
  nomor_rekening: string | null
  atas_nama: string | null
  saldo_awal: number
  aktif: boolean
  catatan: string | null
}

/** Header dokumen yang punya pola total sama (SO, PO, faktur) */
export interface TotalDokumen {
  subtotal: number
  diskon_header: number
  dpp: number
  ppn_persen: number
  ppn_nilai: number
  total: number
}

export interface SalesOrder extends TotalDokumen {
  id: string
  nomor: string
  tanggal: string
  pelanggan_id: string
  kanal: KanalPenjualan
  sales_id: string | null
  gudang_id: string
  tier_harga_id: string | null
  termin: TerminBayar
  termin_hari: number
  status: StatusDokumen
  nama_penerima: string | null
  alamat_kirim: string | null
  catatan: string | null
}

export interface SalesOrderItem {
  id: string
  so_id: string
  produk_id: string
  satuan_id: string
  konversi: number
  qty: number
  qty_dasar: number
  harga_satuan: number
  diskon_persen: number
  diskon_nilai: number
  subtotal: number
  qty_terkirim: number
  catatan: string | null
  urutan: number
}

export interface FakturPenjualan extends TotalDokumen {
  id: string
  nomor: string
  nomor_efaktur: string | null
  tanggal: string
  jatuh_tempo: string
  pelanggan_id: string
  kanal: KanalPenjualan
  so_id: string | null
  sales_id: string | null
  status: StatusDokumen
  terbayar: number
  sisa: number
  status_bayar: StatusBayar
  catatan: string | null
}

/* ---------- View laporan ---------- */

export interface VStokProduk {
  produk_id: string
  kode: string
  nama: string
  kategori: string | null
  satuan_dasar: string
  qty: number
  stok_min: number
  hpp_rata2: number
  nilai_persediaan: number
  perlu_restock: boolean
}

export interface VKartuStok {
  id: number
  tanggal: string
  produk_id: string
  kode_produk: string
  nama_produk: string
  gudang_id: string
  nama_gudang: string
  jenis: JenisMutasiStok
  ref_nomor: string | null
  masuk: number
  keluar: number
  saldo: number
  hpp_satuan: number | null
  nilai: number
  catatan: string | null
}

export interface VPiutang {
  faktur_id: string
  nomor: string
  tanggal: string
  jatuh_tempo: string
  pelanggan_id: string
  kode_pelanggan: string
  nama_pelanggan: string
  sales_id: string | null
  nama_sales: string | null
  total: number
  terbayar: number
  sisa: number
  hari_lewat: number
  bucket_umur: 'belum_jatuh_tempo' | '1-30' | '31-60' | '61-90' | '90+'
}

export interface VPiutangAging {
  pelanggan_id: string
  nama_pelanggan: string
  total_piutang: number
  belum_jatuh_tempo: number | null
  umur_1_30: number | null
  umur_31_60: number | null
  umur_61_90: number | null
  umur_90_plus: number | null
}

/** Segmen RFM pelanggan -- dihitung otomatis di view `v_pelanggan_crm` (0019). */
export type SegmenPelanggan = 'juara' | 'setia' | 'baru' | 'mulai_hilang' | 'tidur' | 'belum_pernah'

export interface VPelangganCrm {
  pelanggan_id: string
  kode: string
  nama: string
  tipe: TipePelanggan
  telepon: string | null
  whatsapp: string | null
  sales_id: string | null
  aktif: boolean
  akun_agregat: boolean
  jumlah_transaksi: number
  total_belanja: number
  rata_belanja: number
  terakhir_order: string | null
  pertama_order: string | null
  hari_sejak_order: number | null
  segmen: SegmenPelanggan
}

export interface VProdukFavoritPelanggan {
  pelanggan_id: string
  produk_id: string
  kode_produk: string
  nama_produk: string
  total_qty_dasar: number
  total_nilai: number
  jumlah_faktur: number
}

export interface VPelangganRingkas {
  pelanggan_id: string
  kode: string
  nama: string
  tipe: TipePelanggan
  kontak_nama: string | null
  sales_nama: string | null
  telepon: string | null
  whatsapp: string | null
  email: string | null
  sumber: SumberPelanggan | null
  sumber_custom: string | null
  tanggal_lahir: string | null
  sosial_media: string | null
  alamat_lengkap: string | null
}

export interface PembeliMarketplace {
  id: string
  kanal: Extract<KanalPenjualan, 'shopee' | 'tiktok'>
  /** Kunci dedup -- telepon ternormalisasi kalau ada, kalau tidak jatuh ke username/nama (lihat 0025). */
  kunci: string
  telepon: string | null
  nama: string | null
  alamat: string | null
  diedit_manual: boolean
  jumlah_pesanan: number
  total_belanja: number
  pesanan_terakhir: string | null
  catatan: string | null
  /** Diisi begitu "dijadikan Pelanggan" di Master Data -- lihat 0028. Baris jadi read-only kalau ini terisi. */
  pelanggan_id: string | null
  created_at: string
  updated_at: string
}

export type StatusTiket = 'terbuka' | 'diproses' | 'selesai' | 'dibatalkan'
export type PrioritasTiket = 'rendah' | 'sedang' | 'tinggi'

/** Komplain/retur pelanggan yang dilacak sampai tuntas -- lihat 0031. */
export interface Tiket {
  id: string
  nomor: string
  tanggal: string
  pelanggan_id: string
  faktur_id: string | null
  judul: string
  deskripsi: string | null
  status: StatusTiket
  prioritas: PrioritasTiket
  ditugaskan_ke: string | null
  dibuat_oleh: string | null
  created_at: string
  updated_at: string
}

/** Log "Tandai Selesai" di Tugas Follow-Up -- lihat 0029. entitas_id polymorphic (bukan FK). */
export interface RiwayatFollowUp {
  id: string
  tugas_id: string
  kategori: string
  entitas_tipe: 'pelanggan' | 'pembeli_marketplace'
  entitas_id: string
  nama: string | null
  catatan: string | null
  selesai_oleh: string | null
  selesai_pada: string
}

/** Pelanggan (non-agregat) dengan minimal 1 faktur per bulan kalender -- lihat 0030. */
export interface VPelangganAktifBulanan {
  bulan: string
  jumlah_pelanggan_aktif: number
}

/** Riwayat otomatis dari kolom `catatan` yang berubah -- lihat 0032. entitas_id polymorphic (bukan FK). */
export interface CatatanRiwayat {
  id: string
  entitas_tipe: 'pelanggan' | 'pembeli_marketplace'
  entitas_id: string
  isi: string
  dibuat_oleh: string | null
  created_at: string
}

export interface VLabaProduk {
  produk_id: string
  kode_produk: string
  nama_produk: string
  qty_terjual: number
  omzet: number
  hpp: number
  laba_kotor: number
  margin_persen: number
}

export interface VLabaPelanggan {
  pelanggan_id: string
  nama_pelanggan: string
  jumlah_faktur: number
  omzet: number
  hpp: number
  laba_kotor: number
  margin_persen: number
}

export interface VPenjualanHarian {
  tanggal: string
  jumlah_faktur: number
  omzet: number
  laba_kotor: number
}

export interface VSaldoKasBank {
  akun_id: string
  kode: string
  nama: string
  jenis: JenisAkunKas
  bank_nama: string | null
  nomor_rekening: string | null
  atas_nama: string | null
  aktif: boolean
  saldo_awal: number
  saldo: number
}

export interface VKartuKasBank {
  ref_id: string
  jenis: 'penerimaan_kas' | 'pembayaran_supplier'
  tanggal: string
  akun_id: string
  kode_akun: string
  nama_akun: string
  ref_nomor: string
  masuk: number
  keluar: number
  catatan: string | null
  saldo: number
}
