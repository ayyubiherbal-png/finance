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

interface RekeningBayar {
  nama: string
  bank_nama: string | null
  nomor_rekening: string | null
  atas_nama: string | null
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

  const { data: rekening } = useQuery({
    queryKey: ['faktur-cetak-rekening'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('akun_kas_bank')
        .select('nama, bank_nama, nomor_rekening, atas_nama')
        .eq('jenis', 'bank')
        .eq('aktif', true)
        .order('nama')
      if (error) throw error
      return (data ?? []) as RekeningBayar[]
    },
    enabled: !!faktur && faktur.sisa > 0,
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
    <div className="mx-auto min-h-screen bg-white p-6 text-black print:p-0">
      {/* Ukuran kertas A4 -- invoice/dokumen formal. */}
      <style>{`@media print { @page { size: A4; margin: 15mm; } }`}</style>

      <div className="mx-auto mb-4 flex w-[210mm] items-center justify-between print:hidden">
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

      <div className="mx-auto w-[210mm] overflow-hidden border border-border print:w-auto print:border-0">
        <div className="h-2 bg-primary" />

        <div className="space-y-6 p-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <img src="/ayyubi-logo.jpeg" alt="Ayyubi Food" className="h-14 w-14 rounded object-cover" />
              <p className="font-semibold text-gray-700">Ayyubi Finance</p>
            </div>
            <p className="text-3xl font-bold uppercase tracking-wide text-primary">Invoice</p>
          </div>

          <div className="grid grid-cols-3 gap-4 border-y border-gray-200 py-4 text-sm">
            <div>
              <p className="text-xs uppercase text-gray-500">No. Invoice</p>
              <p className="font-mono font-semibold">{faktur.nomor}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">Tanggal / Jatuh tempo</p>
              <p className="font-semibold">
                {fmtTanggal(faktur.tanggal)} &middot; {fmtTanggal(faktur.jatuh_tempo)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">Ditagihkan kepada</p>
              <p className="font-semibold">{p?.nama ?? '-'}</p>
              {kontak ? <p className="text-xs text-gray-600">{kontak}</p> : null}
              {alamatLengkap ? <p className="text-xs text-gray-600">{alamatLengkap}</p> : null}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md bg-muted px-4 py-3">
            <span className="text-sm font-medium text-gray-600">Status pembayaran</span>
            <span className="text-lg font-bold uppercase text-primary">{LABEL_BAYAR[faktur.status_bayar]}</span>
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-primary text-left text-primary-foreground">
                <th className="rounded-l-md py-2 pl-3">Produk</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2">Satuan</th>
                <th className="py-2 text-right">Harga</th>
                <th className="py-2 text-right">Disk.%</th>
                <th className="rounded-r-md py-2 pr-3 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((it, i) => (
                <tr key={it.id} className={i % 2 === 1 ? 'bg-muted/50' : undefined}>
                  <td className="py-2 pl-3">
                    {it.produk?.nama}
                    <span className="ml-1 font-mono text-xs text-gray-500">{it.produk?.kode}</span>
                  </td>
                  <td className="py-2 text-right">{it.qty}</td>
                  <td className="py-2">{it.satuan?.kode}</td>
                  <td className="py-2 text-right">{rupiah(it.harga_satuan)}</td>
                  <td className="py-2 text-right">{it.diskon_persen > 0 ? `${it.diskon_persen}%` : '-'}</td>
                  <td className="py-2 pr-3 text-right">{rupiah(it.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{rupiah(faktur.subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Sudah dibayar</span>
                <span>{rupiah(faktur.terbayar)}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-primary px-3 py-2 text-base font-bold text-primary-foreground">
                <span>Total</span>
                <span>{rupiah(faktur.total)}</span>
              </div>
              {faktur.sisa > 0 ? (
                <div className="flex justify-between font-semibold text-destructive">
                  <span>Sisa tagihan</span>
                  <span>{rupiah(faktur.sisa)}</span>
                </div>
              ) : null}
            </div>
          </div>

          {faktur.catatan ? (
            <p className="text-sm">
              <span className="font-semibold">Catatan: </span>
              {faktur.catatan}
            </p>
          ) : null}

          <div className="flex justify-between gap-6 border-t border-gray-200 pt-6 text-sm">
            {rekening && rekening.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Informasi Rekening Pembayaran</p>
                <div className="space-y-2">
                  {rekening.map((r) => (
                    <div key={r.nama}>
                      <p className="font-semibold">{r.bank_nama || r.nama}</p>
                      <p className="text-gray-600">
                        {r.nomor_rekening} a.n. {r.atas_nama}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="ml-auto text-center">
              <p>Hormat kami,</p>
              <div className="mt-12 border-t border-gray-400 pt-1">Ayyubi Finance</div>
            </div>
          </div>

          <p className="border-t border-gray-200 pt-4 text-center text-xs text-gray-500">
            Terima kasih atas kepercayaan Anda berbelanja di Ayyubi Finance.
          </p>
        </div>
      </div>
    </div>
  )
}
