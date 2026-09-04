import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggal } from '@/lib/format'
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
import { LABEL_STATUS, VARIAN_STATUS } from '@/pages/SalesOrder'
import { LABEL_METODE } from '@/pages/PenerimaanKas'
import type { MetodeBayar, StatusDokumen } from '@/types/db'

interface BarisBayar {
  id: string
  nomor: string
  tanggal: string
  metode: MetodeBayar
  jumlah: number
  status: StatusDokumen
  supplier: { nama: string } | null
}

function useDaftarBayar(cari: string, status: string) {
  return useQuery({
    queryKey: ['pembayaran-supplier', cari, status],
    queryFn: async () => {
      let q = supabase.from('pembayaran_supplier').select('id, nomor, tanggal, metode, jumlah, status, supplier:supplier_id(nama)')
      if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
      if (status) q = q.eq('status', status)
      const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(100)
      if (error) throw error
      return (data ?? []) as unknown as BarisBayar[]
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

export function PembayaranSupplier() {
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState('')
  const { data, isLoading, error, isFetching } = useDaftarBayar(cari, status)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Pembayaran Supplier</h1>
          <p className="text-sm text-muted-foreground">Pembayaran ke supplier, dialokasikan ke faktur pembelian</p>
        </div>
        <Button asChild>
          <Link to="/pembayaran-supplier/baru">
            <Plus className="h-4 w-4" />
            Bayar Supplier
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Cari nomor..." value={cari} onChange={(e) => setCari(e.target.value)} />
        </div>
        <Select className="w-full sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          <option value="disetujui">{LABEL_STATUS.disetujui}</option>
          <option value="dibatalkan">{LABEL_STATUS.dibatalkan}</option>
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
            <KondisiKosong pesan="Belum ada Pembayaran Supplier." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th>Nomor</Th>
                  <Th>Tanggal</Th>
                  <Th>Supplier</Th>
                  <Th>Metode</Th>
                  <Th className="text-right">Jumlah</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((b) => (
                  <Tr key={b.id}>
                    <Td>
                      <Link to={`/pembayaran-supplier/${b.id}`} className="font-mono text-xs text-primary hover:underline">
                        {b.nomor}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{tanggal(b.tanggal)}</Td>
                    <Td className="font-medium">{b.supplier?.nama ?? '-'}</Td>
                    <Td className="text-muted-foreground">{LABEL_METODE[b.metode]}</Td>
                    <Td className="tabular text-right font-medium">{rupiah(b.jumlah)}</Td>
                    <Td>
                      <Badge variant={VARIAN_STATUS[b.status]}>{LABEL_STATUS[b.status]}</Badge>
                    </Td>
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
