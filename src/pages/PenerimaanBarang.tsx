import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tanggal } from '@/lib/format'
import {
  Badge,
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

interface BarisPB {
  id: string
  nomor: string
  tanggal: string
  status: StatusDokumen
  supplier: { nama: string } | null
  gudang: { nama: string } | null
}

function useDaftarPB(cari: string, status: string) {
  return useQuery({
    queryKey: ['penerimaan-barang', cari, status],
    queryFn: async () => {
      let q = supabase
        .from('penerimaan_barang')
        .select('id, nomor, tanggal, status, supplier:supplier_id(nama), gudang:gudang_id(nama)')
      if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
      if (status) q = q.eq('status', status)
      const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(100)
      if (error) throw error
      return (data ?? []) as unknown as BarisPB[]
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

export function PenerimaanBarang() {
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState('')
  const { data, isLoading, error, isFetching } = useDaftarPB(cari, status)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Penerimaan Barang</h1>
        <p className="text-sm text-muted-foreground">
          Dibuat dari Purchase Order yang sudah disetujui. Untuk membuat baru, buka PO-nya dan klik "Buat Penerimaan Barang".
        </p>
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
            <KondisiKosong pesan="Belum ada Penerimaan Barang." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th>Nomor</Th>
                  <Th>Tanggal</Th>
                  <Th>Supplier</Th>
                  <Th>Gudang</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((pb) => (
                  <Tr key={pb.id}>
                    <Td>
                      <Link to={`/penerimaan-barang/${pb.id}`} className="font-mono text-xs text-primary hover:underline">
                        {pb.nomor}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{tanggal(pb.tanggal)}</Td>
                    <Td className="font-medium">{pb.supplier?.nama ?? '-'}</Td>
                    <Td className="text-muted-foreground">{pb.gudang?.nama ?? '-'}</Td>
                    <Td>
                      <Badge variant={VARIAN_STATUS[pb.status]}>{LABEL_STATUS[pb.status]}</Badge>
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
