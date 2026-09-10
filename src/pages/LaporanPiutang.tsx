import { useQuery } from '@tanstack/react-query'
import { tt } from '@/lib/i18nText'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggal, tanggalISO } from '@/lib/format'
import { TombolEkspor } from '@/components/TombolEkspor'
import type { KolomEkspor } from '@/lib/eksporData'
import {
  Badge,
  Card,
  CardContent,
  KondisiKosong,
  PesanError,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui'
import type { VPiutang, VPiutangAging } from '@/types/db'

function usePiutangAging() {
  return useQuery({
    queryKey: ['laporan-piutang-aging'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_piutang_aging')
        .select('*')
        .order('total_piutang', { ascending: false })
        .returns<VPiutangAging[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

function usePiutangJatuhTempo() {
  return useQuery({
    queryKey: ['laporan-piutang-jatuh-tempo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_piutang')
        .select('*')
        .neq('bucket_umur', 'belum_jatuh_tempo')
        .order('hari_lewat', { ascending: false })
        .limit(50)
        .returns<VPiutang[]>()
      if (error) throw error
      return data ?? []
    },
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
  const { data: aging, isLoading, error } = usePiutangAging()
  const { data: lewatTempo } = usePiutangJatuhTempo()

  const total = {
    piutang: (aging ?? []).reduce((t, r) => t + Number(r.total_piutang), 0),
    belumJatuhTempo: (aging ?? []).reduce((t, r) => t + Number(r.belum_jatuh_tempo ?? 0), 0),
    umur1_30: (aging ?? []).reduce((t, r) => t + Number(r.umur_1_30 ?? 0), 0),
    umur31_60: (aging ?? []).reduce((t, r) => t + Number(r.umur_31_60 ?? 0), 0),
    umur61_90: (aging ?? []).reduce((t, r) => t + Number(r.umur_61_90 ?? 0), 0),
    umur90plus: (aging ?? []).reduce((t, r) => t + Number(r.umur_90_plus ?? 0), 0),
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Laporan Piutang')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Sisa tagihan pelanggan berdasarkan umur jatuh tempo')}</p>
        </div>
        {aging && aging.length > 0 ? (
          <TombolEkspor
            ambilData={async () => aging}
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
      ) : !aging || aging.length === 0 ? (
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
                  {aging.map((r) => (
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
            </CardContent>
          </Card>

          {lewatTempo && lewatTempo.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">{tt('Faktur lewat jatuh tempo')}</h2>
                <TombolEkspor
                  ambilData={async () => lewatTempo}
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
                      {lewatTempo.map((f) => (
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
