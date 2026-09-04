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
import type { MetodeBayar, StatusDokumen } from '@/types/db'

interface BarisKas {
  id: string
  nomor: string
  tanggal: string
  metode: MetodeBayar
  jumlah: number
  status: StatusDokumen
  pelanggan: { nama: string } | null
}

export const LABEL_METODE: Record<MetodeBayar, string> = {
  tunai: 'Tunai',
  transfer: 'Transfer',
  qris: 'QRIS',
  giro: 'Giro',
  kartu: 'Kartu',
}

function useDaftarKas(cari: string, status: string) {
  return useQuery({
    queryKey: ['penerimaan-kas', cari, status],
    queryFn: async () => {
      let q = supabase.from('penerimaan_kas').select('id, nomor, tanggal, metode, jumlah, status, pelanggan:pelanggan_id(nama)')
      if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
      if (status) q = q.eq('status', status)
      const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(100)
      if (error) throw error
      return (data ?? []) as unknown as BarisKas[]
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

export function PenerimaanKas() {
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState('')
  const { data, isLoading, error, isFetching } = useDaftarKas(cari, status)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Penerimaan Kas</h1>
          <p className="text-sm text-muted-foreground">Pembayaran dari pelanggan, dialokasikan ke faktur</p>
        </div>
        <Button asChild>
          <Link to="/penerimaan-kas/baru">
            <Plus className="h-4 w-4" />
            Catat Pembayaran
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
          {/* Penerimaan kas cuma pernah 'disetujui' (default saat dibuat) atau 'dibatalkan'. */}
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
            <KondisiKosong pesan="Belum ada Penerimaan Kas." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th>Nomor</Th>
                  <Th>Tanggal</Th>
                  <Th>Pelanggan</Th>
                  <Th>Metode</Th>
                  <Th className="text-right">Jumlah</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((k) => (
                  <Tr key={k.id}>
                    <Td>
                      <Link to={`/penerimaan-kas/${k.id}`} className="font-mono text-xs text-primary hover:underline">
                        {k.nomor}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{tanggal(k.tanggal)}</Td>
                    <Td className="font-medium">{k.pelanggan?.nama ?? '-'}</Td>
                    <Td className="text-muted-foreground">{LABEL_METODE[k.metode]}</Td>
                    <Td className="tabular text-right font-medium">{rupiah(k.jumlah)}</Td>
                    <Td>
                      <Badge variant={VARIAN_STATUS[k.status]}>{LABEL_STATUS[k.status]}</Badge>
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
