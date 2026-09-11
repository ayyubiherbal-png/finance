import { useMemo, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggalISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { FilterPeriode, rentangDariPreset, type RentangTanggal } from '@/components/FilterPeriode'
import { TombolEkspor } from '@/components/TombolEkspor'
import type { KolomEkspor } from '@/lib/eksporData'
import { Card, CardContent, PesanError, Spinner } from '@/components/ui'
import type { VPenjualanHarian } from '@/types/db'

interface BarisPengeluaranRaw {
  id: string
  tanggal: string
  jumlah: number
  kategori_id: string
  kode_kategori: string
  nama_kategori: string
  operasional: boolean
}
interface BarisBeban {
  kategoriId: string
  kodeKategori: string
  namaKategori: string
  operasional: boolean
  jumlah: number
}

/** Rentang dengan panjang yang sama persis sebelum `periode.dari` -- dipakai untuk delta Laba Bersih. */
function periodeSebelumnya(periode: RentangTanggal): RentangTanggal {
  if (!periode.dari || !periode.sampai) return { dari: null, sampai: null }
  const dari = new Date(periode.dari)
  const sampai = new Date(periode.sampai)
  const panjangHari = Math.round((sampai.getTime() - dari.getTime()) / 86_400_000) + 1
  const sampaiSebelumnya = new Date(dari)
  sampaiSebelumnya.setDate(sampaiSebelumnya.getDate() - 1)
  const dariSebelumnya = new Date(sampaiSebelumnya)
  dariSebelumnya.setDate(dariSebelumnya.getDate() - (panjangHari - 1))
  return { dari: tanggalISO(dariSebelumnya), sampai: tanggalISO(sampaiSebelumnya) }
}

function jumlahkanOmzet(baris: VPenjualanHarian[]) {
  return baris.reduce(
    (t, b) => ({
      omzet: t.omzet + Number(b.omzet),
      retur: t.retur + Number(b.retur),
      penjualanBersih: t.penjualanBersih + Number(b.penjualan_bersih),
      hpp: t.hpp + Number(b.hpp),
      labaKotor: t.labaKotor + Number(b.laba_kotor),
    }),
    { omzet: 0, retur: 0, penjualanBersih: 0, hpp: 0, labaKotor: 0 },
  )
}

function kelompokkanBeban(baris: BarisPengeluaranRaw[]) {
  const peta = new Map<string, BarisBeban>()
  let totalOperasional = 0
  let totalNonOperasional = 0
  for (const r of baris) {
    const jumlah = Number(r.jumlah)
    const ada = peta.get(r.kategori_id)
    if (ada) ada.jumlah += jumlah
    else
      peta.set(r.kategori_id, {
        kategoriId: r.kategori_id,
        kodeKategori: r.kode_kategori,
        namaKategori: r.nama_kategori,
        operasional: r.operasional,
        jumlah,
      })
    if (r.operasional) totalOperasional += jumlah
    else totalNonOperasional += jumlah
  }
  const daftar = [...peta.values()].sort((a, b) => a.kodeKategori.localeCompare(b.kodeKategori))
  return { daftar, totalOperasional, totalNonOperasional }
}

function useOmzetRentang(periode: RentangTanggal) {
  return useQuery({
    queryKey: ['laba-rugi-omzet', periode],
    queryFn: async () => {
      let q = supabase.from('v_penjualan_harian').select('tanggal, jumlah_faktur, omzet, laba_kotor, hpp, retur, penjualan_bersih')
      if (periode.dari) q = q.gte('tanggal', periode.dari)
      if (periode.sampai) q = q.lte('tanggal', periode.sampai)
      const { data, error } = await q.returns<VPenjualanHarian[]>()
      if (error) throw error
      return data ?? []
    },
    enabled: !!periode.dari && !!periode.sampai,
  })
}

function useBebanRentang(periode: RentangTanggal) {
  return useQuery({
    queryKey: ['laba-rugi-beban', periode],
    queryFn: async () => {
      // PostgREST membatasi respons per request (umumnya 1.000 baris).
      // Ambil per halaman supaya laporan periode panjang tidak diam-diam
      // kehilangan transaksi setelah batas tersebut.
      const ukuranHalaman = 1_000
      const semua: BarisPengeluaranRaw[] = []
      for (let mulai = 0; ; mulai += ukuranHalaman) {
        let q = supabase
          .from('v_beban_rinci')
          .select('id, tanggal, jumlah, kategori_id, kode_kategori, nama_kategori, operasional')
          .order('tanggal')
          .order('id')
          .range(mulai, mulai + ukuranHalaman - 1)
        if (periode.dari) q = q.gte('tanggal', periode.dari)
        if (periode.sampai) q = q.lte('tanggal', periode.sampai)
        const { data, error } = await q
        if (error) throw error
        const halaman = (data ?? []) as unknown as BarisPengeluaranRaw[]
        semua.push(...halaman)
        if (halaman.length < ukuranHalaman) break
      }
      return semua
    },
    enabled: !!periode.dari && !!periode.sampai,
  })
}

const KOLOM_EKSPOR_BEBAN: KolomEkspor<BarisBeban>[] = [
  { header: 'Kode Kategori', nilai: (r) => r.kodeKategori },
  { header: 'Kategori', nilai: (r) => r.namaKategori },
  { header: 'Operasional', nilai: (r) => (r.operasional ? 'Ya' : 'Tidak') },
  { header: 'Jumlah', nilai: (r) => r.jumlah, format: (v) => rupiah(v as number), rata: 'kanan' },
]

export function LaporanLabaRugi() {
  const [periode, setPeriode] = useState<RentangTanggal>(() => rentangDariPreset('bulan_ini'))
  const periodeLalu = useMemo(() => periodeSebelumnya(periode), [periode])

  const omzet = useOmzetRentang(periode)
  const beban = useBebanRentang(periode)
  const omzetLalu = useOmzetRentang(periodeLalu)
  const bebanLalu = useBebanRentang(periodeLalu)

  const isLoading = omzet.isLoading || beban.isLoading
  const error = omzet.error || beban.error

  const ringkasan = useMemo(() => jumlahkanOmzet(omzet.data ?? []), [omzet.data])
  const ringkasanLalu = useMemo(() => jumlahkanOmzet(omzetLalu.data ?? []), [omzetLalu.data])
  const { daftar: daftarBeban, totalOperasional, totalNonOperasional } = useMemo(() => kelompokkanBeban(beban.data ?? []), [beban.data])
  const { totalOperasional: totalOperasionalLalu } = useMemo(() => kelompokkanBeban(bebanLalu.data ?? []), [bebanLalu.data])

  const labaBersih = ringkasan.labaKotor - totalOperasional
  const labaBersihLalu = ringkasanLalu.labaKotor - totalOperasionalLalu
  const deltaLabaBersih =
    omzetLalu.data && bebanLalu.data && labaBersihLalu !== 0 ? ((labaBersih - labaBersihLalu) / Math.abs(labaBersihLalu)) * 100 : null

  const barisEksporRingkasan = [
    { label: 'Penjualan Kotor', nilai: ringkasan.omzet },
    { label: 'Retur Penjualan', nilai: -ringkasan.retur },
    { label: 'Penjualan Bersih', nilai: ringkasan.penjualanBersih },
    { label: 'HPP', nilai: -ringkasan.hpp },
    { label: 'Laba Kotor', nilai: ringkasan.labaKotor },
    { label: 'Total Beban Operasional', nilai: -totalOperasional },
    { label: 'Laba Bersih', nilai: labaBersih },
  ]
  const kolomEksporRingkasan: KolomEkspor<(typeof barisEksporRingkasan)[number]>[] = [
    { header: 'Baris', nilai: (r) => r.label },
    { header: 'Jumlah', nilai: (r) => r.nilai, format: (v) => rupiah(v as number), rata: 'kanan' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Laporan Laba Rugi')}</h1>
          <p className="text-sm text-muted-foreground">
            {tt('Penjualan bersih (di luar retur), HPP, laba kotor, dan rincian beban operasional per periode')}
          </p>
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
              <BarisStatement label={tt('Penjualan Kotor')} nilai={ringkasan.omzet} />
              <BarisStatement label={tt('Retur Penjualan')} nilai={ringkasan.retur} kurang />
              <BarisStatement label={tt('Penjualan Bersih')} nilai={ringkasan.penjualanBersih} tebal garisAtas />
              <BarisStatement label="HPP" nilai={ringkasan.hpp} kurang />
              <BarisStatement label={tt('Laba Kotor')} nilai={ringkasan.labaKotor} tebal garisAtas />

              <div className="pt-3">
                <p className="text-sm font-medium">{tt('Rincian Beban Operasional')}</p>
                {daftarBeban.filter((b) => b.operasional).length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">{tt('Belum ada beban operasional pada periode ini.')}</p>
                ) : (
                  daftarBeban
                    .filter((b) => b.operasional)
                    .map((b) => (
                      <BarisStatement key={b.kategoriId} label={`${b.kodeKategori} - ${b.namaKategori}`} nilai={b.jumlah} kurang kecil />
                    ))
                )}
              </div>
              <BarisStatement label={tt('Total Beban Operasional')} nilai={totalOperasional} kurang tebal garisAtas />

              <div className="flex items-center justify-between border-t-2 border-foreground pt-2">
                <span className="text-base font-bold">{tt('Laba Bersih')}</span>
                <div className="text-right">
                  <span className={cn('tabular text-lg font-bold', labaBersih < 0 && 'text-destructive')}>{rupiah(labaBersih)}</span>
                  {deltaLabaBersih !== null ? (
                    <span
                      className={cn(
                        'ml-2 inline-flex items-center gap-0.5 text-xs font-medium',
                        deltaLabaBersih >= 0 ? 'text-emerald-600' : 'text-destructive',
                      )}
                    >
                      {deltaLabaBersih >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {Math.abs(deltaLabaBersih).toFixed(1)}% {tt('vs periode sebelumnya')}
                    </span>
                  ) : null}
                </div>
              </div>

              {totalNonOperasional > 0 ? (
                <p className="pt-2 text-xs text-muted-foreground">
                  {tt('Ada {n} beban non-operasional (modal, ambil pribadi, dll) pada periode ini -- TIDAK ikut mengurangi Laba Bersih di atas.').replace(
                    '{n}',
                    rupiah(totalNonOperasional),
                  )}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <TombolEkspor
              ambilData={async () => barisEksporRingkasan}
              kolom={kolomEksporRingkasan}
              opsi={{ namaFile: `laba-rugi-ringkasan-${periode.dari}-${periode.sampai}`, judul: tt('Laporan Laba Rugi') }}
            />
            {daftarBeban.length > 0 ? (
              <TombolEkspor
                ambilData={async () => daftarBeban}
                kolom={KOLOM_EKSPOR_BEBAN}
                opsi={{ namaFile: `laba-rugi-rincian-beban-${periode.dari}-${periode.sampai}`, judul: tt('Rincian Beban') }}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

function BarisStatement({
  label,
  nilai,
  kurang,
  tebal,
  garisAtas,
  kecil,
}: {
  label: string
  nilai: number
  kurang?: boolean
  tebal?: boolean
  garisAtas?: boolean
  kecil?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between py-1', garisAtas && 'border-t border-border pt-2', kecil && 'pl-3')}>
      <span className={cn(kecil ? 'text-xs text-muted-foreground' : 'text-sm', tebal && 'font-semibold')}>{label}</span>
      <span className={cn('tabular', kecil ? 'text-xs text-muted-foreground' : 'text-sm', tebal && 'font-semibold')}>
        {kurang && nilai > 0 ? '(-) ' : ''}
        {rupiah(nilai)}
      </span>
    </div>
  )
}
