import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tanggal as fmtTanggal } from '@/lib/format'
import { Button, Spinner, PesanError } from '@/components/ui'

interface SJCetakDetail {
  id: string
  nomor: string
  tanggal: string
  alamat_kirim: string | null
  nama_penerima: string | null
  telepon_penerima: string | null
  ekspedisi: string | null
  nomor_kendaraan: string | null
  nama_sopir: string | null
  catatan: string | null
  pelanggan: { nama: string; kode: string; telepon: string | null; whatsapp: string | null } | null
  gudang: { nama: string } | null
  so: { nomor: string } | null
}

interface SJCetakItem {
  id: string
  qty: number
  produk: { nama: string; kode: string } | null
  satuan: { kode: string } | null
}

export function SuratJalanCetak() {
  const { id } = useParams<{ id: string }>()

  const { data: sj, isLoading, error } = useQuery({
    queryKey: ['surat-jalan-cetak', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surat_jalan')
        .select(
          'id, nomor, tanggal, alamat_kirim, nama_penerima, telepon_penerima, ekspedisi, nomor_kendaraan, nama_sopir, catatan, ' +
            'pelanggan:pelanggan_id(nama, kode, telepon, whatsapp), gudang:gudang_id(nama), so:so_id(nomor)',
        )
        .eq('id', id as string)
        .single()
      if (error) throw error
      return data as unknown as SJCetakDetail
    },
  })

  const { data: items } = useQuery({
    queryKey: ['surat-jalan-cetak-item', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surat_jalan_item')
        .select('id, qty, produk:produk_id(nama, kode), satuan:satuan_id(kode)')
        .eq('sj_id', id as string)
      if (error) throw error
      return (data ?? []) as unknown as SJCetakItem[]
    },
    enabled: !!sj,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <PesanError error={error} />
      </div>
    )
  }
  if (!sj) return null

  const kontak = sj.pelanggan?.whatsapp || sj.pelanggan?.telepon

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-white p-6 text-black print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Button variant="outline" asChild>
          <Link to={`/surat-jalan/${sj.id}`}>
            <ArrowLeft className="h-4 w-4" />
            Kembali
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Cetak
        </Button>
      </div>

      <div className="space-y-6 border border-border p-8 print:border-0 print:p-0">
        <div className="flex items-start justify-between border-b border-black pb-4">
          <div className="flex items-center gap-3">
            <img src="/ayyubi-logo.jpeg" alt="Ayyubi Food" className="h-12 w-12 rounded object-cover" />
            <div>
              <p className="text-lg font-bold">Ayyubi Finance</p>
              <p className="text-xs text-gray-600">Dagang &amp; Distribusi</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold uppercase tracking-wide">Surat Jalan</p>
            <p className="font-mono text-sm">{sj.nomor}</p>
            <p className="text-sm text-gray-600">{fmtTanggal(sj.tanggal)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Kepada</p>
            <p className="font-semibold">{sj.pelanggan?.nama ?? '-'}</p>
            {sj.nama_penerima ? <p>Penerima: {sj.nama_penerima}</p> : null}
            {sj.telepon_penerima ?? kontak ? <p>Telepon/WA: {sj.telepon_penerima ?? kontak}</p> : null}
            {sj.alamat_kirim ? <p className="whitespace-pre-line">{sj.alamat_kirim}</p> : null}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Pengiriman</p>
            <p>Gudang asal: {sj.gudang?.nama ?? '-'}</p>
            {sj.so ? <p>Sales Order: {sj.so.nomor}</p> : null}
            {sj.ekspedisi ? <p>Ekspedisi: {sj.ekspedisi}</p> : null}
            {sj.nomor_kendaraan ? <p>No. kendaraan: {sj.nomor_kendaraan}</p> : null}
            {sj.nama_sopir ? <p>Sopir: {sj.nama_sopir}</p> : null}
          </div>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="py-1 pr-2">No.</th>
              <th className="py-1 pr-2">Produk</th>
              <th className="py-1 pr-2">Kode</th>
              <th className="py-1 pr-2 text-right">Qty</th>
              <th className="py-1">Satuan</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((it, i) => (
              <tr key={it.id} className="border-b border-gray-300">
                <td className="py-1 pr-2">{i + 1}</td>
                <td className="py-1 pr-2">{it.produk?.nama}</td>
                <td className="py-1 pr-2 font-mono text-xs">{it.produk?.kode}</td>
                <td className="py-1 pr-2 text-right">{it.qty}</td>
                <td className="py-1">{it.satuan?.kode}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {sj.catatan ? (
          <p className="text-sm">
            <span className="font-semibold">Catatan: </span>
            {sj.catatan}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-6 pt-8 text-center text-sm">
          <div>
            <p>Pengirim,</p>
            <div className="mt-16 border-t border-black pt-1">( &nbsp; )</div>
          </div>
          <div>
            <p>Penerima,</p>
            <div className="mt-16 border-t border-black pt-1">( &nbsp; )</div>
          </div>
        </div>
      </div>
    </div>
  )
}
