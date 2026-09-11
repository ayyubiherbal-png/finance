import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { tt } from '@/lib/i18nText'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggal, tanggalISO } from '@/lib/format'
import { kutipFilterPostgrest } from '@/lib/utils'
import { TombolEkspor } from '@/components/TombolEkspor'
import type { KolomEkspor } from '@/lib/eksporData'
import {
  Badge,
  Card,
  CardContent,
  Input,
  KondisiKosong,
  Paginasi,
  PesanError,
  Select,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui'
import type { VPiutang, VPiutangAging } from '@/types/db'

const UKURAN_HALAMAN = 50

type FilterUmur = '' | 'belum_jatuh_tempo' | '1-30' | '31-60' | '61-90' | '90+'

const KOLOM_UMUR: Record<Exclude<FilterUmur, ''>, keyof VPiutangAging> = {
  belum_jatuh_tempo: 'belum_jatuh_tempo',
  '1-30': 'umur_1_30',
  '31-60': 'umur_31_60',
  '61-90': 'umur_61_90',
  '90+': 'umur_90_plus',
}

function usePiutangAging(cari: string, umur: FilterUmur, halaman: number) {
  return useQuery({
    queryKey: ['laporan-piutang-aging', cari, umur, halaman],
    queryFn: async () => {
      let q = supabase
        .from('v_piutang_aging')
        .select('*', { count: 'exact' })
      if (cari.trim()) q = q.ilike('nama_pelanggan', `%${cari.trim()}%`)
      if (umur) q = q.gt(KOLOM_UMUR[umur], 0)
      const mulai = halaman * UKURAN_HALAMAN
      const { data, error, count } = await q
        .order('total_piutang', { ascending: false })
        .range(mulai, mulai + UKURAN_HALAMAN - 1)
        .returns<VPiutangAging[]>()
      if (error) throw error
      return { baris: data ?? [], total: count ?? 0 }
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

function useRingkasanPiutang() {
  return useQuery({
    queryKey: ['laporan-piutang-ringkasan'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_piutang_aging')
        .select('total_piutang,belum_jatuh_tempo,umur_1_30,umur_31_60,umur_61_90,umur_90_plus')
        .returns<VPiutangAging[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

function usePiutangJatuhTempo(cari: string, umur: FilterUmur, halaman: number) {
  return useQuery({
    queryKey: ['laporan-piutang-jatuh-tempo', cari, umur, halaman],
    queryFn: async () => {
      if (umur === 'belum_jatuh_tempo') return { baris: [] as VPiutang[], total: 0 }
      let q = supabase.from('v_piutang').select('*', { count: 'exact' }).neq('bucket_umur', 'belum_jatuh_tempo')
      if (cari.trim()) {
        const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
        q = q.or(`nomor.ilike.${pola},nama_pelanggan.ilike.${pola}`)
      }
      if (umur) q = q.eq('bucket_umur', umur)
      const mulai = halaman * UKURAN_HALAMAN
      const { data, error, count } = await q
        .order('hari_lewat', { ascending: false })
        .range(mulai, mulai + UKURAN_HALAMAN - 1)
        .returns<VPiutang[]>()
      if (error) throw error
      return { baris: data ?? [], total: count ?? 0 }
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

const KOLOM_EKSPOR_AGING: KolomEkspor<VPiutangAging>[] = [
  { header: 'Pelanggan', nilai: (r) => r.nama_pelanggan },
  { header: 'Total', nilai: (r) => r.total_piutang, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: 'Belum Jatuh Tempo', nilai: (r) => r.belum_jatuh_tempo ?? 0, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: '1-30 Hari', nilai: (r) => r.umur_1_30 ?? 0, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: '31-60 Hari', nilai: (r) => r.umur_31_60 ?? 0, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: '61-90 Hari', nilai: (r) => r.umur_61_90 ?? 0, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: '90+ Hari', nilai: (r) => r.umur_90_plus ?? 0, format: (v) => rupiah(v as number), rata: 'kanan' },
]

const KOLOM_EKSPOR_LEWAT_TEMPO: KolomEkspor<VPiutang>[] = [
  { header: 'Nomor', nilai: (r) => r.nomor },
  { header: 'Pelanggan', nilai: (r) => r.nama_pelanggan },
  { header: 'Jatuh Tempo', nilai: (r) => r.jatuh_tempo, format: (v) => tanggal(v as string) },
  { header: 'Terlambat (hari)', nilai: (r) => r.hari_lewat, rata: 'kanan' },
  { header: 'Sisa', nilai: (r) => r.sisa, format: (v) => rupiah(v as number), rata: 'kanan' },
]

export function LaporanPiutang() {
  const [cari, setCari] = useState('')
  const [umur, setUmur] = useState<FilterUmur>('')
  const [halamanAging, setHalamanAging] = useState(0)
  const [halamanLewatTempo, setHalamanLewatTempo] = useState(0)
  const { data: aging, isLoading, error, isFetching } = usePiutangAging(cari, umur, halamanAging)
  const { data: ringkasan } = useRingkasanPiutang()
  const { data: lewatTempo, error: errorLewatTempo } = usePiutangJatuhTempo(cari, umur, halamanLewatTempo)

  useEffect(() => {
    setHalamanAging(0)
    setHalamanLewatTempo(0)
  }, [cari, umur])

  const total = {
    piutang: (ringkasan ?? []).reduce((t, r) => t + Number(r.total_piutang), 0),
    belumJatuhTempo: (ringkasan ?? []).reduce((t, r) => t + Number(r.belum_jatuh_tempo ?? 0), 0),
    umur1_30: (ringkasan ?? []).reduce((t, r) => t + Number(r.umur_1_30 ?? 0), 0),
    umur31_60: (ringkasan ?? []).reduce((t, r) => t + Number(r.umur_31_60 ?? 0), 0),
    umur61_90: (ringkasan ?? []).reduce((t, r) => t + Number(r.umur_61_90 ?? 0), 0),
    umur90plus: (ringkasan ?? []).reduce((t, r) => t + Number(r.umur_90_plus ?? 0), 0),
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Laporan Piutang')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Sisa tagihan pelanggan berdasarkan umur jatuh tempo')}</p>
        </div>
        {ringkasan && ringkasan.length > 0 ? (
          <TombolEkspor
            ambilData={async () => {
              let q = supabase.from('v_piutang_aging').select('*')
              if (cari.trim()) q = q.ilike('nama_pelanggan', `%${cari.trim()}%`)
              if (umur) q = q.gt(KOLOM_UMUR[umur], 0)
              const { data, error } = await q.order('total_piutang', { ascending: false }).limit(10000).returns<VPiutangAging[]>()
              if (error) throw error
              return data ?? []
            }}
            kolom={KOLOM_EKSPOR_AGING}
            opsi={{ namaFile: `piutang-aging-${tanggalISO()}`, judul: tt('Laporan Piutang') }}
          />
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : error ? (
        <PesanError error={error} />
      ) : !ringkasan || ringkasan.length === 0 ? (
        <KondisiKosong pesan="Tidak ada piutang berjalan." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KartuAging judul="Total" nilai={total.piutang} />
            <KartuAging judul="Belum jatuh tempo" nilai={total.belumJatuhTempo} />
            <KartuAging judul="1-30 hari" nilai={total.umur1_30} />
            <KartuAging judul="31-60 hari" nilai={total.umur31_60} />
            <KartuAging judul="61-90 hari" nilai={total.umur61_90} />
            <KartuAging judul="90+ hari" nilai={total.umur90plus} bahaya={total.umur90plus > 0} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[16rem] flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder={tt('Cari pelanggan atau nomor faktur...')}
                className="pl-9"
              />
            </div>
            <Select value={umur} onChange={(e) => setUmur(e.target.value as FilterUmur)} className="w-full sm:w-52">
              <option value="">{tt('Semua umur piutang')}</option>
              <option value="belum_jatuh_tempo">{tt('Belum jatuh tempo')}</option>
              <option value="1-30">1-30 {tt('hari')}</option>
              <option value="31-60">31-60 {tt('hari')}</option>
              <option value="61-90">61-90 {tt('hari')}</option>
              <option value="90+">90+ {tt('hari')}</option>
            </Select>
            {isFetching ? <Spinner className="h-4 w-4" /> : null}
          </div>

          <Card>
            <CardContent className="p-0 pb-2">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Pelanggan</Th>
                    <Th className="text-right">Total</Th>
                    <Th className="text-right">Belum jatuh tempo</Th>
                    <Th className="text-right">1-30</Th>
                    <Th className="text-right">31-60</Th>
                    <Th className="text-right">61-90</Th>
                    <Th className="text-right">90+</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {aging?.baris.map((r) => (
                    <Tr key={r.pelanggan_id}>
                      <Td className="font-medium">{r.nama_pelanggan}</Td>
                      <Td className="tabular text-right font-medium">{rupiah(r.total_piutang)}</Td>
                      <Td className="tabular text-right text-muted-foreground">{rupiah(r.belum_jatuh_tempo ?? 0)}</Td>
                      <Td className="tabular text-right">{r.umur_1_30 ? rupiah(r.umur_1_30) : '-'}</Td>
                      <Td className="tabular text-right">{r.umur_31_60 ? rupiah(r.umur_31_60) : '-'}</Td>
                      <Td className="tabular text-right">{r.umur_61_90 ? rupiah(r.umur_61_90) : '-'}</Td>
                      <Td className="tabular text-right text-destructive">
                        {r.umur_90_plus ? rupiah(r.umur_90_plus) : '-'}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              {aging?.baris.length === 0 ? <KondisiKosong pesan="Tidak ada piutang yang cocok dengan filter." /> : null}
              <Paginasi halaman={halamanAging} ukuranHalaman={UKURAN_HALAMAN} total={aging?.total ?? 0} onUbah={setHalamanAging} />
            </CardContent>
          </Card>

          {errorLewatTempo ? <PesanError error={errorLewatTempo} /> : null}
          {lewatTempo && lewatTempo.total > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">{tt('Faktur lewat jatuh tempo')}</h2>
                <TombolEkspor
                  ambilData={async () => {
                    let q = supabase.from('v_piutang').select('*').neq('bucket_umur', 'belum_jatuh_tempo')
                    if (cari.trim()) {
                      const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
                      q = q.or(`nomor.ilike.${pola},nama_pelanggan.ilike.${pola}`)
                    }
                    if (umur) q = q.eq('bucket_umur', umur)
                    const { data, error } = await q.order('hari_lewat', { ascending: false }).limit(10000).returns<VPiutang[]>()
                    if (error) throw error
                    return data ?? []
                  }}
                  kolom={KOLOM_EKSPOR_LEWAT_TEMPO}
                  opsi={{ namaFile: `piutang-lewat-tempo-${tanggalISO()}`, judul: tt('Faktur lewat jatuh tempo') }}
                />
              </div>
              <Card>
                <CardContent className="p-0 pb-2">
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Nomor</Th>
                        <Th>Pelanggan</Th>
                        <Th>Jatuh tempo</Th>
                        <Th className="text-right">Terlambat</Th>
                        <Th className="text-right">Sisa</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {lewatTempo.baris.map((f) => (
                        <Tr key={f.faktur_id}>
                          <Td className="font-mono text-xs">{f.nomor}</Td>
                          <Td className="font-medium">{f.nama_pelanggan}</Td>
                          <Td className="text-muted-foreground">{tanggal(f.jatuh_tempo)}</Td>
                          <Td className="text-right">
                            <Badge variant={f.hari_lewat > 60 ? 'bahaya' : 'peringatan'}>{f.hari_lewat} hari</Badge>
                          </Td>
                          <Td className="tabular text-right font-medium">{rupiah(f.sisa)}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                  <Paginasi halaman={halamanLewatTempo} ukuranHalaman={UKURAN_HALAMAN} total={lewatTempo.total} onUbah={setHalamanLewatTempo} />
                </CardContent>
              </Card>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function KartuAging({ judul, nilai, bahaya }: { judul: string; nilai: number; bahaya?: boolean }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{judul}</p>
        <p className={`tabular mt-1 text-lg font-semibold ${bahaya ? 'text-destructive' : ''}`}>{rupiah(nilai)}</p>
      </CardContent>
    </Card>
  )
}
