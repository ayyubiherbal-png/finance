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
import type { StatusDokumen } from '@/types/db'

interface BarisPO {
  id: string
  nomor: string
  tanggal: string
  status: StatusDokumen
  total: number
  supplier: { nama: string } | null
}

function useDaftarPO(cari: string, status: string) {
  return useQuery({
    queryKey: ['purchase-order', cari, status],
    queryFn: async () => {
      let q = supabase.from('purchase_order').select('id, nomor, tanggal, status, total, supplier:supplier_id(nama)')
      if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
      if (status) q = q.eq('status', status)
      const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(100)
      if (error) throw error
      return (data ?? []) as unknown as BarisPO[]
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

export function PurchaseOrder() {
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState('')
  const { data, isLoading, error, isFetching } = useDaftarPO(cari, status)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Purchase Order</h1>
          <p className="text-sm text-muted-foreground">Pemesanan barang ke supplier</p>
        </div>
        <Button asChild>
          <Link to="/purchase-order/baru">
            <Plus className="h-4 w-4" />
            PO Baru
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Cari nomor PO..." value={cari} onChange={(e) => setCari(e.target.value)} />
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
            <KondisiKosong pesan="Belum ada Purchase Order." />
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
                {data.map((po) => (
                  <Tr key={po.id}>
                    <Td>
                      <Link to={`/purchase-order/${po.id}`} className="font-mono text-xs text-primary hover:underline">
                        {po.nomor}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{tanggal(po.tanggal)}</Td>
                    <Td className="font-medium">{po.supplier?.nama ?? '-'}</Td>
                    <Td className="tabular text-right font-medium">{rupiah(po.total)}</Td>
                    <Td>
                      <Badge variant={VARIAN_STATUS[po.status]}>{LABEL_STATUS[po.status]}</Badge>
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
