import { useMemo, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, angka, tanggalISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { GrafikBatang } from '@/components/Charts'
import { Card, CardContent, CardHeader, CardTitle, KondisiKosong, PesanError, Spinner, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { TombolEkspor } from '@/components/TombolEkspor'
import type { KolomEkspor } from '@/lib/eksporData'

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

interface BarisBiayaHarian {
  tanggal: string
  total_keluar: number
}

interface BarisPeriode {
  kunci: string
  label: string
  jumlah_faktur: number
  omzet: number
  laba_kotor: number
  biaya_operasional: number
  laba_bersih: number
}

/** Turunkan kunci pengelompokan (buat sort kronologis) & label tampilan dari
 * satu tanggal, sesuai mode aktif -- dipakai untuk MENGGABUNGKAN dua sumber
 * data harian (omzet & biaya) ke peta periode yang sama. */
function kunciLabelPeriode(tanggalIso: string, mode: ModePeriode): { kunci: string; label: string } {
  const d = new Date(tanggalIso)
  const tahun = d.getFullYear()
  const bulan = d.getMonth() // 0-11
  if (mode === 'bulan') {
    return { kunci: `${tahun}-${String(bulan + 1).padStart(2, '0')}`, label: `${tt(NAMA_BULAN[bulan]!)} ${String(tahun).slice(2)}` }
  }
  if (mode === 'kuartal') {
    const q = Math.floor(bulan / 3) + 1
    return { kunci: `${tahun}-Q${q}`, label: `Q${q} ${tahun}` }
  }
  return { kunci: `${tahun}`, label: `${tahun}` }
}

/**
 * Mengelompokkan omzet & biaya harian (dari v_penjualan_harian &
 * v_pengeluaran_harian, keduanya sudah otomatis di luar dokumen yang
 * dibatalkan) jadi per bulan/kuartal/tahun. Murni kalkulasi tanggal di JS.
 * `biayaHarian` digabung terpisah (bukan join SQL) karena bisa saja ada
 * biaya tercatat di hari tanpa penjualan sama sekali (mis. bayar sewa di
 * awal bulan sebelum ada transaksi) -- periode itu tetap harus muncul.
 */
function kelompokkanPeriode(harian: BarisHarian[], biayaHarian: BarisBiayaHarian[], mode: ModePeriode): BarisPeriode[] {
  const peta = new Map<string, BarisPeriode>()
  for (const h of harian) {
    const { kunci, label } = kunciLabelPeriode(h.tanggal, mode)
    const ada = peta.get(kunci)
    if (ada) {
      ada.jumlah_faktur += h.jumlah_faktur
      ada.omzet += Number(h.omzet)
      ada.laba_kotor += Number(h.laba_kotor)
    } else {
      peta.set(kunci, {
        kunci,
        label,
        jumlah_faktur: h.jumlah_faktur,
        omzet: Number(h.omzet),
        laba_kotor: Number(h.laba_kotor),
        biaya_operasional: 0,
        laba_bersih: 0,
      })
    }
  }
  for (const b of biayaHarian) {
    const { kunci, label } = kunciLabelPeriode(b.tanggal, mode)
    const ada = peta.get(kunci)
    if (ada) {
      ada.biaya_operasional += Number(b.total_keluar)
    } else {
      peta.set(kunci, { kunci, label, jumlah_faktur: 0, omzet: 0, laba_kotor: 0, biaya_operasional: Number(b.total_keluar), laba_bersih: 0 })
    }
  }
  for (const v of peta.values()) v.laba_bersih = v.laba_kotor - v.biaya_operasional
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

function useBiayaHarian() {
  return useQuery({
    queryKey: ['laporan-omzet-biaya-harian'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_pengeluaran_harian')
        .select('tanggal, total_keluar')
        .order('tanggal', { ascending: true })
        .limit(3660)
        .returns<BarisBiayaHarian[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

export function LaporanOmzet() {
  const [mode, setMode] = useState<ModePeriode>('bulan')
  const { data: harian, isLoading, error } = useOmzetHarian()
  const { data: biayaHarian, isLoading: isLoadingBiaya, error: errorBiaya } = useBiayaHarian()

  const kelompok = useMemo(
    () => (harian ? kelompokkanPeriode(harian, biayaHarian ?? [], mode) : []),
    [harian, biayaHarian, mode],
  )
  const terakhir = kelompok[kelompok.length - 1] ?? null
  const sebelum = kelompok.length >= 2 ? kelompok[kelompok.length - 2]! : null
  const deltaPersen = sebelum && sebelum.omzet > 0 && terakhir ? ((terakhir.omzet - sebelum.omzet) / sebelum.omzet) * 100 : null

  const totalOmzet = kelompok.reduce((t, k) => t + k.omzet, 0)
  const totalLaba = kelompok.reduce((t, k) => t + k.laba_kotor, 0)
  const totalBiaya = kelompok.reduce((t, k) => t + k.biaya_operasional, 0)
  const totalLabaBersih = totalLaba - totalBiaya
  const marginKeseluruhan = totalOmzet > 0 ? (totalLaba / totalOmzet) * 100 : 0

  // Tabel ditampilkan terbaru dulu (konsisten dengan daftar transaksi lain),
  // tapi grafik & perhitungan delta tetap pakai urutan kronologis dari `kelompok`.
  const kelompokTerbaruDulu = [...kelompok].reverse()

  const kolomEksporOmzet: KolomEkspor<BarisPeriode>[] = [
    { header: 'Periode', nilai: (r) => r.label },
    { header: 'Jml Faktur', nilai: (r) => r.jumlah_faktur, format: (v) => angka(v as number), rata: 'kanan' },
    { header: 'Omzet', nilai: (r) => r.omzet, format: (v) => rupiah(v as number), rata: 'kanan' },
    { header: 'Laba Kotor', nilai: (r) => r.laba_kotor, format: (v) => rupiah(v as number), rata: 'kanan' },
    { header: 'Biaya Operasional', nilai: (r) => r.biaya_operasional, format: (v) => rupiah(v as number), rata: 'kanan' },
    { header: 'Laba Bersih', nilai: (r) => r.laba_bersih, format: (v) => rupiah(v as number), rata: 'kanan' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Laporan Omzet')}</h1>
          <p className="text-sm text-muted-foreground">
            {tt('Omzet & laba kotor dari seluruh Faktur Penjualan (di luar yang dibatalkan), dikelompokkan per periode')}
          </p>
        </div>
        {kelompok.length > 0 ? (
          <TombolEkspor
            ambilData={async () => kelompokTerbaruDulu}
            kolom={kolomEksporOmzet}
            opsi={{ namaFile: `laporan-omzet-${mode}-${tanggalISO()}`, judul: tt('Laporan Omzet') }}
          />
        ) : null}
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
            {tt(LABEL_MODE[m])}
          </button>
        ))}
      </div>

      {isLoading || isLoadingBiaya ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : error || errorBiaya ? (
        <PesanError error={error ?? errorBiaya} />
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
            <KartuAngka judul={`Margin laba kotor`} nilai={`${marginKeseluruhan.toFixed(1)}%`} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <KartuAngka judul={`Total biaya operasional (${kelompok.length} ${LABEL_SATUAN[mode]})`} nilai={rupiah(totalBiaya)} />
            <KartuAngka judul={`Total laba bersih (${kelompok.length} ${LABEL_SATUAN[mode]})`} nilai={rupiah(totalLabaBersih)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{`${tt('Omzet')} ${tt(LABEL_MODE[mode]).toLowerCase()}`}</CardTitle>
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
                    <Th className="text-right">Biaya Operasional</Th>
                    <Th className="text-right">Laba Bersih</Th>
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
                        <Td className="tabular text-right text-muted-foreground">{rupiah(k.biaya_operasional)}</Td>
                        <Td className={cn('tabular text-right font-medium', k.laba_bersih < 0 && 'text-destructive')}>
                          {rupiah(k.laba_bersih)}
                        </Td>
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
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{tt(judul)}</p>
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
