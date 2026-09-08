import { useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tanggal } from '@/lib/format'
import { FilterPeriode, RENTANG_KOSONG, type RentangTanggal } from '@/components/FilterPeriode'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  KondisiKosong,
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
import type { PrioritasTiket, StatusTiket } from '@/types/db'

interface BarisTiket {
  id: string
  nomor: string
  tanggal: string
  judul: string
  status: StatusTiket
  prioritas: PrioritasTiket
  pelanggan: { nama: string } | null
  ditugaskan: { nama: string } | null
}

export const LABEL_STATUS_TIKET: Record<StatusTiket, string> = {
  terbuka: 'Terbuka',
  diproses: 'Diproses',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
}

export const VARIAN_STATUS_TIKET: Record<StatusTiket, 'netral' | 'default' | 'sukses' | 'peringatan' | 'bahaya'> = {
  terbuka: 'peringatan',
  diproses: 'default',
  selesai: 'sukses',
  dibatalkan: 'bahaya',
}

export const LABEL_PRIORITAS: Record<PrioritasTiket, string> = {
  rendah: 'Rendah',
  sedang: 'Sedang',
  tinggi: 'Tinggi',
}

export const VARIAN_PRIORITAS: Record<PrioritasTiket, 'netral' | 'default' | 'sukses' | 'peringatan' | 'bahaya'> = {
  rendah: 'netral',
  sedang: 'default',
  tinggi: 'bahaya',
}

function useDaftarTiket(cari: string, status: string, periode: RentangTanggal) {
  return useQuery({
    queryKey: ['tiket', cari, status, periode],
    queryFn: async () => {
      let q = supabase
        .from('tiket')
        .select('id, nomor, tanggal, judul, status, prioritas, pelanggan:pelanggan_id(nama), ditugaskan:ditugaskan_ke(nama)')

      if (cari.trim()) q = q.or(`nomor.ilike.%${cari.trim()}%,judul.ilike.%${cari.trim()}%`)
      if (status) q = q.eq('status', status)
      if (periode.dari) q = q.gte('tanggal', periode.dari)
      if (periode.sampai) q = q.lte('tanggal', periode.sampai)

      const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(100)
      if (error) throw error
      return (data ?? []) as unknown as BarisTiket[]
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

export function Tiket() {
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState('')
  const [periode, setPeriode] = useState<RentangTanggal>(RENTANG_KOSONG)
  const { data, isLoading, error, isFetching } = useDaftarTiket(cari, status, periode)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Tiket')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Lacak komplain, pertanyaan, dan retur pelanggan sampai tuntas')}</p>
        </div>
        <Button variant="pill" asChild>
          <Link to="/tiket/baru">
            <Plus className="h-4 w-4" />
            Tiket Baru
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Cari nomor atau judul tiket..."
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />
        </div>
        <Select className="w-full sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          {Object.entries(LABEL_STATUS_TIKET).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <FilterPeriode onChange={setPeriode} />
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
            <KondisiKosong pesan="Belum ada tiket." />
          ) : (
            <>
              <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
                <Thead>
                  <Tr>
                    <Th>Nomor</Th>
                    <Th>Tanggal</Th>
                    <Th>Pelanggan</Th>
                    <Th>Judul</Th>
                    <Th>Prioritas</Th>
                    <Th>Ditugaskan ke</Th>
                    <Th>Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.map((tk) => (
                    <Tr key={tk.id} className="cursor-pointer">
                      <Td>
                        <Link to={`/tiket/${tk.id}`} className="font-mono text-xs text-primary hover:underline">
                          {tk.nomor}
                        </Link>
                      </Td>
                      <Td className="text-muted-foreground">{tanggal(tk.tanggal)}</Td>
                      <Td className="font-medium">{tk.pelanggan?.nama ?? '-'}</Td>
                      <Td className="max-w-xs truncate">{tk.judul}</Td>
                      <Td>
                        <Badge variant={VARIAN_PRIORITAS[tk.prioritas]}>{LABEL_PRIORITAS[tk.prioritas]}</Badge>
                      </Td>
                      <Td className="text-muted-foreground">{tk.ditugaskan?.nama ?? '-'}</Td>
                      <Td>
                        <Badge variant={VARIAN_STATUS_TIKET[tk.status]}>{LABEL_STATUS_TIKET[tk.status]}</Badge>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              <div className="flex items-center justify-end gap-1.5 border-t border-border px-4 py-2 text-sm">
                <span className="text-muted-foreground">
                  {data.length >= 100 ? 'Total 100 tiket teratas yang tampil' : `Total ${data.length} tiket`}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
