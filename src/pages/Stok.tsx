import { useEffect, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { angka, rupiah, tanggalISO } from '@/lib/format'
import { useGudangAktif } from '@/lib/queries'
import { kutipFilterPostgrest } from '@/lib/utils'
import { ambilSemuaBertahap } from '@/lib/ambilSemua'
import { TombolEkspor } from '@/components/TombolEkspor'
import type { KolomEkspor } from '@/lib/eksporData'
import {
  BarisInfo,
  Card,
  CardContent,
  DaftarMobile,
  Input,
  KartuBaris,
  KondisiKosong,
  Paginasi,
  PesanError,
  Select,
  Spinner,
  TabelDesktop,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui'
import { daftarBerhalaman } from '@/lib/pagination'

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

const UKURAN_HALAMAN = 50
function useStokGudang(gudangId: string, cari: string, halaman: number) {
  return useQuery({
    queryKey: ['stok-gudang', gudangId, cari, halaman],
    queryFn: async () => {
      const mulai = (halaman - 1) * UKURAN_HALAMAN
      let q = supabase.from('v_stok_gudang').select('*', { count: 'exact' })
      if (gudangId) q = q.eq('gudang_id', gudangId)
      if (cari.trim()) {
        const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
        q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
      }
      const { data, count, error } = await q.order('nama_gudang').order('nama').range(mulai, mulai + UKURAN_HALAMAN - 1).returns<BarisStokGudang[]>()
      if (error) throw error
      return daftarBerhalaman(data ?? [], count)
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

/** Total nilai persediaan & jumlah SKU untuk SELURUH hasil filter (bukan cuma halaman yang tampil). */
function useRingkasanStok(gudangId: string, cari: string) {
  return useQuery({
    queryKey: ['stok-ringkasan', gudangId, cari],
    queryFn: async () => {
      const baris = await ambilSemuaBertahap<Pick<BarisStokGudang, 'produk_id' | 'nilai'>>((dari, sampai) => {
        let q = supabase.from('v_stok_gudang').select('produk_id, nilai')
        if (gudangId) q = q.eq('gudang_id', gudangId)
        if (cari.trim()) {
          const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
          q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
        }
        return q.range(dari, sampai)
      })
      return {
        totalNilai: baris.reduce((t, b) => t + Number(b.nilai), 0),
        jumlahSku: new Set(baris.map((b) => b.produk_id)).size,
      }
    },
  })
}

/** Selalu se-perusahaan (lintas gudang) -- "perlu restock" dibandingkan terhadap stok_min per produk, bukan per gudang. */
function useJumlahPerluRestock() {
  return useQuery({
    queryKey: ['produk-perlu-restock-jumlah'],
    queryFn: async () => {
      const { count, error } = await supabase.from('v_stok_produk').select('produk_id', { count: 'exact', head: true }).eq('perlu_restock', true)
      if (error) throw error
      return count ?? 0
    },
  })
}

const KOLOM_EKSPOR_STOK: KolomEkspor<BarisStokGudang>[] = [
  { header: 'Kode', nilai: (r) => r.kode },
  { header: 'Produk', nilai: (r) => r.nama },
  { header: 'Gudang', nilai: (r) => r.nama_gudang },
  { header: 'Qty', nilai: (r) => r.qty, format: (v) => angka(v as number), rata: 'kanan' },
  { header: 'HPP', nilai: (r) => r.hpp_rata2, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: 'Nilai', nilai: (r) => r.nilai, format: (v) => rupiah(v as number), rata: 'kanan' },
]

export function Stok() {
  const { data: gudang } = useGudangAktif()
  const [gudangId, setGudangId] = useState('')
  const [cari, setCari] = useState('')
  const [halaman, setHalaman] = useState(1)
  const { data, isLoading, error, isFetching } = useStokGudang(gudangId, cari, halaman)
  const { data: ringkasan } = useRingkasanStok(gudangId, cari)
  const { data: jumlahPerluRestock } = useJumlahPerluRestock()
  useEffect(() => setHalaman(1), [gudangId, cari])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Stok per Gudang')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Saldo persediaan berjalan, dari kartu stok')}</p>
        </div>
        <TombolEkspor
          ambilData={async () => {
            let q = supabase.from('v_stok_gudang').select('*')
            if (gudangId) q = q.eq('gudang_id', gudangId)
            if (cari.trim()) {
              const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
              q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
            }
            const { data, error } = await q.order('nama_gudang').order('nama').limit(10000).returns<BarisStokGudang[]>()
            if (error) throw error
            return data ?? []
          }}
          kolom={KOLOM_EKSPOR_STOK}
          opsi={{ namaFile: `stok-${tanggalISO()}`, judul: tt('Stok per Gudang') }}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KartuRingkas judul={tt('Total Nilai Persediaan')} nilai={rupiah(ringkasan?.totalNilai ?? 0)} />
        <KartuRingkas judul={tt('Jumlah SKU')} nilai={angka(ringkasan?.jumlahSku ?? 0)} />
        <KartuRingkas
          judul={tt('Perlu Restock')}
          nilai={angka(jumlahPerluRestock ?? 0)}
          bahaya={(jumlahPerluRestock ?? 0) > 0}
        />
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
            <>
              <TabelDesktop>
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
              </TabelDesktop>
              <DaftarMobile className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
                {data.map((b) => (
                  <KartuBaris key={`${b.produk_id}-${b.gudang_id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{b.nama}</p>
                        <p className="font-mono text-xs text-muted-foreground">{b.kode}</p>
                      </div>
                      <p className="tabular shrink-0 font-semibold">{rupiah(b.nilai)}</p>
                    </div>
                    {(gudang?.length ?? 0) > 1 ? <BarisInfo label="Gudang" value={b.nama_gudang} /> : null}
                    <BarisInfo label="Qty" value={angka(b.qty)} />
                    <BarisInfo label="HPP" value={rupiah(b.hpp_rata2)} />
                  </KartuBaris>
                ))}
              </DaftarMobile>
            </>
          )}
        </CardContent>
      </Card>
      <Paginasi halaman={halaman} ukuranHalaman={UKURAN_HALAMAN} total={data?.total ?? 0} onUbah={setHalaman} />
    </div>
  )
}

function KartuRingkas({ judul, nilai, bahaya }: { judul: string; nilai: string; bahaya?: boolean }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{judul}</p>
        <p className={`tabular mt-1 text-lg font-semibold ${bahaya ? 'text-destructive' : ''}`}>{nilai}</p>
      </CardContent>
    </Card>
  )
}
