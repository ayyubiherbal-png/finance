import { useEffect, useState } from 'react'
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
  Paginasi,
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

const UKURAN_HALAMAN = 50

function useKategoriProduk(cari: string, halaman: number) {
  return useQuery({
    queryKey: ['kategori-produk-list', cari, halaman],
    queryFn: async () => {
      let q = supabase.from('kategori_produk').select('*', { count: 'exact' })
      if (cari.trim()) {
        const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
        q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
      }
      const mulai = (halaman - 1) * UKURAN_HALAMAN
      const { data, error, count } = await q.order('nama').range(mulai, mulai + UKURAN_HALAMAN - 1).returns<KategoriRow[]>()
      if (error) throw error
      return { baris: data ?? [], total: count ?? 0 }
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

const KOLOM_EKSPOR_KATEGORI_PRODUK: KolomEkspor<KategoriRow>[] = [
  { header: 'Kode', nilai: (r) => r.kode },
  { header: 'Nama', nilai: (r) => r.nama },
  { header: 'Aktif', nilai: (r) => (r.aktif ? 'Ya' : 'Tidak') },
]

export function KategoriProduk() {
  const [cari, setCari] = useState('')
  const [halaman, setHalaman] = useState(1)
  const { data, isLoading, error, isFetching } = useKategoriProduk(cari, halaman)
  useEffect(() => setHalaman(1), [cari])

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
          <TombolEkspor
            ambilData={async () => {
              let q = supabase.from('kategori_produk').select('*')
              if (cari.trim()) {
                const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
                q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
              }
              const { data, error } = await q.order('nama').limit(10000).returns<KategoriRow[]>()
              if (error) throw error
              return data ?? []
            }}
            kolom={KOLOM_EKSPOR_KATEGORI_PRODUK}
            opsi={{ namaFile: `kategori-produk-${tanggalISO()}`, judul: tt('Kategori Produk') }}
          />
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
          ) : !data || data.baris.length === 0 ? (
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
                {data.baris.map((k) => (
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
          <Paginasi halaman={halaman} ukuranHalaman={UKURAN_HALAMAN} total={data?.total ?? 0} onUbah={setHalaman} />
        </CardContent>
      </Card>
    </div>
  )
}
