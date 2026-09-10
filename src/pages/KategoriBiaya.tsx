import { useMemo, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
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
import type { KategoriBiaya as KategoriRow, NamaPengeluaran } from '@/types/db'

function useKategoriBiayaDenganItem() {
  return useQuery({
    queryKey: ['kategori-biaya-list'],
    queryFn: async () => {
      const [kategoriRes, itemRes] = await Promise.all([
        supabase.from('kategori_biaya').select('*').order('kode').returns<KategoriRow[]>(),
        supabase.from('nama_pengeluaran').select('*').order('kode').returns<NamaPengeluaran[]>(),
      ])
      if (kategoriRes.error) throw kategoriRes.error
      if (itemRes.error) throw itemRes.error
      return { kategori: kategoriRes.data ?? [], item: itemRes.data ?? [] }
    },
  })
}

interface BarisEksporKategoriBiaya {
  kodeKategori: string
  namaKategori: string
  operasionalKategori: boolean
  kode: string
  nama: string
  aktif: boolean
}

const KOLOM_EKSPOR_KATEGORI_BIAYA: KolomEkspor<BarisEksporKategoriBiaya>[] = [
  { header: 'Kode Kategori', nilai: (r) => r.kodeKategori },
  { header: 'Kategori', nilai: (r) => r.namaKategori },
  { header: 'Operasional', nilai: (r) => (r.operasionalKategori ? 'Ya' : 'Tidak') },
  { header: 'Kode', nilai: (r) => r.kode },
  { header: 'Nama Pengeluaran', nilai: (r) => r.nama },
  { header: 'Aktif', nilai: (r) => (r.aktif ? 'Ya' : 'Tidak') },
]

export function KategoriBiaya() {
  const [cari, setCari] = useState('')
  const { data, isLoading, error } = useKategoriBiayaDenganItem()

  const itemPerKategori = useMemo(() => {
    const peta = new Map<string, NamaPengeluaran[]>()
    for (const i of data?.item ?? []) {
      const arr = peta.get(i.kategori_biaya_id) ?? []
      arr.push(i)
      peta.set(i.kategori_biaya_id, arr)
    }
    return peta
  }, [data])

  const pola = cari.trim().toLowerCase()
  const kategoriTersaring = (data?.kategori ?? []).filter((k) => {
    if (!pola) return true
    if (k.nama.toLowerCase().includes(pola) || k.kode.toLowerCase().includes(pola)) return true
    return (itemPerKategori.get(k.id) ?? []).some((i) => i.nama.toLowerCase().includes(pola) || i.kode.toLowerCase().includes(pola))
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Kategori Biaya')}</h1>
          <p className="text-sm text-muted-foreground">
            {tt('Kode kategori (induk) mengelompokkan Nama Pengeluaran (sub-kode) untuk Pengeluaran Kas')}
          </p>
        </div>
        <div className="flex flex-1 flex-wrap justify-end gap-2 sm:flex-none">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Cari kategori atau nama pengeluaran..." value={cari} onChange={(e) => setCari(e.target.value)} />
          </div>
          <TombolEkspor
            ambilData={async () => {
              const hasil: BarisEksporKategoriBiaya[] = []
              for (const k of data?.kategori ?? []) {
                for (const i of itemPerKategori.get(k.id) ?? []) {
                  hasil.push({
                    kodeKategori: k.kode,
                    namaKategori: k.nama,
                    operasionalKategori: k.operasional,
                    kode: i.kode,
                    nama: i.nama,
                    aktif: i.aktif,
                  })
                }
              }
              return hasil
            }}
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

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : error ? (
        <PesanError error={error} />
      ) : kategoriTersaring.length === 0 ? (
        <Card>
          <CardContent className="p-4">
            <KondisiKosong pesan="Belum ada kategori biaya." />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {kategoriTersaring.map((k, idx) => {
            const item = itemPerKategori.get(k.id) ?? []
            return (
              <div key={k.id} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold">
                    <Link to={`/kategori-biaya/${k.id}`} className="hover:underline">
                      {idx + 1}. {k.nama} &middot; {k.kode}
                    </Link>
                    {!k.operasional ? (
                      <Badge variant="peringatan" className="ml-2">
                        Non-operasional
                      </Badge>
                    ) : null}
                    {!k.aktif ? (
                      <Badge variant="netral" className="ml-2">
                        Nonaktif
                      </Badge>
                    ) : null}
                  </h2>
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/nama-pengeluaran/baru?kategori=${k.id}`}>
                      <Plus className="h-4 w-4" />
                      Tambah
                    </Link>
                  </Button>
                </div>
                <Card>
                  <CardContent className="p-0 pb-2">
                    {item.length === 0 ? (
                      <KondisiKosong pesan="Belum ada nama pengeluaran di kategori ini." />
                    ) : (
                      <Table>
                        <Thead>
                          <Tr>
                            <Th>Kode</Th>
                            <Th>Nama Pengeluaran</Th>
                            <Th></Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {item.map((i) => (
                            <Tr key={i.id}>
                              <Td className="font-mono text-xs">{i.kode}</Td>
                              <Td>
                                <Link to={`/nama-pengeluaran/${i.id}`} className="font-medium text-primary hover:underline">
                                  {i.nama}
                                </Link>
                              </Td>
                              <Td className="text-right">{!i.aktif ? <Badge variant="netral">Nonaktif</Badge> : null}</Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
