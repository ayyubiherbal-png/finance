import { useMemo, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rupiah } from '@/lib/format'
import { cn } from '@/lib/utils'
import { FilterPeriode, rentangDariPreset, type RentangTanggal } from '@/components/FilterPeriode'
import { TombolEkspor } from '@/components/TombolEkspor'
import type { KolomEkspor } from '@/lib/eksporData'
import { Card, CardContent, PesanError, Spinner } from '@/components/ui'
import type { BarisArusKas } from '@/types/db'

const LABEL_REF_TABEL: Record<string, string> = {
  penerimaan_kas: 'Penerimaan dari Pelanggan',
  pembayaran_supplier: 'Pembayaran ke Supplier',
  pengeluaran_kas: 'Pengeluaran Operasional Lainnya',
}
const LABEL_REF_TABEL_PENDANAAN: Record<string, string> = {
  pengeluaran_kas: 'Pengambilan Pribadi (Prive)',
}

function useArusKas(periode: RentangTanggal) {
  return useQuery({
    queryKey: ['arus-kas', periode],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_arus_kas', { p_dari: periode.dari, p_sampai: periode.sampai })
      if (error) throw error
      return (data ?? []) as BarisArusKas[]
    },
    enabled: !!periode.dari && !!periode.sampai,
  })
}

export function ArusKas() {
  const [periode, setPeriode] = useState<RentangTanggal>(() => rentangDariPreset('bulan_ini'))
  const { data, isLoading, error } = useArusKas(periode)

  const ringkasan = useMemo(() => {
    const baris = data ?? []
    const operasi = baris.filter((b) => b.kategori === 'operasi')
    const investasi = baris.filter((b) => b.kategori === 'investasi')
    const pendanaan = baris.filter((b) => b.kategori === 'pendanaan')
    const totalOperasi = operasi.reduce((t, b) => t + Number(b.arus_bersih), 0)
    const totalInvestasi = investasi.reduce((t, b) => t + Number(b.arus_bersih), 0)
    const totalPendanaan = pendanaan.reduce((t, b) => t + Number(b.arus_bersih), 0)
    return { operasi, investasi, pendanaan, totalOperasi, totalInvestasi, totalPendanaan, kenaikanBersih: totalOperasi + totalInvestasi + totalPendanaan }
  }, [data])

  const barisEkspor = [
    ...ringkasan.operasi.map((b) => ({ kategori: 'Operasi', label: LABEL_REF_TABEL[b.ref_tabel] ?? b.ref_tabel, nilai: Number(b.arus_bersih) })),
    { kategori: '', label: 'Total Arus Kas Operasi', nilai: ringkasan.totalOperasi },
    ...ringkasan.pendanaan.map((b) => ({ kategori: 'Pendanaan', label: LABEL_REF_TABEL_PENDANAAN[b.ref_tabel] ?? b.ref_tabel, nilai: Number(b.arus_bersih) })),
    { kategori: '', label: 'Total Arus Kas Pendanaan', nilai: ringkasan.totalPendanaan },
    { kategori: '', label: 'Kenaikan (Penurunan) Kas Bersih', nilai: ringkasan.kenaikanBersih },
  ]
  const kolomEkspor: KolomEkspor<(typeof barisEkspor)[number]>[] = [
    { header: 'Kategori', nilai: (r) => r.kategori },
    { header: 'Baris', nilai: (r) => r.label },
    { header: 'Jumlah', nilai: (r) => r.nilai, format: (v) => rupiah(v as number), rata: 'kanan' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Arus Kas')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Pergerakan kas & bank per periode -- Operasi, Investasi, Pendanaan')}</p>
        </div>
        <FilterPeriode onChange={setPeriode} presetAwal="bulan_ini" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : error ? (
        <PesanError error={error} />
      ) : (
        <>
          <Card>
            <CardContent className="space-y-1 p-4">
              <h2 className="pb-1 text-sm font-semibold">{tt('Arus Kas dari Aktivitas Operasi')}</h2>
              {ringkasan.operasi.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">{tt('Tidak ada arus kas operasi pada periode ini.')}</p>
              ) : (
                ringkasan.operasi.map((b) => (
                  <BarisArus key={b.ref_tabel} label={LABEL_REF_TABEL[b.ref_tabel] ?? b.ref_tabel} nilai={Number(b.arus_bersih)} />
                ))
              )}
              <BarisTotal label={tt('Kas Bersih dari Aktivitas Operasi')} nilai={ringkasan.totalOperasi} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-1 p-4">
              <h2 className="pb-1 text-sm font-semibold">{tt('Arus Kas dari Aktivitas Investasi')}</h2>
              {ringkasan.investasi.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">
                  {tt('Belum ada aktivitas investasi tercatat (mis. pembelian aset tetap) di sistem ini.')}
                </p>
              ) : (
                ringkasan.investasi.map((b) => <BarisArus key={b.ref_tabel} label={b.ref_tabel} nilai={Number(b.arus_bersih)} />)
              )}
              <BarisTotal label={tt('Kas Bersih dari Aktivitas Investasi')} nilai={ringkasan.totalInvestasi} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-1 p-4">
              <h2 className="pb-1 text-sm font-semibold">{tt('Arus Kas dari Aktivitas Pendanaan')}</h2>
              {ringkasan.pendanaan.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">{tt('Tidak ada arus kas pendanaan pada periode ini.')}</p>
              ) : (
                ringkasan.pendanaan.map((b) => (
                  <BarisArus key={b.ref_tabel} label={LABEL_REF_TABEL_PENDANAAN[b.ref_tabel] ?? b.ref_tabel} nilai={Number(b.arus_bersih)} />
                ))
              )}
              <BarisTotal label={tt('Kas Bersih dari Aktivitas Pendanaan')} nilai={ringkasan.totalPendanaan} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
              <span className="text-base font-bold">{tt('Kenaikan (Penurunan) Kas Bersih')}</span>
              <span className={cn('tabular text-lg font-bold', ringkasan.kenaikanBersih < 0 && 'text-destructive')}>
                {rupiah(ringkasan.kenaikanBersih)}
              </span>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <TombolEkspor
              ambilData={async () => barisEkspor}
              kolom={kolomEkspor}
              opsi={{ namaFile: `arus-kas-${periode.dari}-${periode.sampai}`, judul: tt('Arus Kas') }}
            />
          </div>
        </>
      )}
    </div>
  )
}

function BarisArus({ label, nilai }: { label: string; nilai: number }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('tabular', nilai < 0 && 'text-destructive')}>{rupiah(nilai)}</span>
    </div>
  )
}

function BarisTotal({ label, nilai }: { label: string; nilai: number }) {
  return (
    <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
      <span>{label}</span>
      <span className={cn('tabular', nilai < 0 && 'text-destructive')}>{rupiah(nilai)}</span>
    </div>
  )
}
