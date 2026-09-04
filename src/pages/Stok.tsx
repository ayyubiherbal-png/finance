import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { angka, rupiah } from '@/lib/format'
import { useGudangAktif } from '@/lib/queries'
import {
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

interface BarisStokGudang {
  produk_id: string
  kode: string
  nama: string
  gudang_id: string
  kode_gudang: string
  nama_gudang: string
  qty: number
  hpp_rata2: number
  nilai: number
}

function useStokGudang(gudangId: string, cari: string) {
  return useQuery({
    queryKey: ['stok-gudang', gudangId, cari],
    queryFn: async () => {
      let q = supabase.from('v_stok_gudang').select('*')
      if (gudangId) q = q.eq('gudang_id', gudangId)
      if (cari.trim()) {
        const pola = `%${cari.trim()}%`
        q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
      }
      const { data, error } = await q.order('nama_gudang').order('nama').limit(500).returns<BarisStokGudang[]>()
      if (error) throw error
      return data ?? []
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

export function Stok() {
  const { data: gudang } = useGudangAktif()
  const [gudangId, setGudangId] = useState('')
  const [cari, setCari] = useState('')
  const { data, isLoading, error, isFetching } = useStokGudang(gudangId, cari)

  const totalNilai = (data ?? []).reduce((t, b) => t + Number(b.nilai), 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Stok per Gudang</h1>
        <p className="text-sm text-muted-foreground">Saldo persediaan berjalan, dari kartu stok</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Cari nama atau kode..." value={cari} onChange={(e) => setCari(e.target.value)} />
        </div>
        {(gudang?.length ?? 0) > 1 ? (
          <Select className="w-full sm:w-48" value={gudangId} onChange={(e) => setGudangId(e.target.value)}>
            <option value="">Semua gudang</option>
            {(gudang ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.nama}
              </option>
            ))}
          </Select>
        ) : null}
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
            <KondisiKosong pesan="Belum ada stok tercatat." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th>Kode</Th>
                  <Th>Produk</Th>
                  {(gudang?.length ?? 0) > 1 ? <Th>Gudang</Th> : null}
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">HPP</Th>
                  <Th className="text-right">Nilai</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((b) => (
                  <Tr key={`${b.produk_id}-${b.gudang_id}`}>
                    <Td className="font-mono text-xs">{b.kode}</Td>
                    <Td className="font-medium">{b.nama}</Td>
                    {(gudang?.length ?? 0) > 1 ? <Td className="text-muted-foreground">{b.nama_gudang}</Td> : null}
                    <Td className="tabular text-right">{angka(b.qty)}</Td>
                    <Td className="tabular text-right">{rupiah(b.hpp_rata2)}</Td>
                    <Td className="tabular text-right font-medium">{rupiah(b.nilai)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      {data && data.length > 0 ? (
        <p className="text-right text-sm text-muted-foreground">
          Total nilai persediaan: <span className="tabular font-medium text-foreground">{rupiah(totalNilai)}</span>
        </p>
      ) : null}
    </div>
  )
}
