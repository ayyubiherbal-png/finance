import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { OpsiCombobox } from '@/components/Combobox'
import type {
  Gudang,
  TierHarga,
  ProdukSatuan,
  AkunKasBank,
  WilayahProvinsi,
  WilayahKabupatenKota,
  WilayahKecamatan,
  WilayahKelurahan,
} from '@/types/db'

/**
 * Gudang aktif. Dipakai untuk selector "pintar": kalau cuma ada satu
 * gudang aktif, form transaksi otomatis memilihnya dan menyembunyikan
 * dropdown -- baru muncul begitu Anda menambah gudang kedua.
 */
export function useGudangAktif() {
  return useQuery({
    queryKey: ['gudang-aktif'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gudang')
        .select('id, kode, nama, alamat, utama, aktif')
        .eq('aktif', true)
        .order('utama', { ascending: false })
        .order('nama')
        .returns<Gudang[]>()
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60_000,
  })
}

/** Akun kas/bank aktif -- untuk selector wajib di Penerimaan Kas & Pembayaran Supplier. */
export function useAkunKasBankAktif() {
  return useQuery({
    queryKey: ['akun-kas-bank-aktif'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('akun_kas_bank')
        .select('id, kode, nama, jenis, bank_nama, nomor_rekening, atas_nama, saldo_awal, aktif, catatan')
        .eq('aktif', true)
        .order('jenis')
        .order('nama')
        .returns<AkunKasBank[]>()
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })
}

export function useTierHarga() {
  return useQuery({
    queryKey: ['tier-harga'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tier_harga')
        .select('id, kode, nama, urutan, jadi_default, aktif')
        .eq('aktif', true)
        .order('urutan')
        .returns<TierHarga[]>()
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60_000,
  })
}

/** Daftar satuan yang tersedia untuk satu produk (dasar + berjenjang), urut sesuai `urutan`. */
export function useProdukSatuan(produkId: string | null) {
  return useQuery({
    queryKey: ['produk-satuan', produkId],
    queryFn: async () => {
      if (!produkId) return []
      const { data, error } = await supabase
        .from('produk_satuan')
        .select('id, produk_id, satuan_id, konversi, barcode, urutan, satuan:satuan_id(id, kode, nama)')
        .eq('produk_id', produkId)
        .order('urutan')
      if (error) throw error
      return (data ?? []) as unknown as (ProdukSatuan & { satuan: { id: string; kode: string; nama: string } })[]
    },
    enabled: !!produkId,
    staleTime: 60_000,
  })
}

/** Harga jual berlaku untuk kombinasi produk + tier + satuan + qty, lewat RPC harga_produk(). */
export async function ambilHargaJual(params: {
  produkId: string
  tierId: string
  satuanId: string
  qty: number
  tanggal: string
}) {
  const { data, error } = await supabase.rpc('harga_produk', {
    p_produk: params.produkId,
    p_tier: params.tierId,
    p_satuan: params.satuanId,
    p_qty: params.qty,
    p_tanggal: params.tanggal,
  })
  if (error) throw error
  return (data as number | null) ?? null
}

/* ---------- Pencarian untuk Combobox (produk & pelanggan) ---------- */

export async function cariProduk(kueri: string): Promise<OpsiCombobox[]> {
  let q = supabase.from('produk').select('id, kode, nama').eq('aktif', true).order('nama').limit(20)
  if (kueri.trim()) q = q.or(`nama.ilike.%${kueri.trim()}%,kode.ilike.%${kueri.trim()}%`)
  const { data } = await q
  return (data ?? []).map((p) => ({ value: p.id, label: p.nama, sublabel: p.kode }))
}

export async function cariPelanggan(kueri: string): Promise<OpsiCombobox[]> {
  let q = supabase.from('pelanggan').select('id, kode, nama').eq('aktif', true).order('nama').limit(20)
  if (kueri.trim()) q = q.or(`nama.ilike.%${kueri.trim()}%,kode.ilike.%${kueri.trim()}%`)
  const { data } = await q
  return (data ?? []).map((p) => ({ value: p.id, label: p.nama, sublabel: p.kode }))
}

export async function cariSupplier(kueri: string): Promise<OpsiCombobox[]> {
  let q = supabase.from('supplier').select('id, kode, nama').eq('aktif', true).order('nama').limit(20)
  if (kueri.trim()) q = q.or(`nama.ilike.%${kueri.trim()}%,kode.ilike.%${kueri.trim()}%`)
  const { data } = await q
  return (data ?? []).map((s) => ({ value: s.id, label: s.nama, sublabel: s.kode }))
}

/* ---------- Wilayah administratif (Provinsi -> Kab/Kota -> Kecamatan -> Kelurahan) ---------- */
/** Dropdown berjenjang: tiap level baru aktif (`enabled`) setelah level di atasnya dipilih. */

export function useWilayahProvinsi() {
  return useQuery({
    queryKey: ['wilayah-provinsi'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wilayah_provinsi')
        .select('kode, nama')
        .order('nama')
        .returns<WilayahProvinsi[]>()
      if (error) throw error
      return data ?? []
    },
    staleTime: Infinity, // data referensi statis, tidak pernah berubah dari aplikasi
  })
}

export function useWilayahKabupatenKota(provinsiKode: string | null) {
  return useQuery({
    queryKey: ['wilayah-kabkota', provinsiKode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wilayah_kabupaten_kota')
        .select('kode, provinsi_kode, nama')
        .eq('provinsi_kode', provinsiKode as string)
        .order('nama')
        .returns<WilayahKabupatenKota[]>()
      if (error) throw error
      return data ?? []
    },
    enabled: !!provinsiKode,
    staleTime: Infinity,
  })
}

export function useWilayahKecamatan(kabupatenKode: string | null) {
  return useQuery({
    queryKey: ['wilayah-kecamatan', kabupatenKode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wilayah_kecamatan')
        .select('kode, kabupaten_kode, nama')
        .eq('kabupaten_kode', kabupatenKode as string)
        .order('nama')
        .returns<WilayahKecamatan[]>()
      if (error) throw error
      return data ?? []
    },
    enabled: !!kabupatenKode,
    staleTime: Infinity,
  })
}

export function useWilayahKelurahan(kecamatanKode: string | null) {
  return useQuery({
    queryKey: ['wilayah-kelurahan', kecamatanKode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wilayah_kelurahan')
        .select('kode, kecamatan_kode, nama, kode_pos')
        .eq('kecamatan_kode', kecamatanKode as string)
        .order('nama')
        .returns<WilayahKelurahan[]>()
      if (error) throw error
      return data ?? []
    },
    enabled: !!kecamatanKode,
    staleTime: Infinity,
  })
}

/**
 * Filter lokal atas daftar wilayah yang sudah dimuat penuh (staleTime:
 * Infinity di hook-hook di atas) -- untuk dipakai sebagai `cariOpsi`
 * Combobox tanpa perlu query baru tiap ketikan. Dipakai di form
 * Pelanggan & Supplier (alamat berjenjang).
 */
export function buatCariWilayah<T extends { kode: string; nama: string }>(
  daftar: T[] | undefined,
  sublabel?: (item: T) => string | undefined,
) {
  return async (kueri: string): Promise<OpsiCombobox[]> => {
    const q = kueri.trim().toLowerCase()
    const list = daftar ?? []
    const hasil = q ? list.filter((w) => w.nama.toLowerCase().includes(q)) : list
    const opsi = hasil.map((w) => ({ value: w.kode, label: w.nama, sublabel: sublabel?.(w) }))
    return q ? opsi : [{ value: '', label: '- (kosongkan)' }, ...opsi]
  }
}
