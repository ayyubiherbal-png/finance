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
import type { StatusBayar, StatusDokumen } from '@/types/db'

interface BarisFaktur {
  id: string
  nomor: string
  tanggal: string
  jatuh_tempo: string
  status: StatusDokumen
  status_bayar: StatusBayar
  total: number
  sisa: number
  supplier: { nama: string } | null
}

const LABEL_BAYAR: Record<StatusBayar, string> = {
  belum: 'Belum Bayar',
  sebagian: 'Bayar Sebagian',
  lunas: 'Lunas',
}
const VARIAN_BAYAR: Record<StatusBayar, 'netral' | 'peringatan' | 'sukses'> = {
  belum: 'peringatan',
  sebagian: 'peringatan',
  lunas: 'sukses',
}

function useDaftarFaktur(cari: string, statusBayar: string) {
  return useQuery({
    queryKey: ['faktur-pembelian', cari, statusBayar],
    queryFn: async () => {
      let q = supabase
        .from('faktur_pembelian')
        .select('id, nomor, tanggal, jatuh_tempo, status, status_bayar, total, sisa, supplier:supplier_id(nama)')
      if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
      if (statusBayar) q = q.eq('status_bayar', statusBayar)
      const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(100)
      if (error) throw error
      return (data ?? []) as unknown as BarisFaktur[]
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

export function FakturPembelian() {
  const [cari, setCari] = useState('')
  const [statusBayar, setStatusBayar] = useState('')
  const { data, isLoading, error, isFetching } = useDaftarFaktur(cari, statusBayar)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Faktur Pembelian</h1>
          <p className="text-sm text-muted-foreground">Tagihan dari supplier, ditagihkan dari satu atau beberapa Penerimaan Barang</p>
        </div>
        <Button asChild>
          <Link to="/faktur-pembelian/baru">
            <Plus className="h-4 w-4" />
            Faktur Baru
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Cari nomor faktur..." value={cari} onChange={(e) => setCari(e.target.value)} />
        </div>
        <Select className="w-full sm:w-48" value={statusBayar} onChange={(e) => setStatusBayar(e.target.value)}>
          <option value="">Semua status bayar</option>
          {Object.entries(LABEL_BAYAR).map(([v, l]) => (
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
            <KondisiKosong pesan="Belum ada Faktur Pembelian." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th>Nomor</Th>
                  <Th>Tanggal</Th>
                  <Th>Supplier</Th>
                  <Th>Jatuh tempo</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Sisa</Th>
                  <Th>Status</Th>
                  <Th>Bayar</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((f) => (
                  <Tr key={f.id}>
                    <Td>
                      <Link to={`/faktur-pembelian/${f.id}`} className="font-mono text-xs text-primary hover:underline">
                        {f.nomor}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{tanggal(f.tanggal)}</Td>
                    <Td className="font-medium">{f.supplier?.nama ?? '-'}</Td>
                    <Td className="text-muted-foreground">{tanggal(f.jatuh_tempo)}</Td>
                    <Td className="tabular text-right font-medium">{rupiah(f.total)}</Td>
                    <Td className="tabular text-right">{f.sisa > 0 ? rupiah(f.sisa) : '-'}</Td>
                    <Td>
                      <Badge variant={VARIAN_STATUS[f.status]}>{LABEL_STATUS[f.status]}</Badge>
                    </Td>
                    <Td>
                      <Badge variant={VARIAN_BAYAR[f.status_bayar]}>{LABEL_BAYAR[f.status_bayar]}</Badge>
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
