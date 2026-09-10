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
import type { KategoriBiaya as KategoriRow } from '@/types/db'

function useKategoriBiaya(cari: string) {
  return useQuery({
    queryKey: ['kategori-biaya-list', cari],
    queryFn: async () => {
      let q = supabase.from('kategori_biaya').select('*')
      if (cari.trim()) {
        const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
        q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
      }
      const { data, error } = await q.order('nama').returns<KategoriRow[]>()
      if (error) throw error
      return data ?? []
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

const KOLOM_EKSPOR_KATEGORI_BIAYA: KolomEkspor<KategoriRow>[] = [
  { header: 'Kode', nilai: (r) => r.kode },
  { header: 'Nama', nilai: (r) => r.nama },
  { header: 'Aktif', nilai: (r) => (r.aktif ? 'Ya' : 'Tidak') },
]

export function KategoriBiaya() {
  const [cari, setCari] = useState('')
  const { data, isLoading, error, isFetching } = useKategoriBiaya(cari)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Kategori Biaya')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Pengelompokan biaya operasional untuk Pengeluaran Kas')}</p>
        </div>
        <div className="flex flex-1 justify-end gap-2 sm:flex-none">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Cari nama atau kode..." value={cari} onChange={(e) => setCari(e.target.value)} />
          </div>
          <TombolEkspor
            ambilData={async () => data ?? []}
            kolom={KOLOM_EKSPOR_KATEGORI_BIAYA}
            opsi={{ namaFile: `kategori-biaya-${tanggalISO()}`, judul: tt('Kategori Biaya') }}
          />
          <Button variant="pill" asChild>
            <Link to="/kategori-biaya/baru">
              <Plus className="h-4 w-4" />
              Kategori Baru
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
            <KondisiKosong pesan="Belum ada kategori biaya." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th>Kode</Th>
                  <Th>Nama</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((k) => (
                  <Tr key={k.id}>
                    <Td className="font-mono text-xs">{k.kode}</Td>
                    <Td>
                      <Link to={`/kategori-biaya/${k.id}`} className="font-medium text-primary hover:underline">
                        {k.nama}
                      </Link>
                    </Td>
                    <Td className="text-right">{!k.aktif ? <Badge variant="netral">Nonaktif</Badge> : null}</Td>
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
