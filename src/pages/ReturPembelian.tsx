import { useEffect, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggal, tanggalISO } from '@/lib/format'
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
import type { StatusDokumen } from '@/types/db'
import { daftarBerhalaman } from '@/lib/pagination'

interface Baris {
  id: string
  nomor: string
  tanggal: string
  status: StatusDokumen
  total: number
  supplier: { nama: string } | null
}

const UKURAN_HALAMAN = 50
function useDaftar(cari: string, status: string, halaman: number) {
  return useQuery({
    queryKey: ['retur-pembelian', cari, status, halaman],
    queryFn: async () => {
      const mulai = (halaman - 1) * UKURAN_HALAMAN
      let q = supabase.from('retur_pembelian').select('id, nomor, tanggal, status, total, supplier:supplier_id(nama)', { count: 'exact' })
      if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
      if (status) q = q.eq('status', status)
      const { data, count, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).range(mulai, mulai + UKURAN_HALAMAN - 1)
      if (error) throw error
      return daftarBerhalaman((data ?? []) as unknown as Baris[], count)
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

const KOLOM_EKSPOR_RETUR_BELI: KolomEkspor<Baris>[] = [
  { header: 'Nomor', nilai: (r) => r.nomor },
  { header: 'Tanggal', nilai: (r) => r.tanggal, format: (v) => tanggal(v as string) },
  { header: 'Supplier', nilai: (r) => r.supplier?.nama ?? '-' },
  { header: 'Total', nilai: (r) => r.total, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: 'Status', nilai: (r) => LABEL_STATUS[r.status] },
]

export function ReturPembelian() {
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState('')
  const [halaman, setHalaman] = useState(1)
  const { data, isLoading, error, isFetching } = useDaftar(cari, status, halaman)
  useEffect(() => setHalaman(1), [cari, status])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Retur Pembelian')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Barang dikembalikan ke supplier')}</p>
        </div>
        <div className="flex gap-2">
          <TombolEkspor
            ambilData={async () => {
              let q = supabase.from('retur_pembelian').select('id, nomor, tanggal, status, total, supplier:supplier_id(nama)')
              if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
              if (status) q = q.eq('status', status)
              const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(10000)
              if (error) throw error
              return (data ?? []) as unknown as Baris[]
            }}
            kolom={KOLOM_EKSPOR_RETUR_BELI}
            opsi={{ namaFile: `retur-pembelian-${tanggalISO()}`, judul: tt('Retur Pembelian') }}
          />
          <Button variant="pill" asChild>
            <Link to="/retur-pembelian/baru">
              <Plus className="h-4 w-4" />
              Retur Baru
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
          {Object.entries(LABEL_STATUS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
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
            <KondisiKosong pesan="Belum ada Retur Pembelian." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th>Nomor</Th>
                  <Th>Tanggal</Th>
                  <Th>Supplier</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <Link to={`/retur-pembelian/${r.id}`} className="font-mono text-xs text-primary hover:underline">
                        {r.nomor}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{tanggal(r.tanggal)}</Td>
                    <Td className="font-medium">{r.supplier?.nama ?? '-'}</Td>
                    <Td className="tabular text-right font-medium">{rupiah(r.total)}</Td>
                    <Td>
                      <Badge variant={VARIAN_STATUS[r.status]}>{LABEL_STATUS[r.status]}</Badge>
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
