import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { tanggal as fmtTanggal, tanggalISO } from '@/lib/format'
import { Badge, Card, CardContent, KondisiKosong, PesanError, Spinner, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { TombolEkspor } from '@/components/TombolEkspor'
import type { KolomEkspor } from '@/lib/eksporData'
import type { RiwayatFollowUp as BarisRiwayat, VTingkatFuSelesai } from '@/types/db'

type BarisRiwayatTampil = BarisRiwayat & { profil: { nama: string } | null }

/**
 * Log "Tandai Selesai" dari Tugas Follow-Up (0029) -- fitur #1 dari 5
 * yang disepakati user, 2026-09-08.
 *
 * "Tingkat Follow-Up Selesai" (0039, 2026-09-09) -- sempat tidak bisa
 * dihitung karena tidak ada baseline "total tugas yang PERNAH muncul"
 * (tugas yang tidak ditandai selesai tidak pernah tersimpan). Sejak
 * 0037 mencatat setiap KEMUNCULAN tahap ke `riwayat_tahap_pelanggan`,
 * baseline itu sudah ada -- lihat `v_tingkat_fu_selesai` (join ke
 * `riwayat_follow_up` lewat `tugas_id` yang sama).
 */

const LABEL_KATEGORI: Record<string, string> = {
  baru: 'Sapa Pembeli Baru',
  naik_setia: 'Baru Jadi Setia',
  naik_juara: 'Baru Jadi Juara',
  mulai_hilang: 'Mulai Hilang',
  tidur: 'Berisiko Tidur',
  jadikan_pelanggan: 'Siap Dijadikan Pelanggan',
}

const VARIAN_KATEGORI: Record<string, 'sukses' | 'default' | 'peringatan' | 'bahaya' | 'netral'> = {
  baru: 'default',
  naik_setia: 'default',
  naik_juara: 'sukses',
  mulai_hilang: 'peringatan',
  tidur: 'bahaya',
  jadikan_pelanggan: 'netral',
}

function useTingkatFuSelesai() {
  return useQuery({
    queryKey: ['tingkat-fu-selesai'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_tingkat_fu_selesai').select('*').returns<VTingkatFuSelesai[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

const SELECT_RIWAYAT_FU = '*, profil:selesai_oleh(nama)'

function useRiwayatFollowUp() {
  return useQuery({
    queryKey: ['riwayat-follow-up'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('riwayat_follow_up')
        .select(SELECT_RIWAYAT_FU)
        .order('selesai_pada', { ascending: false })
        .limit(300)
      if (error) throw error
      return (data ?? []) as (BarisRiwayat & { profil: { nama: string } | null })[]
    },
  })
}

const KOLOM_EKSPOR_RIWAYAT_FU: KolomEkspor<BarisRiwayatTampil>[] = [
  { header: 'Tanggal', nilai: (r) => r.selesai_pada, format: (v) => fmtTanggal(v as string) },
  { header: 'Nama', nilai: (r) => r.nama || '-' },
  { header: 'Kategori', nilai: (r) => tt(LABEL_KATEGORI[r.kategori] ?? r.kategori) },
  { header: 'Catatan', nilai: (r) => r.catatan || '-' },
  { header: 'Diselesaikan oleh', nilai: (r) => r.profil?.nama ?? '-' },
]

export function RiwayatFollowUp() {
  const { data, isLoading, error } = useRiwayatFollowUp()
  const { data: tingkat } = useTingkatFuSelesai()

  const totalMuncul = tingkat?.reduce((t, k) => t + k.jumlah_muncul, 0) ?? 0
  const totalSelesai = tingkat?.reduce((t, k) => t + k.jumlah_selesai, 0) ?? 0
  const persenKeseluruhan = totalMuncul > 0 ? Math.round((totalSelesai / totalMuncul) * 1000) / 10 : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Riwayat Follow-Up')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Catatan tugas follow-up yang sudah ditandai selesai -- siapa, kapan, dan hasilnya apa.')}</p>
        </div>
        <TombolEkspor
          ambilData={async () => {
            const { data, error } = await supabase
              .from('riwayat_follow_up')
              .select(SELECT_RIWAYAT_FU)
              .order('selesai_pada', { ascending: false })
              .limit(10000)
            if (error) throw error
            return (data ?? []) as BarisRiwayatTampil[]
          }}
          kolom={KOLOM_EKSPOR_RIWAYAT_FU}
          opsi={{ namaFile: `riwayat-follow-up-${tanggalISO()}`, judul: tt('Riwayat Follow-Up') }}
        />
      </div>

      {tingkat && tingkat.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{tt('Tingkat Selesai Keseluruhan')}</p>
            <p className="text-xl font-semibold tabular">{persenKeseluruhan ?? '-'}%</p>
            <p className="text-xs text-muted-foreground">
              {totalSelesai}/{totalMuncul} {tt('tugas')}
            </p>
          </div>
          {tingkat.map((k) => (
            <div key={k.kategori} className="rounded-lg border border-border p-3">
              <p className="truncate text-xs text-muted-foreground" title={tt(LABEL_KATEGORI[k.kategori] ?? k.kategori)}>
                {tt(LABEL_KATEGORI[k.kategori] ?? k.kategori)}
              </p>
              <p className="text-xl font-semibold tabular">{k.persen_selesai ?? '-'}%</p>
              <p className="text-xs text-muted-foreground">
                {k.jumlah_selesai}/{k.jumlah_muncul}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0 pb-2">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner className="h-6 w-6" />
            </div>
          ) : error ? (
            <div className="p-4">
              <PesanError error={error} />
            </div>
          ) : !data || data.length === 0 ? (
            <KondisiKosong pesan="Belum ada follow-up yang ditandai selesai." />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>{tt('Tanggal')}</Th>
                  <Th>{tt('Nama')}</Th>
                  <Th>{tt('Kategori')}</Th>
                  <Th>{tt('Catatan')}</Th>
                  <Th>{tt('Diselesaikan oleh')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((r) => (
                  <Tr key={r.id}>
                    <Td className="text-muted-foreground">{fmtTanggal(r.selesai_pada)}</Td>
                    <Td className="font-medium">{r.nama || '-'}</Td>
                    <Td>
                      <Badge variant={VARIAN_KATEGORI[r.kategori] ?? 'netral'}>{tt(LABEL_KATEGORI[r.kategori] ?? r.kategori)}</Badge>
                    </Td>
                    <Td className="max-w-xs truncate text-muted-foreground" title={r.catatan ?? undefined}>
                      {r.catatan || '-'}
                    </Td>
                    <Td className="text-muted-foreground">{r.profil?.nama ?? '-'}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
