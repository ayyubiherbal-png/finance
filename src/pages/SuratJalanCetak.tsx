import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Spinner, PesanError } from '@/components/ui'
import { LabelSuratJalan, type SJCetakDetail, type SJCetakItem } from '@/components/LabelSuratJalan'

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

      <LabelSuratJalan sj={sj} items={items ?? []} />
    </div>
  )
}
