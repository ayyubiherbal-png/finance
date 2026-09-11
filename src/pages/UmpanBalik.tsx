import { useEffect, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tanggalWaktu } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge, Card, CardContent, KondisiKosong, Paginasi, PesanError, Select, Spinner, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { daftarBerhalaman } from '@/lib/pagination'

interface BarisUmpanBalik {
  id: string
  skor: number | null
  testimoni: string | null
  boleh_dipublikasikan: boolean
  dibuat_pada: string
  link: { nama: string | null; entitas_tipe: string; entitas_id: string } | null
}

const UKURAN_HALAMAN = 50
function useDaftarUmpanBalik(filterSkor: string, halaman: number) {
  return useQuery({
    queryKey: ['umpan-balik', filterSkor, halaman],
    queryFn: async () => {
      const mulai = (halaman - 1) * UKURAN_HALAMAN
      let q = supabase
        .from('umpan_balik')
        .select('id, skor, testimoni, boleh_dipublikasikan, dibuat_pada, link:link_id(nama, entitas_tipe, entitas_id)', { count: 'exact' })
        .order('dibuat_pada', { ascending: false })
        .range(mulai, mulai + UKURAN_HALAMAN - 1)
      if (filterSkor) q = q.eq('skor', Number(filterSkor))
      const { data, count, error } = await q
      if (error) throw error
      return daftarBerhalaman((data ?? []) as unknown as BarisUmpanBalik[], count)
    },
  })
}

function Bintang({ skor }: { skor: number | null }) {
  if (!skor) return <span className="text-muted-foreground">-</span>
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('h-3.5 w-3.5', n <= skor ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
      ))}
    </div>
  )
}

export function UmpanBalik() {
  const [filterSkor, setFilterSkor] = useState('')
  const [halaman, setHalaman] = useState(1)
  const { data, isLoading, error } = useDaftarUmpanBalik(filterSkor, halaman)
  useEffect(() => setHalaman(1), [filterSkor])

  const rataRata = data && data.length > 0 ? data.reduce((t, u) => t + (u.skor ?? 0), 0) / data.filter((u) => u.skor).length : null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{tt('Umpan Balik Pelanggan')}</h1>
        <p className="text-sm text-muted-foreground">
          {tt('Skor kepuasan & testimoni yang masuk lewat tautan "Minta Umpan Balik" di profil pelanggan.')}
        </p>
      </div>

      {data && data.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{tt('Rata-rata Skor')}</p>
            <p className="text-xl font-semibold tabular">{rataRata ? rataRata.toFixed(1) : '-'} / 5</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{tt('Total Isian')}</p>
            <p className="text-xl font-semibold tabular">{data.length}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{tt('Boleh Dipublikasikan')}</p>
            <p className="text-xl font-semibold tabular">{data.filter((u) => u.boleh_dipublikasikan).length}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Select className="w-full sm:w-48" value={filterSkor} onChange={(e) => setFilterSkor(e.target.value)}>
          <option value="">Semua skor</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} {tt('bintang')}
            </option>
          ))}
        </Select>
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
            <KondisiKosong pesan="Belum ada umpan balik yang masuk." />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Tanggal</Th>
                  <Th>Pelanggan</Th>
                  <Th>Skor</Th>
                  <Th>Testimoni</Th>
                  <Th>Publikasi</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((u) => (
                  <Tr key={u.id}>
                    <Td className="text-muted-foreground">{tanggalWaktu(u.dibuat_pada)}</Td>
                    <Td className="font-medium">
                      {u.link?.entitas_tipe === 'pelanggan' ? (
                        <Link to={`/crm/pelanggan/${u.link.entitas_id}`} className="text-primary hover:underline">
                          {u.link?.nama ?? '-'}
                        </Link>
                      ) : (
                        (u.link?.nama ?? '-')
                      )}
                    </Td>
                    <Td>
                      <Bintang skor={u.skor} />
                    </Td>
                    <Td className="max-w-sm text-muted-foreground" title={u.testimoni ?? undefined}>
                      {u.testimoni || '-'}
                    </Td>
                    <Td>
                      {u.boleh_dipublikasikan ? (
                        <Badge variant="sukses">{tt('Boleh')}</Badge>
                      ) : (
                        <Badge variant="netral">{tt('Tidak')}</Badge>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Paginasi halaman={halaman} ukuranHalaman={UKURAN_HALAMAN} total={data?.total ?? 0} onUbah={setHalaman} />
    </div>
  )
}
