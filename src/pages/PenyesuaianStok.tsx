import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tanggal } from '@/lib/format'
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

interface BarisPenyesuaian {
  id: string
  nomor: string
  tanggal: string
  jenis: 'penyesuaian' | 'saldo_awal'
  status: StatusDokumen
  alasan: string | null
  gudang: { nama: string } | null
}

const LABEL_JENIS = {
  penyesuaian: 'Penyesuaian',
  saldo_awal: 'Saldo Awal',
}

function useDaftar(cari: string, status: string) {
  return useQuery({
    queryKey: ['penyesuaian-stok', cari, status],
    queryFn: async () => {
      let q = supabase.from('penyesuaian_stok').select('id, nomor, tanggal, jenis, status, alasan, gudang:gudang_id(nama)')
      if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
      if (status) q = q.eq('status', status)
      const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(100)
      if (error) throw error
      return (data ?? []) as unknown as BarisPenyesuaian[]
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

export function PenyesuaianStok() {
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState('')
  const { data, isLoading, error, isFetching } = useDaftar(cari, status)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Penyesuaian Stok</h1>
          <p className="text-sm text-muted-foreground">Saldo awal, koreksi hitung fisik, barang rusak/hilang</p>
        </div>
        <Button asChild>
          <Link to="/penyesuaian-stok/baru">
            <Plus className="h-4 w-4" />
            Penyesuaian Baru
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
            <KondisiKosong pesan="Belum ada Penyesuaian Stok." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th>Nomor</Th>
                  <Th>Tanggal</Th>
                  <Th>Gudang</Th>
                  <Th>Jenis</Th>
                  <Th>Alasan</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      <Link to={`/penyesuaian-stok/${p.id}`} className="font-mono text-xs text-primary hover:underline">
                        {p.nomor}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{tanggal(p.tanggal)}</Td>
                    <Td className="text-muted-foreground">{p.gudang?.nama ?? '-'}</Td>
                    <Td>
                      <Badge variant="netral">{LABEL_JENIS[p.jenis]}</Badge>
                    </Td>
                    <Td className="text-muted-foreground">{p.alasan ?? '-'}</Td>
                    <Td>
                      <Badge variant={VARIAN_STATUS[p.status]}>{LABEL_STATUS[p.status]}</Badge>
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
