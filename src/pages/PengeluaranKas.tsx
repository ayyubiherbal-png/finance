import { useEffect, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggal, tanggalISO } from '@/lib/format'
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
import { LABEL_STATUS, VARIAN_STATUS } from '@/pages/SalesOrder'
import { LABEL_METODE } from '@/pages/PenerimaanKas'
import type { MetodeBayar, StatusDokumen } from '@/types/db'
import { daftarBerhalaman } from '@/lib/pagination'

interface BarisPengeluaran {
  id: string
  nomor: string
  tanggal: string
  metode: MetodeBayar
  jumlah: number
  status: StatusDokumen
  namaPengeluaran: { nama: string; kategori: { nama: string } | null } | null
  akun: { nama: string } | null
}

const SELECT_PENGELUARAN =
  'id, nomor, tanggal, metode, jumlah, status, namaPengeluaran:nama_pengeluaran_id(nama, kategori:kategori_biaya_id(nama)), akun:akun_id(nama)'

const UKURAN_HALAMAN = 50
function useDaftarPengeluaran(cari: string, status: string, periode: RentangTanggal, halaman: number) {
  return useQuery({
    queryKey: ['pengeluaran-kas', cari, status, periode, halaman],
    queryFn: async () => {
      const mulai = (halaman - 1) * UKURAN_HALAMAN
      let q = supabase.from('pengeluaran_kas').select(SELECT_PENGELUARAN, { count: 'exact' })
      if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
      if (status) q = q.eq('status', status)
      if (periode.dari) q = q.gte('tanggal', periode.dari)
      if (periode.sampai) q = q.lte('tanggal', periode.sampai)
      const { data, count, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).range(mulai, mulai + UKURAN_HALAMAN - 1)
      if (error) throw error
      return daftarBerhalaman((data ?? []) as unknown as BarisPengeluaran[], count)
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

const KOLOM_EKSPOR_PENGELUARAN: KolomEkspor<BarisPengeluaran>[] = [
  { header: 'Nomor', nilai: (r) => r.nomor },
  { header: 'Tanggal', nilai: (r) => r.tanggal, format: (v) => tanggal(v as string) },
  { header: 'Kategori', nilai: (r) => r.namaPengeluaran?.kategori?.nama ?? '-' },
  { header: 'Nama Pengeluaran', nilai: (r) => r.namaPengeluaran?.nama ?? '-' },
  { header: 'Akun', nilai: (r) => r.akun?.nama ?? '-' },
  { header: 'Metode', nilai: (r) => LABEL_METODE[r.metode] },
  { header: 'Jumlah', nilai: (r) => r.jumlah, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: 'Status', nilai: (r) => LABEL_STATUS[r.status] },
]

export function PengeluaranKas() {
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState('')
  const [periode, setPeriode] = useState<RentangTanggal>(RENTANG_KOSONG)
  const [halaman, setHalaman] = useState(1)
  const { data, isLoading, error, isFetching } = useDaftarPengeluaran(cari, status, periode, halaman)
  useEffect(() => setHalaman(1), [cari, status, periode])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Pengeluaran Kas')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Biaya operasional umum -- sewa, listrik, gaji, dll, tanpa faktur supplier')}</p>
        </div>
        <div className="flex gap-2">
          <TombolEkspor
            ambilData={async () => {
              let q = supabase.from('pengeluaran_kas').select(SELECT_PENGELUARAN)
              if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
              if (status) q = q.eq('status', status)
              if (periode.dari) q = q.gte('tanggal', periode.dari)
              if (periode.sampai) q = q.lte('tanggal', periode.sampai)
              const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(10000)
              if (error) throw error
              return (data ?? []) as unknown as BarisPengeluaran[]
            }}
            kolom={KOLOM_EKSPOR_PENGELUARAN}
            opsi={{
              namaFile: `pengeluaran-kas-${tanggalISO()}`,
              judul: tt('Pengeluaran Kas'),
              subjudul: periode.dari || periode.sampai ? `Periode ${periode.dari ?? '...'} s/d ${periode.sampai ?? '...'}` : undefined,
            }}
          />
          <Button variant="pill" asChild>
            <Link to="/pengeluaran-kas/baru">
              <Plus className="h-4 w-4" />
              Catat Pengeluaran
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Cari nomor..." value={cari} onChange={(e) => setCari(e.target.value)} />
        </div>
        <Select className="w-full sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          {/* Pengeluaran kas cuma pernah 'disetujui' (default saat dibuat) atau 'dibatalkan'. */}
          <option value="disetujui">{LABEL_STATUS.disetujui}</option>
          <option value="dibatalkan">{LABEL_STATUS.dibatalkan}</option>
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
            <KondisiKosong pesan="Belum ada Pengeluaran Kas." />
          ) : (
            <>
              <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
                <Thead>
                  <Tr>
                    <Th>Nomor</Th>
                    <Th>Tanggal</Th>
                    <Th>Kategori</Th>
                    <Th>Nama Pengeluaran</Th>
                    <Th>Akun</Th>
                    <Th>Metode</Th>
                    <Th className="text-right">Jumlah</Th>
                    <Th>Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.map((p) => (
                    <Tr key={p.id}>
                      <Td>
                        <Link to={`/pengeluaran-kas/${p.id}`} className="font-mono text-xs text-primary hover:underline">
                          {p.nomor}
                        </Link>
                      </Td>
                      <Td className="text-muted-foreground">{tanggal(p.tanggal)}</Td>
                      <Td className="text-muted-foreground">{p.namaPengeluaran?.kategori?.nama ?? '-'}</Td>
                      <Td className="font-medium">{p.namaPengeluaran?.nama ?? '-'}</Td>
                      <Td className="text-muted-foreground">{p.akun?.nama ?? '-'}</Td>
                      <Td className="text-muted-foreground">{LABEL_METODE[p.metode]}</Td>
                      <Td className="tabular text-right font-medium">{rupiah(p.jumlah)}</Td>
                      <Td>
                        <Badge variant={VARIAN_STATUS[p.status]}>{LABEL_STATUS[p.status]}</Badge>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              <div className="flex items-center justify-end gap-1.5 border-t border-border px-4 py-2 text-sm">
                <span className="text-muted-foreground">
                  {data.length >= 100 ? tt('Total 100 pengeluaran teratas yang tampil') : `${tt('Total')} ${data.length} ${tt('pengeluaran')}`}
                </span>
                <span className="tabular font-semibold">{rupiah(data.reduce((t, p) => t + p.jumlah, 0))}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Paginasi halaman={halaman} ukuranHalaman={UKURAN_HALAMAN} total={data?.total ?? 0} onUbah={setHalaman} />
    </div>
  )
}
