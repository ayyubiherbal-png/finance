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
import type { KanalPenjualan, StatusDokumen } from '@/types/db'

interface BarisSO {
  id: string
  nomor: string
  tanggal: string
  status: StatusDokumen
  kanal: KanalPenjualan
  total: number
  pelanggan: { nama: string } | null
}

const LABEL_STATUS: Record<StatusDokumen, string> = {
  draf: 'Draf',
  menunggu: 'Menunggu',
  disetujui: 'Disetujui',
  sebagian: 'Terkirim Sebagian',
  selesai: 'Selesai',
  ditolak: 'Ditolak',
  dibatalkan: 'Dibatalkan',
}

const VARIAN_STATUS: Record<StatusDokumen, 'netral' | 'default' | 'sukses' | 'peringatan' | 'bahaya'> = {
  draf: 'netral',
  menunggu: 'peringatan',
  disetujui: 'default',
  sebagian: 'peringatan',
  selesai: 'sukses',
  ditolak: 'bahaya',
  dibatalkan: 'bahaya',
}

const LABEL_KANAL: Record<KanalPenjualan, string> = {
  canvassing: 'Canvassing',
  tokopedia: 'Tokopedia',
  shopee: 'Shopee',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  lainnya: 'Lainnya',
}

function useDaftarSO(cari: string, status: string) {
  return useQuery({
    queryKey: ['sales-order', cari, status],
    queryFn: async () => {
      let q = supabase
        .from('sales_order')
        .select('id, nomor, tanggal, status, kanal, total, pelanggan:pelanggan_id(nama)')

      if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
      if (status) q = q.eq('status', status)

      const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(100)
      if (error) throw error
      return (data ?? []) as unknown as BarisSO[]
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

export function SalesOrder() {
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState('')
  const { data, isLoading, error, isFetching } = useDaftarSO(cari, status)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Sales Order</h1>
          <p className="text-sm text-muted-foreground">Pesanan dari canvassing maupun kanal online</p>
        </div>
        <Button asChild>
          <Link to="/sales-order/baru">
            <Plus className="h-4 w-4" />
            SO Baru
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Cari nomor SO..."
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />
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
            <KondisiKosong pesan="Belum ada Sales Order." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th>Nomor</Th>
                  <Th>Tanggal</Th>
                  <Th>Pelanggan</Th>
                  <Th>Kanal</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((so) => (
                  <Tr key={so.id} className="cursor-pointer">
                    <Td>
                      <Link to={`/sales-order/${so.id}`} className="font-mono text-xs text-primary hover:underline">
                        {so.nomor}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{tanggal(so.tanggal)}</Td>
                    <Td className="font-medium">{so.pelanggan?.nama ?? '-'}</Td>
                    <Td>
                      <Badge variant="netral">{LABEL_KANAL[so.kanal]}</Badge>
                    </Td>
                    <Td className="tabular text-right font-medium">{rupiah(so.total)}</Td>
                    <Td>
                      <Badge variant={VARIAN_STATUS[so.status]}>{LABEL_STATUS[so.status]}</Badge>
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

export { LABEL_STATUS, VARIAN_STATUS, LABEL_KANAL }
