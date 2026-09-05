import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggal as fmtTanggal } from '@/lib/format'
import { Button, Spinner, PesanError } from '@/components/ui'
import type { StatusBayar } from '@/types/db'

interface FakturCetakDetail {
  id: string
  nomor: string
  tanggal: string
  jatuh_tempo: string
  status_bayar: StatusBayar
  subtotal: number
  total: number
  terbayar: number
  sisa: number
  catatan: string | null
  pelanggan: {
    nama: string
    telepon: string | null
    whatsapp: string | null
    alamat: string | null
    kelurahan: { nama: string } | null
    kecamatan: { nama: string } | null
    kabupaten_kota: { nama: string } | null
    provinsi: { nama: string } | null
  } | null
}

interface FakturCetakItem {
  id: string
  qty: number
  harga_satuan: number
  diskon_persen: number
  subtotal: number
  produk: { nama: string; kode: string } | null
  satuan: { kode: string } | null
}

const LABEL_BAYAR: Record<StatusBayar, string> = {
  belum: 'Belum Bayar',
  sebagian: 'Bayar Sebagian',
  lunas: 'Lunas',
}

export function FakturPenjualanCetak() {
  const { id } = useParams<{ id: string }>()

  const { data: faktur, isLoading, error } = useQuery({
    queryKey: ['faktur-cetak', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('faktur_penjualan')
        .select(
          'id, nomor, tanggal, jatuh_tempo, status_bayar, subtotal, total, terbayar, sisa, catatan, ' +
            'pelanggan:pelanggan_id(nama, telepon, whatsapp, alamat, ' +
            'kelurahan:kelurahan_kode(nama), kecamatan:kecamatan_kode(nama), ' +
            'kabupaten_kota:kabupaten_kode(nama), provinsi:provinsi_kode(nama))',
        )
        .eq('id', id as string)
        .single()
      if (error) throw error
      return data as unknown as FakturCetakDetail
    },
  })

  const { data: items } = useQuery({
    queryKey: ['faktur-cetak-item', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('faktur_penjualan_item')
        .select('id, qty, harga_satuan, diskon_persen, subtotal, produk:produk_id(nama, kode), satuan:satuan_id(kode)')
        .eq('faktur_id', id as string)
        .order('urutan')
      if (error) throw error
      return (data ?? []) as unknown as FakturCetakItem[]
    },
    enabled: !!faktur,
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
  if (!faktur) return null

  const p = faktur.pelanggan
  const kontak = p?.whatsapp || p?.telepon
  const alamatLengkap = p
    ? [p.alamat, p.kelurahan?.nama, p.kecamatan?.nama, p.kabupaten_kota?.nama, p.provinsi?.nama].filter(Boolean).join(', ')
    : ''

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-white p-6 text-black print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Button variant="outline" asChild>
          <Link to={`/faktur-penjualan/${faktur.id}`}>
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
          <img src="/ayyubi-logo.jpeg" alt="Ayyubi Food" className="h-16 w-16 rounded object-cover" />
          <div className="text-right">
            <p className="text-2xl font-bold uppercase tracking-wide">Invoice</p>
            <p className="font-mono text-sm text-gray-600">{faktur.nomor}</p>
            <p className="text-sm text-gray-600">{fmtTanggal(faktur.tanggal)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Kepada</p>
            <p className="font-semibold">{p?.nama ?? '-'}</p>
            {kontak ? <p>Telepon/WA: {kontak}</p> : null}
            {alamatLengkap ? <p className="whitespace-pre-line">{alamatLengkap}</p> : null}
          </div>
          <div className="text-right">
            <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Jatuh tempo</p>
            <p>{fmtTanggal(faktur.jatuh_tempo)}</p>
            <p className="mt-2 text-base font-semibold">{LABEL_BAYAR[faktur.status_bayar]}</p>
          </div>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="py-1 pr-2">No.</th>
              <th className="py-1 pr-2">Produk</th>
              <th className="py-1 pr-2 text-right">Qty</th>
              <th className="py-1 pr-2">Satuan</th>
              <th className="py-1 pr-2 text-right">Harga</th>
              <th className="py-1 pr-2 text-right">Disk.%</th>
              <th className="py-1 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((it, i) => (
              <tr key={it.id} className="border-b border-gray-300">
                <td className="py-1 pr-2">{i + 1}</td>
                <td className="py-1 pr-2">
                  {it.produk?.nama}
                  <span className="ml-1 font-mono text-xs text-gray-500">{it.produk?.kode}</span>
                </td>
                <td className="py-1 pr-2 text-right">{it.qty}</td>
                <td className="py-1 pr-2">{it.satuan?.kode}</td>
                <td className="py-1 pr-2 text-right">{rupiah(it.harga_satuan)}</td>
                <td className="py-1 pr-2 text-right">{it.diskon_persen > 0 ? `${it.diskon_persen}%` : '-'}</td>
                <td className="py-1 text-right">{rupiah(it.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{rupiah(faktur.subtotal)}</span>
            </div>
            <div className="flex justify-between border-t border-black pt-1 text-base font-bold">
              <span>Total</span>
              <span>{rupiah(faktur.total)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Sudah dibayar</span>
              <span>{rupiah(faktur.terbayar)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Sisa tagihan</span>
              <span>{rupiah(faktur.sisa)}</span>
            </div>
          </div>
        </div>

        {faktur.catatan ? (
          <p className="text-sm">
            <span className="font-semibold">Catatan: </span>
            {faktur.catatan}
          </p>
        ) : null}
      </div>
    </div>
  )
}
