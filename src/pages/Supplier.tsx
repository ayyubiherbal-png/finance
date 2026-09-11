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
import type { Supplier as SupplierRow } from '@/types/db'
import { daftarBerhalaman } from '@/lib/pagination'

type SupplierBaris = SupplierRow & { kabupaten_kota: { nama: string } | null }

const SELECT_SUPPLIER = '*, kabupaten_kota:kabupaten_kode(nama)'

const UKURAN_HALAMAN = 50
function useSupplier(cari: string, halaman: number) {
  return useQuery({
    queryKey: ['supplier', cari, halaman],
    queryFn: async () => {
      const mulai = (halaman - 1) * UKURAN_HALAMAN
      let q = supabase.from('supplier').select(SELECT_SUPPLIER, { count: 'exact' })
      if (cari.trim()) {
        const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
        q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
      }
      const { data, count, error } = await q.order('nama').range(mulai, mulai + UKURAN_HALAMAN - 1).returns<SupplierBaris[]>()
      if (error) throw error
      return daftarBerhalaman(data ?? [], count)
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

const KOLOM_EKSPOR_SUPPLIER: KolomEkspor<SupplierBaris>[] = [
  { header: 'Kode', nilai: (r) => r.kode },
  { header: 'Nama', nilai: (r) => r.nama },
  { header: 'Kontak', nilai: (r) => r.kontak_nama ?? '-' },
  { header: 'Kabupaten/Kota', nilai: (r) => r.kabupaten_kota?.nama ?? r.kota ?? '-' },
  { header: 'Termin', nilai: (r) => (r.termin_hari > 0 ? `${r.termin_hari} hari` : 'COD') },
  { header: 'Aktif', nilai: (r) => (r.aktif ? 'Ya' : 'Tidak') },
]

export function Supplier() {
  const [cari, setCari] = useState('')
  const [halaman, setHalaman] = useState(1)
  const { data, isLoading, error, isFetching } = useSupplier(cari, halaman)
  useEffect(() => setHalaman(1), [cari])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Supplier')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Sumber barang untuk Purchase Order')}</p>
        </div>
        <div className="flex flex-1 justify-end gap-2 sm:flex-none">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Cari nama atau kode..." value={cari} onChange={(e) => setCari(e.target.value)} />
          </div>
          <TombolEkspor
            ambilData={async () => {
              let q = supabase.from('supplier').select(SELECT_SUPPLIER)
              if (cari.trim()) {
                const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
                q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
              }
              const { data, error } = await q.order('nama').limit(10000).returns<SupplierBaris[]>()
              if (error) throw error
              return data ?? []
            }}
            kolom={KOLOM_EKSPOR_SUPPLIER}
            opsi={{ namaFile: `supplier-${tanggalISO()}`, judul: tt('Supplier') }}
          />
          <Button variant="pill" asChild>
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
      <Paginasi halaman={halaman} ukuranHalaman={UKURAN_HALAMAN} total={data?.total ?? 0} onUbah={setHalaman} />
    </div>
  )
}
