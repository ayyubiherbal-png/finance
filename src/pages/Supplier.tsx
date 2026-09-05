import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
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
import type { Supplier as SupplierRow } from '@/types/db'

type SupplierBaris = SupplierRow & { kabupaten_kota: { nama: string } | null }

function useSupplier(cari: string) {
  return useQuery({
    queryKey: ['supplier', cari],
    queryFn: async () => {
      let q = supabase.from('supplier').select('*, kabupaten_kota:kabupaten_kode(nama)')
      if (cari.trim()) {
        const pola = `%${cari.trim()}%`
        q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
      }
      const { data, error } = await q.order('nama').limit(200).returns<SupplierBaris[]>()
      if (error) throw error
      return data ?? []
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

export function Supplier() {
  const [cari, setCari] = useState('')
  const { data, isLoading, error, isFetching } = useSupplier(cari)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Supplier</h1>
          <p className="text-sm text-muted-foreground">Sumber barang untuk Purchase Order</p>
        </div>
        <div className="flex flex-1 justify-end gap-2 sm:flex-none">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Cari nama atau kode..." value={cari} onChange={(e) => setCari(e.target.value)} />
          </div>
          <Button asChild>
            <Link to="/supplier/baru">
              <Plus className="h-4 w-4" />
              Supplier Baru
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
            <KondisiKosong pesan="Belum ada supplier." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th>Kode</Th>
                  <Th>Nama</Th>
                  <Th>Kontak</Th>
                  <Th>Kabupaten/Kota</Th>
                  <Th>Termin</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((s) => (
                  <Tr key={s.id}>
                    <Td className="font-mono text-xs">{s.kode}</Td>
                    <Td>
                      <Link to={`/supplier/${s.id}`} className="font-medium text-primary hover:underline">
                        {s.nama}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{s.kontak_nama ?? '-'}</Td>
                    <Td className="text-muted-foreground">{s.kabupaten_kota?.nama ?? s.kota ?? '-'}</Td>
                    <Td className="text-muted-foreground">{s.termin_hari > 0 ? `${s.termin_hari} hari` : 'COD'}</Td>
                    <Td className="text-right">{!s.aktif ? <Badge variant="netral">Nonaktif</Badge> : null}</Td>
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
