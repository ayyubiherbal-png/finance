import { useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { kutipFilterPostgrest } from '@/lib/utils'
import { tanggalISO } from '@/lib/format'
import { TombolEkspor } from '@/components/TombolEkspor'
import type { KolomEkspor } from '@/lib/eksporData'
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
import type { Gudang as GudangRow } from '@/types/db'

function useGudang(cari: string) {
  return useQuery({
    queryKey: ['gudang', cari],
    queryFn: async () => {
      let q = supabase.from('gudang').select('*')
      if (cari.trim()) {
        const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
        q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
      }
      const { data, error } = await q.order('utama', { ascending: false }).order('nama').returns<GudangRow[]>()
      if (error) throw error
      return data ?? []
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

const KOLOM_EKSPOR_GUDANG: KolomEkspor<GudangRow>[] = [
  { header: 'Kode', nilai: (r) => r.kode },
  { header: 'Nama', nilai: (r) => r.nama },
  { header: 'Alamat', nilai: (r) => r.alamat ?? '-' },
  { header: 'Utama', nilai: (r) => (r.utama ? 'Ya' : 'Tidak') },
  { header: 'Aktif', nilai: (r) => (r.aktif ? 'Ya' : 'Tidak') },
]

export function Gudang() {
  const [cari, setCari] = useState('')
  const { data, isLoading, error, isFetching } = useGudang(cari)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Gudang')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Lokasi penyimpanan stok')}</p>
        </div>
        <div className="flex flex-1 justify-end gap-2 sm:flex-none">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Cari nama atau kode..." value={cari} onChange={(e) => setCari(e.target.value)} />
          </div>
          <TombolEkspor
            ambilData={async () => data ?? []}
            kolom={KOLOM_EKSPOR_GUDANG}
            opsi={{ namaFile: `gudang-${tanggalISO()}`, judul: tt('Gudang') }}
          />
          <Button variant="pill" asChild>
            <Link to="/gudang/baru">
              <Plus className="h-4 w-4" />
              Gudang Baru
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
            <KondisiKosong pesan="Belum ada gudang." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th>Kode</Th>
                  <Th>Nama</Th>
                  <Th>Alamat</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((g) => (
                  <Tr key={g.id}>
                    <Td className="font-mono text-xs">{g.kode}</Td>
                    <Td>
                      <Link to={`/gudang/${g.id}`} className="font-medium text-primary hover:underline">
                        {g.nama}
                      </Link>
                    </Td>
                    <Td className="max-w-sm truncate text-muted-foreground" title={g.alamat ?? undefined}>
                      {g.alamat ?? '-'}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {g.utama ? <Badge>Utama</Badge> : null}
                        {!g.aktif ? <Badge variant="netral">Nonaktif</Badge> : null}
                      </div>
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
