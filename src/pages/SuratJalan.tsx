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

interface BarisSJ {
  id: string
  nomor: string
  tanggal: string
  status: StatusDokumen
  pelanggan: { nama: string } | null
  gudang: { nama: string } | null
}

function useDaftarSJ(cari: string, status: string) {
  return useQuery({
    queryKey: ['surat-jalan', cari, status],
    queryFn: async () => {
      let q = supabase.from('surat_jalan').select('id, nomor, tanggal, status, pelanggan:pelanggan_id(nama), gudang:gudang_id(nama)')
      if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
      if (status) q = q.eq('status', status)
      const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(100)
      if (error) throw error
      return (data ?? []) as unknown as BarisSJ[]
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

export function SuratJalan() {
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState('')
  const { data, isLoading, error, isFetching } = useDaftarSJ(cari, status)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Surat Jalan</h1>
        <p className="text-sm text-muted-foreground">
          Dibuat dari Sales Order yang sudah disetujui. Untuk membuat baru, buka SO-nya dan klik "Buat Surat Jalan".
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Cari nomor SJ..." value={cari} onChange={(e) => setCari(e.target.value)} />
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
            <KondisiKosong pesan="Belum ada Surat Jalan." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th>Nomor</Th>
                  <Th>Tanggal</Th>
                  <Th>Pelanggan</Th>
                  <Th>Gudang</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((sj) => (
                  <Tr key={sj.id}>
                    <Td>
                      <Link to={`/surat-jalan/${sj.id}`} className="font-mono text-xs text-primary hover:underline">
                        {sj.nomor}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{tanggal(sj.tanggal)}</Td>
                    <Td className="font-medium">{sj.pelanggan?.nama ?? '-'}</Td>
                    <Td className="text-muted-foreground">{sj.gudang?.nama ?? '-'}</Td>
                    <Td>
                      <Badge variant={VARIAN_STATUS[sj.status]}>{LABEL_STATUS[sj.status]}</Badge>
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
