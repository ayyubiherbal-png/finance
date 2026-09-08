import { useMemo, useState } from 'react'
import { tt } from '@/lib/i18n'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, angka } from '@/lib/format'
import { cn } from '@/lib/utils'
import { GrafikBatang } from '@/components/Charts'
import { Card, CardContent, CardHeader, CardTitle, KondisiKosong, PesanError, Spinner, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'

const NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

type ModePeriode = 'bulan' | 'kuartal' | 'tahun'

const LABEL_MODE: Record<ModePeriode, string> = { bulan: 'Per Bulan', kuartal: 'Per Kuartal', tahun: 'Per Tahun' }
const LABEL_SATUAN: Record<ModePeriode, string> = { bulan: 'bulan', kuartal: 'kuartal', tahun: 'tahun' }

interface BarisHarian {
  tanggal: string
  jumlah_faktur: number
  omzet: number
  laba_kotor: number
}

interface BarisPeriode {
  kunci: string
  label: string
  jumlah_faktur: number
  omzet: number
  laba_kotor: number
}

/**
 * Mengelompokkan omzet harian (dari v_penjualan_harian, sudah otomatis
 * di luar faktur yang dibatalkan) jadi per bulan/kuartal/tahun. Murni
 * kalkulasi tanggal di JS -- tidak perlu view SQL baru, `tanggal` sudah
 * cukup untuk menurunkan ketiga level pengelompokan ini.
 */
function kelompokkanPeriode(harian: BarisHarian[], mode: ModePeriode): BarisPeriode[] {
  const peta = new Map<string, BarisPeriode>()
  for (const h of harian) {
    const d = new Date(h.tanggal)
    const tahun = d.getFullYear()
    const bulan = d.getMonth() // 0-11
    let kunci: string
    let label: string
    if (mode === 'bulan') {
      kunci = `${tahun}-${String(bulan + 1).padStart(2, '0')}`
      label = `${NAMA_BULAN[bulan]} ${String(tahun).slice(2)}`
    } else if (mode === 'kuartal') {
      const q = Math.floor(bulan / 3) + 1
      kunci = `${tahun}-Q${q}`
      label = `Q${q} ${tahun}`
    } else {
      kunci = `${tahun}`
      label = `${tahun}`
    }
    const ada = peta.get(kunci)
    if (ada) {
      ada.jumlah_faktur += h.jumlah_faktur
      ada.omzet += Number(h.omzet)
      ada.laba_kotor += Number(h.laba_kotor)
    } else {
      peta.set(kunci, { kunci, label, jumlah_faktur: h.jumlah_faktur, omzet: Number(h.omzet), laba_kotor: Number(h.laba_kotor) })
    }
  }
  return [...peta.values()].sort((a, b) => a.kunci.localeCompare(b.kunci))
}

function useOmzetHarian() {
  return useQuery({
    queryKey: ['laporan-omzet-harian'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_penjualan_harian')
        .select('tanggal, jumlah_faktur, omzet, laba_kotor')
        .order('tanggal', { ascending: true })
        .limit(3660) // ~10 tahun data harian -- cukup lega, tetap dibatasi biar tidak runaway
        .returns<BarisHarian[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

export function LaporanOmzet() {
  const [mode, setMode] = useState<ModePeriode>('bulan')
  const { data: harian, isLoading, error } = useOmzetHarian()

  const kelompok = useMemo(() => (harian ? kelompokkanPeriode(harian, mode) : []), [harian, mode])
  const terakhir = kelompok[kelompok.length - 1] ?? null
  const sebelum = kelompok.length >= 2 ? kelompok[kelompok.length - 2]! : null
  const deltaPersen = sebelum && sebelum.omzet > 0 && terakhir ? ((terakhir.omzet - sebelum.omzet) / sebelum.omzet) * 100 : null

  const totalOmzet = kelompok.reduce((t, k) => t + k.omzet, 0)
  const totalLaba = kelompok.reduce((t, k) => t + k.laba_kotor, 0)
  const marginKeseluruhan = totalOmzet > 0 ? (totalLaba / totalOmzet) * 100 : 0

  // Tabel ditampilkan terbaru dulu (konsisten dengan daftar transaksi lain),
  // tapi grafik & perhitungan delta tetap pakai urutan kronologis dari `kelompok`.
  const kelompokTerbaruDulu = [...kelompok].reverse()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{tt('Laporan Omzet')}</h1>
        <p className="text-sm text-muted-foreground">
          {tt('Omzet & laba kotor dari seluruh Faktur Penjualan (di luar yang dibatalkan), dikelompokkan per periode')}
        </p>
      </div>

      <div className="inline-flex rounded-md border border-border p-0.5">
        {(['bulan', 'kuartal', 'tahun'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'cursor-pointer rounded px-3 py-1.5 text-sm font-medium transition-colors',
              mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {LABEL_MODE[m]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : error ? (
        <PesanError error={error} />
      ) : kelompok.length === 0 ? (
        <KondisiKosong pesan="Belum ada penjualan tercatat." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KartuAngka
              judul={`Omzet ${terakhir?.label ?? '-'}`}
              nilai={rupiah(terakhir?.omzet ?? 0)}
              delta={deltaPersen}
              deltaKeterangan={`vs ${sebelum?.label ?? LABEL_SATUAN[mode] + ' sebelumnya'}`}
            />
            <KartuAngka judul={`Laba kotor ${terakhir?.label ?? '-'}`} nilai={rupiah(terakhir?.laba_kotor ?? 0)} />
            <KartuAngka judul={`Total omzet (${kelompok.length} ${LABEL_SATUAN[mode]})`} nilai={rupiah(totalOmzet)} />
            <KartuAngka judul={`Total laba kotor (${kelompok.length} ${LABEL_SATUAN[mode]})`} nilai={rupiah(totalLaba)} />
            <KartuAngka judul={`Margin keseluruhan`} nilai={`${marginKeseluruhan.toFixed(1)}%`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Omzet {LABEL_MODE[mode].toLowerCase()}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <GrafikBatang data={kelompok.map((k) => ({ label: k.label, nilai: k.omzet }))} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0 pb-2">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Periode</Th>
                    <Th className="text-right">Jml Faktur</Th>
                    <Th className="text-right">Omzet</Th>
                    <Th className="text-right">Laba Kotor</Th>
                    <Th className="text-right">Margin</Th>
                    <Th className="text-right">vs Periode Sebelumnya</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {kelompokTerbaruDulu.map((k, idxTerbaruDulu) => {
                    const idxKronologis = kelompok.length - 1 - idxTerbaruDulu
                    const before = idxKronologis > 0 ? kelompok[idxKronologis - 1] : null
                    const delta = before && before.omzet > 0 ? ((k.omzet - before.omzet) / before.omzet) * 100 : null
                    const margin = k.omzet > 0 ? (k.laba_kotor / k.omzet) * 100 : 0
                    return (
                      <Tr key={k.kunci}>
                        <Td className="font-medium">{k.label}</Td>
                        <Td className="tabular text-right">{angka(k.jumlah_faktur)}</Td>
                        <Td className="tabular text-right font-medium">{rupiah(k.omzet)}</Td>
                        <Td className="tabular text-right">{rupiah(k.laba_kotor)}</Td>
                        <Td className={cn('tabular text-right', margin < 0 && 'text-destructive')}>{margin.toFixed(1)}%</Td>
                        <Td className="text-right">
                          {delta === null ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            <span
                              className={cn(
                                'inline-flex items-center gap-0.5 text-xs font-medium',
                                delta >= 0 ? 'text-emerald-600' : 'text-destructive',
                              )}
                            >
                              {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                              {Math.abs(delta).toFixed(1)}%
                            </span>
                          )}
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function KartuAngka({
  judul,
  nilai,
  delta,
  deltaKeterangan,
}: {
  judul: string
  nilai: string
  delta?: number | null
  deltaKeterangan?: string
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{judul}</p>
        <p className="tabular mt-1 text-lg font-semibold">{nilai}</p>
        {delta !== undefined && delta !== null ? (
          <span
            className={cn(
              'mt-0.5 inline-flex items-center gap-0.5 text-xs font-medium',
              delta >= 0 ? 'text-emerald-600' : 'text-destructive',
            )}
          >
            {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}% {deltaKeterangan}
          </span>
        ) : null}
      </CardContent>
    </Card>
  )
}
