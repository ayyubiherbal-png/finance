import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Spinner, PesanError } from '@/components/ui'
import { LabelSuratJalan, type SJCetakDetail, type SJCetakItem } from '@/components/LabelSuratJalan'

/**
 * Cetak banyak label A6 sekaligus dalam SATU print job -- untuk hari
 * dengan puluhan/ratusan orderan, mencetak satu-satu (buka SJ, cetak,
 * kembali, ulangi) tidak masuk akal. Di sini cukup centang beberapa SJ
 * di daftar (lihat SuratJalan.tsx), klik "Cetak", dan dialog print
 * browser muncul SEKALI untuk semua label berurutan.
 *
 * @page berlaku sama untuk setiap halaman dalam satu print job, jadi
 * ukuran A6-nya tetap konsisten dari label pertama sampai terakhir.
 * Pemisah antar label pakai `break-after: page` (dengan fallback
 * `page-break-after`) di setiap kartu KECUALI yang terakhir, supaya
 * tidak ada halaman kosong nyasar di ujung.
 */
export function SuratJalanCetakMassal() {
  const [params] = useSearchParams()
  const ids = useMemo(
    () =>
      (params.get('id') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [params],
  )

  const { data: daftar, isLoading, error } = useQuery({
    queryKey: ['surat-jalan-cetak-massal', ids],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surat_jalan')
        .select(
          'id, nomor, tanggal, alamat_kirim, nama_penerima, telepon_penerima, ekspedisi, nomor_kendaraan, nama_sopir, catatan, ' +
            'pelanggan:pelanggan_id(nama, kode, telepon, whatsapp)',
        )
        .in('id', ids)
        .order('nomor')
      if (error) throw error
      return (data ?? []) as unknown as SJCetakDetail[]
    },
    enabled: ids.length > 0,
  })

  const { data: semuaItem } = useQuery({
    queryKey: ['surat-jalan-cetak-massal-item', ids],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surat_jalan_item')
        .select('id, sj_id, qty, produk:produk_id(nama, kode), satuan:satuan_id(kode)')
        .in('sj_id', ids)
      if (error) throw error
      return (data ?? []) as unknown as SJCetakItem[]
    },
    enabled: ids.length > 0,
  })

  if (ids.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <PesanError error={new Error('Tidak ada Surat Jalan yang dipilih.')} />
        <div className="mt-4">
          <Button variant="outline" asChild>
            <Link to="/surat-jalan">
              <ArrowLeft className="h-4 w-4" />
              Kembali ke daftar
            </Link>
          </Button>
        </div>
      </div>
    )
  }

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
  if (!daftar || daftar.length === 0) return null

  return (
    <div className="mx-auto min-h-screen bg-white p-4 text-black print:p-0">
      <style>{`
        @media print {
          @page { size: 105mm 148mm; margin: 4mm; }
        }
        .label-batch:not(:last-child) {
          break-after: page;
          page-break-after: always;
        }
      `}</style>

      <div className="mb-3 flex items-center justify-between print:hidden">
        <Button variant="outline" size="sm" asChild>
          <Link to="/surat-jalan">
            <ArrowLeft className="h-4 w-4" />
            Kembali
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">{daftar.length} label siap dicetak</p>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Cetak Semua
        </Button>
      </div>

      {daftar.map((sj) => (
        <div key={sj.id} className="label-batch">
          <LabelSuratJalan sj={sj} items={(semuaItem ?? []).filter((it) => it.sj_id === sj.id)} />
        </div>
      ))}
    </div>
  )
}
