import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { angka, rupiah } from '@/lib/format'
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
import type { VStokProduk } from '@/types/db'

function useProduk(cari: string) {
  return useQuery({
    queryKey: ['produk', cari],
    queryFn: async () => {
      // Filter (.or) harus dipasang sebelum .order/.limit, karena setelah itu
      // builder-nya berubah jadi transform builder yang tidak punya .or().
      let q = supabase.from('v_stok_produk').select('*')

      if (cari.trim()) {
        const pola = `%${cari.trim()}%`
        q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
      }

      const { data, error } = await q.order('nama').limit(200).returns<VStokProduk[]>()
      if (error) throw error
      return data ?? []
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

export function Produk() {
  const [cari, setCari] = useState('')
  const { data, isLoading, error, isFetching } = useProduk(cari)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Produk</h1>
          <p className="text-sm text-muted-foreground">
            Stok lintas gudang dan nilai persediaan berdasarkan HPP rata-rata
          </p>
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
            <Link to="/produk/baru">
              <Plus className="h-4 w-4" />
              Produk Baru
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
            <KondisiKosong pesan="Belum ada produk. Tambahkan lewat master produk." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th>Kode</Th>
                  <Th>Nama</Th>
                  <Th>Kategori</Th>
                  <Th className="text-right">Stok</Th>
                  <Th>Satuan</Th>
                  <Th className="text-right">HPP</Th>
                  <Th className="text-right">Nilai persediaan</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((p) => (
                  <Tr key={p.produk_id}>
                    <Td className="font-mono text-xs">{p.kode}</Td>
                    <Td className="font-medium">
                      <div className="flex items-center gap-2">
                        <Link to={`/produk/${p.produk_id}`} className="text-primary hover:underline">
                          {p.nama}
                        </Link>
                        {p.perlu_restock ? (
                          <Badge variant={Number(p.qty) <= 0 ? 'bahaya' : 'peringatan'}>
                            {Number(p.qty) <= 0 ? 'Habis' : 'Menipis'}
                          </Badge>
                        ) : null}
                      </div>
                    </Td>
                    <Td className="text-muted-foreground">{p.kategori ?? '-'}</Td>
                    <Td className="tabular text-right">{angka(p.qty)}</Td>
                    <Td className="text-xs text-muted-foreground">{p.satuan_dasar}</Td>
                    <Td className="tabular text-right">{rupiah(p.hpp_rata2)}</Td>
                    <Td className="tabular text-right font-medium">{rupiah(p.nilai_persediaan)}</Td>
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
