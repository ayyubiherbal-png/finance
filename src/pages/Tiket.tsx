import { useEffect, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tanggal, tanggalISO } from '@/lib/format'
import { kutipFilterPostgrest } from '@/lib/utils'
import { FilterPeriode, RENTANG_KOSONG, type RentangTanggal } from '@/components/FilterPeriode'
import { TombolEkspor } from '@/components/TombolEkspor'
import type { KolomEkspor } from '@/lib/eksporData'
import {
  Badge,
  Button,
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
import type { PrioritasTiket, StatusTiket } from '@/types/db'
import { daftarBerhalaman } from '@/lib/pagination'

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

const UKURAN_HALAMAN = 50
function useDaftarTiket(cari: string, status: string, periode: RentangTanggal, halaman: number) {
  return useQuery({
    queryKey: ['tiket', cari, status, periode, halaman],
    queryFn: async () => {
      const mulai = (halaman - 1) * UKURAN_HALAMAN
      let q = supabase
        .from('tiket')
        .select('id, nomor, tanggal, judul, status, prioritas, pelanggan:pelanggan_id(nama), ditugaskan:ditugaskan_ke(nama)', { count: 'exact' })

      if (cari.trim()) {
        const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
        q = q.or(`nomor.ilike.${pola},judul.ilike.${pola}`)
      }
      if (status) q = q.eq('status', status)
      if (periode.dari) q = q.gte('tanggal', periode.dari)
      if (periode.sampai) q = q.lte('tanggal', periode.sampai)

      const { data, count, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).range(mulai, mulai + UKURAN_HALAMAN - 1)
      if (error) throw error
      return daftarBerhalaman((data ?? []) as unknown as BarisTiket[], count)
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

const KOLOM_EKSPOR_TIKET: KolomEkspor<BarisTiket>[] = [
  { header: 'Nomor', nilai: (r) => r.nomor },
  { header: 'Tanggal', nilai: (r) => r.tanggal, format: (v) => tanggal(v as string) },
  { header: 'Pelanggan', nilai: (r) => r.pelanggan?.nama ?? '-' },
  { header: 'Judul', nilai: (r) => r.judul },
  { header: 'Prioritas', nilai: (r) => LABEL_PRIORITAS[r.prioritas] },
  { header: 'Ditugaskan ke', nilai: (r) => r.ditugaskan?.nama ?? '-' },
  { header: 'Status', nilai: (r) => LABEL_STATUS_TIKET[r.status] },
]

export function Tiket() {
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState('')
  const [periode, setPeriode] = useState<RentangTanggal>(RENTANG_KOSONG)
  const [halaman, setHalaman] = useState(1)
  const { data, isLoading, error, isFetching } = useDaftarTiket(cari, status, periode, halaman)
  useEffect(() => setHalaman(1), [cari, status, periode])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Tiket')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Lacak komplain, pertanyaan, dan retur pelanggan sampai tuntas')}</p>
        </div>
        <div className="flex gap-2">
          <TombolEkspor
            ambilData={async () => {
              let q = supabase
                .from('tiket')
                .select('id, nomor, tanggal, judul, status, prioritas, pelanggan:pelanggan_id(nama), ditugaskan:ditugaskan_ke(nama)')
              if (cari.trim()) {
                const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
                q = q.or(`nomor.ilike.${pola},judul.ilike.${pola}`)
              }
              if (status) q = q.eq('status', status)
              if (periode.dari) q = q.gte('tanggal', periode.dari)
              if (periode.sampai) q = q.lte('tanggal', periode.sampai)
              const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(10000)
              if (error) throw error
              return (data ?? []) as unknown as BarisTiket[]
            }}
            kolom={KOLOM_EKSPOR_TIKET}
            opsi={{ namaFile: `tiket-${tanggalISO()}`, judul: tt('Tiket') }}
          />
          <Button variant="pill" asChild>
            <Link to="/tiket/baru">
              <Plus className="h-4 w-4" />
              Tiket Baru
            </Link>
          </Button>
        </div>
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
                  {data.length >= 100 ? tt('Total 100 tiket teratas yang tampil') : `${tt('Total')} ${data.length} ${tt('tiket')}`}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Paginasi halaman={halaman} ukuranHalaman={UKURAN_HALAMAN} total={data?.total ?? 0} onUbah={setHalaman} />
    </div>
  )
}
