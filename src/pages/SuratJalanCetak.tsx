import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tanggal as fmtTanggal } from '@/lib/format'
import { Button, Spinner, PesanError } from '@/components/ui'

// Belum ada field untuk kontak toko di master data mana pun -- ditaruh
// di sini dulu (bukan dari database) sampai ada tempat pengaturan yang
// lebih semestinya kalau nanti dibutuhkan di tempat lain juga.
const NAMA_PENGIRIM = 'Ayyubi Finance'
const NOMOR_WA_PENGIRIM = '082211369433'

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
            'pelanggan:pelanggan_id(nama, kode, telepon, whatsapp)',
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
    <div className="mx-auto min-h-screen bg-white p-4 text-black print:p-0">
      {/* Ukuran kertas A6 (105 x 148mm) -- label pengiriman ringkas untuk
          ditempel/diserahkan ke jasa ekspedisi, bukan dokumen formal. */}
      <style>{`@media print { @page { size: 105mm 148mm; margin: 4mm; } }`}</style>

      <div className="mb-3 flex items-center justify-between print:hidden">
        <Button variant="outline" size="sm" asChild>
          <Link to={`/surat-jalan/${sj.id}`}>
            <ArrowLeft className="h-4 w-4" />
            Kembali
          </Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Cetak
        </Button>
      </div>

      <div className="mx-auto w-[105mm] space-y-2 border border-border p-3 text-xs print:border-0 print:p-0">
        <div className="flex items-start justify-between border-b border-black pb-2">
          <img src="/ayyubi-logo.jpeg" alt="Ayyubi Food" className="h-8 w-8 rounded object-cover" />
          <div className="text-right">
            <p className="font-mono text-sm font-bold">{sj.nomor}</p>
            {/* Belum ada aset logo ekspedisi -- tampil nama ekspedisi dulu
                sebagai teks. Kirim file logo JNE/J&T/dst. kalau mau
                diganti jadi gambar logo aslinya. */}
            <p className="font-semibold uppercase tracking-wide">{sj.ekspedisi || 'Ekspedisi'}</p>
            <p className="text-[10px] text-gray-600">{fmtTanggal(sj.tanggal)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="mb-0.5 text-[10px] font-semibold uppercase text-gray-500">Pengirim</p>
            <p className="font-semibold">{NAMA_PENGIRIM}</p>
            <p>No. WA: {NOMOR_WA_PENGIRIM}</p>
          </div>
          <div>
            <p className="mb-0.5 text-[10px] font-semibold uppercase text-gray-500">Penerima</p>
            <p className="font-semibold">{sj.nama_penerima || sj.pelanggan?.nama || '-'}</p>
            {sj.alamat_kirim ? <p className="whitespace-pre-line">{sj.alamat_kirim}</p> : null}
            {sj.telepon_penerima ?? kontak ? <p>No. WA: {sj.telepon_penerima ?? kontak}</p> : null}
          </div>
        </div>

        {sj.nomor_kendaraan ?? sj.nama_sopir ? (
          <p className="text-[10px] text-gray-600">
            {sj.nomor_kendaraan ? `No. kendaraan: ${sj.nomor_kendaraan}` : null}
            {sj.nomor_kendaraan && sj.nama_sopir ? ' · ' : null}
            {sj.nama_sopir ? `Sopir: ${sj.nama_sopir}` : null}
          </p>
        ) : null}

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="py-0.5 pr-1">Produk</th>
              <th className="py-0.5 pr-1 text-right">Qty</th>
              <th className="py-0.5">Satuan</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((it) => (
              <tr key={it.id} className="border-b border-gray-300">
                <td className="py-0.5 pr-1">{it.produk?.nama}</td>
                <td className="py-0.5 pr-1 text-right">{it.qty}</td>
                <td className="py-0.5">{it.satuan?.kode}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {sj.catatan ? (
          <p>
            <span className="font-semibold">Catatan: </span>
            {sj.catatan}
          </p>
        ) : null}
      </div>
    </div>
  )
}
