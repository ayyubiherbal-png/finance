import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { tanggal as fmtTanggal } from '@/lib/format'
import { Badge, Card, CardContent, KondisiKosong, PesanError, Spinner, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import type { RiwayatFollowUp as BarisRiwayat } from '@/types/db'

/**
 * Log "Tandai Selesai" dari Tugas Follow-Up (0029) -- fitur #1 dari 5
 * yang disepakati user, 2026-09-08. Belum ada perhitungan "Tingkat
 * Follow-Up Selesai" di sini (itu fitur terpisah, butuh dibandingkan
 * dengan total tugas yang PERNAH muncul -- tugas yang tidak ditandai
 * selesai tidak pernah tersimpan di mana pun, cuma dihitung ulang tiap
 * hari, jadi baseline "total tugas historis" itu sendiri belum ada).
 * Untuk sekarang murni daftar riwayat -- siapa sudah dihubungi, kapan,
 * kategori apa, catatan hasilnya apa.
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

function useRiwayatFollowUp() {
  return useQuery({
    queryKey: ['riwayat-follow-up'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('riwayat_follow_up')
        .select('*, profil:selesai_oleh(nama)')
        .order('selesai_pada', { ascending: false })
        .limit(300)
      if (error) throw error
      return (data ?? []) as (BarisRiwayat & { profil: { nama: string } | null })[]
    },
  })
}

export function RiwayatFollowUp() {
  const { data, isLoading, error } = useRiwayatFollowUp()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{tt('Riwayat Follow-Up')}</h1>
        <p className="text-sm text-muted-foreground">{tt('Catatan tugas follow-up yang sudah ditandai selesai -- siapa, kapan, dan hasilnya apa.')}</p>
      </div>

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
