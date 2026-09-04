import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tanggal as fmtTanggal } from '@/lib/format'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  KondisiKosong,
  PesanError,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui'
import type { SumberPelanggan, TipePelanggan, VPelangganRingkas } from '@/types/db'

function usePelanggan(cari: string) {
  return useQuery({
    queryKey: ['pelanggan', cari],
    queryFn: async () => {
      // Filter (.or) harus dipasang sebelum .order/.limit.
      let q = supabase.from('v_pelanggan_ringkas').select('*')

      if (cari.trim()) {
        const pola = `%${cari.trim()}%`
        q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
      }

      const { data, error } = await q.order('nama').limit(200).returns<VPelangganRingkas[]>()
      if (error) throw error
      return data ?? []
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

const LABEL_TIPE: Record<TipePelanggan, string> = {
  customer: 'Customer',
  mitra: 'Mitra',
  horeka: 'Horeka',
  perusahaan: 'Perusahaan',
}

const LABEL_SUMBER: Record<SumberPelanggan, string> = {
  relasi: 'Relasi',
  sosmed: 'Sosmed',
  shopee: 'Shopee',
  tiktok: 'TikTok',
  website: 'Website',
  custom: 'Custom',
}

function labelSumber(p: VPelangganRingkas) {
  if (!p.sumber) return '-'
  if (p.sumber === 'custom') return p.sumber_custom || 'Custom'
  return LABEL_SUMBER[p.sumber]
}

export function Pelanggan() {
  const [cari, setCari] = useState('')
  const { data, isLoading, error, isFetching } = usePelanggan(cari)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Pelanggan</h1>
          <p className="text-sm text-muted-foreground">Data master -- piutang berjalan ada di Laporan Piutang</p>
        </div>

        <div className="flex flex-1 justify-end gap-2 sm:flex-none">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Cari nama atau kode..."
              value={cari}
              onChange={(e) => setCari(e.target.value)}
            />
          </div>
          <Button asChild>
            <Link to="/pelanggan/baru">
              <Plus className="h-4 w-4" />
              Pelanggan Baru
            </Link>
          </Button>
        </div>
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
            <KondisiKosong pesan="Belum ada pelanggan." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th>ID</Th>
                  <Th>Nama</Th>
                  <Th>Tipe</Th>
                  <Th>Kontak</Th>
                  <Th>Sales</Th>
                  <Th>Telepon</Th>
                  <Th>WhatsApp</Th>
                  <Th>Email</Th>
                  <Th>Sumber</Th>
                  <Th>Tanggal lahir</Th>
                  <Th>Media sosial</Th>
                  <Th>Alamat</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((p) => (
                  <Tr key={p.pelanggan_id}>
                    <Td className="font-mono text-xs">{p.kode}</Td>
                    <Td className="font-medium">
                      <Link to={`/pelanggan/${p.pelanggan_id}`} className="text-primary hover:underline">
                        {p.nama}
                      </Link>
                    </Td>
                    <Td>
                      <Badge variant="netral">{LABEL_TIPE[p.tipe]}</Badge>
                    </Td>
                    <Td className="text-muted-foreground">{p.kontak_nama || '-'}</Td>
                    <Td className="text-muted-foreground">{p.sales_nama || '-'}</Td>
                    <Td className="text-muted-foreground">{p.telepon || '-'}</Td>
                    <Td className="text-muted-foreground">{p.whatsapp || '-'}</Td>
                    <Td className="text-muted-foreground">{p.email || '-'}</Td>
                    <Td className="text-muted-foreground">{labelSumber(p)}</Td>
                    <Td className="text-muted-foreground">{p.tanggal_lahir ? fmtTanggal(p.tanggal_lahir) : '-'}</Td>
                    <Td className="text-muted-foreground">{p.sosial_media || '-'}</Td>
                    <Td className="max-w-xs text-muted-foreground">{p.alamat_lengkap || '-'}</Td>
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
