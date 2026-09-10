import { useMemo, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { angka, rupiah, tanggalISO } from '@/lib/format'
import { kutipFilterPostgrest } from '@/lib/utils'
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
import type { VStokProduk } from '@/types/db'

function useProduk(cari: string) {
  return useQuery({
    queryKey: ['produk', cari],
    queryFn: async () => {
      // Filter (.or) harus dipasang sebelum .order/.limit, karena setelah itu
      // builder-nya berubah jadi transform builder yang tidak punya .or().
      let q = supabase.from('v_stok_produk').select('*')

      if (cari.trim()) {
        const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
        q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
      }

      const { data, error } = await q.order('nama').limit(200).returns<VStokProduk[]>()
      if (error) throw error
      return data ?? []
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

// Baris varian dikelompokkan langsung di bawah baris induknya (bukan cuma
// mengandalkan urutan alfabet, karena nama varian bisa saja tidak berdekatan).
// Varian yang induknya kebetulan tidak lolos filter pencarian saat ini tetap
// tampil apa adanya sebagai baris biasa.
function kelompokkanVarian(data: VStokProduk[]) {
  const anak = new Map<string, VStokProduk[]>()
  for (const p of data) {
    if (p.induk_id) {
      const arr = anak.get(p.induk_id) ?? []
      arr.push(p)
      anak.set(p.induk_id, arr)
    }
  }
  const sudahDitampilkan = new Set<string>()
  const hasil: { produk: VStokProduk; varian: boolean }[] = []
  for (const p of data) {
    if (sudahDitampilkan.has(p.produk_id)) continue
    if (p.induk_id && data.some((x) => x.produk_id === p.induk_id)) continue // dirender di bawah induknya
    hasil.push({ produk: p, varian: !!p.induk_id })
    sudahDitampilkan.add(p.produk_id)
    for (const v of anak.get(p.produk_id) ?? []) {
      if (sudahDitampilkan.has(v.produk_id)) continue
      hasil.push({ produk: v, varian: true })
      sudahDitampilkan.add(v.produk_id)
    }
  }
  return hasil
}

export function Produk() {
  const [cari, setCari] = useState('')
  const { data, isLoading, error, isFetching } = useProduk(cari)
  const baris = useMemo(() => kelompokkanVarian(data ?? []), [data])
  const jumlahVarian = useMemo(() => {
    const peta = new Map<string, number>()
    for (const p of data ?? []) {
      if (p.induk_id) peta.set(p.induk_id, (peta.get(p.induk_id) ?? 0) + 1)
    }
    return peta
  }, [data])
  // Nama induk di-lookup dari data yang sudah dimuat -- dipakai kolom
  // ekspor "Produk Induk" supaya hubungan varian tidak hilang saat
  // tabelnya diratakan jadi CSV/PDF.
  const petaNamaById = useMemo(() => new Map((data ?? []).map((p) => [p.produk_id, p.nama])), [data])
  const kolomEksporProduk: KolomEkspor<VStokProduk>[] = [
    { header: 'Kode', nilai: (r) => r.kode },
    { header: 'Nama', nilai: (r) => r.nama },
    { header: 'Produk Induk', nilai: (r) => (r.induk_id ? (petaNamaById.get(r.induk_id) ?? '') : '') },
    { header: 'Kategori', nilai: (r) => r.kategori ?? '-' },
    { header: 'Stok', nilai: (r) => r.qty, format: (v) => angka(v as number), rata: 'kanan' },
    { header: 'Satuan', nilai: (r) => r.satuan_dasar },
    { header: 'HPP', nilai: (r) => r.hpp_rata2, format: (v) => rupiah(v as number), rata: 'kanan' },
    { header: 'Nilai Persediaan', nilai: (r) => r.nilai_persediaan, format: (v) => rupiah(v as number), rata: 'kanan' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Produk')}</h1>
          <p className="text-sm text-muted-foreground">
            {tt('Stok lintas gudang dan nilai persediaan berdasarkan HPP rata-rata')}
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
          <TombolEkspor
            ambilData={async () => {
              let q = supabase.from('v_stok_produk').select('*')
              if (cari.trim()) {
                const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
                q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
              }
              const { data, error } = await q.order('nama').limit(10000).returns<VStokProduk[]>()
              if (error) throw error
              return data ?? []
            }}
            kolom={kolomEksporProduk}
            opsi={{ namaFile: `produk-${tanggalISO()}`, judul: tt('Produk') }}
          />
          <Button variant="pill" asChild>
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
                {baris.map(({ produk: p, varian }) => (
                  <Tr key={p.produk_id}>
                    <Td className={`font-mono text-xs ${varian ? 'pl-6 text-muted-foreground/70' : ''}`}>{p.kode}</Td>
                    <Td className="font-medium">
                      <div className={`flex items-center gap-2 ${varian ? 'pl-6' : ''}`}>
                        <Link to={`/produk/${p.produk_id}`} className={varian ? 'text-muted-foreground hover:underline' : 'text-primary hover:underline'}>
                          {p.nama}
                        </Link>
                        {varian ? <Badge variant="netral">{tt('Varian')}</Badge> : null}
                        {!varian && (jumlahVarian.get(p.produk_id) ?? 0) > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            ({tt('{n} varian').replace('{n}', String(jumlahVarian.get(p.produk_id)))})
                          </span>
                        ) : null}
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
