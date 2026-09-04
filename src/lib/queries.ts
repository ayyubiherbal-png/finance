import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { OpsiCombobox } from '@/components/Combobox'
import type { Gudang, TierHarga, ProdukSatuan } from '@/types/db'

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
