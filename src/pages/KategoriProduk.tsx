import { useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { kutipFilterPostgrest } from '@/lib/utils'
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
import type { KategoriProduk as KategoriRow } from '@/types/db'

function useKategoriProduk(cari: string) {
  return useQuery({
    queryKey: ['kategori-produk-list', cari],
    queryFn: async () => {
      let q = supabase.from('kategori_produk').select('*')
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

export function KategoriProduk() {
  const [cari, setCari] = useState('')
  const { data, isLoading, error, isFetching } = useKategoriProduk(cari)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Kategori Produk')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Pengelompokan produk untuk filter & pelaporan')}</p>
        </div>
        <div className="flex flex-1 justify-end gap-2 sm:flex-none">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Cari nama atau kode..." value={cari} onChange={(e) => setCari(e.target.value)} />
          </div>
          <Button variant="pill" asChild>
            <Link to="/kategori-produk/baru">
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
            <KondisiKosong pesan="Belum ada kategori." />
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
                      <Link to={`/kategori-produk/${k.id}`} className="font-medium text-primary hover:underline">
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
