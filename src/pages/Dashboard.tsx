import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, Coins, TrendingUp, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, angka, tanggalISO } from '@/lib/format'
import { GrafikArea, Sparkline } from '@/components/Charts'
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import type { VPenjualanHarian, VStokProduk, VPiutangAging } from '@/types/db'

/** Aksen warna per kartu, dari palet kategorikal yang sudah divalidasi (dataviz skill). */
const AKSEN = {
  biru: '#2a78d6',
  aqua: '#1baf7a',
  ungu: '#4a3aa7',
  kuning: '#eda100',
  merah: '#d03b3b',
} as const

function useRingkasan() {
  return useQuery({
    queryKey: ['dasbor', 'ringkasan'],
    queryFn: async () => {
      const hariIni = new Date()
      const batas30 = new Date(hariIni)
      batas30.setDate(batas30.getDate() - 29)
      const batas60 = new Date(hariIni)
      batas60.setDate(batas60.getDate() - 59)

      const [penjualan, stok, piutang] = await Promise.all([
        supabase
          .from('v_penjualan_harian')
          .select('tanggal, jumlah_faktur, omzet, laba_kotor')
          .gte('tanggal', tanggalISO(batas60))
          .returns<VPenjualanHarian[]>(),
        supabase
          .from('v_stok_produk')
          .select('produk_id, kode, nama, qty, stok_min, nilai_persediaan, perlu_restock')
          .returns<Pick<VStokProduk, 'produk_id' | 'kode' | 'nama' | 'qty' | 'stok_min' | 'nilai_persediaan' | 'perlu_restock'>[]>(),
        supabase
          .from('v_piutang_aging')
          .select('pelanggan_id, nama_pelanggan, total_piutang, umur_90_plus')
          .returns<Pick<VPiutangAging, 'pelanggan_id' | 'nama_pelanggan' | 'total_piutang' | 'umur_90_plus'>[]>(),
      ])

      if (penjualan.error) throw penjualan.error
      if (stok.error) throw stok.error
      if (piutang.error) throw piutang.error

      const semuaHari = penjualan.data ?? []
      const barisStok = stok.data ?? []
      const barisPiutang = piutang.data ?? []

      const petaHari = new Map(semuaHari.map((h) => [h.tanggal, h]))
      const isoBatas30 = tanggalISO(batas30)

      // 30 titik harian berurutan, hari tanpa penjualan diisi 0 -- supaya
      // grafiknya benar-benar merepresentasikan waktu, bukan cuma hari yang ada transaksi.
      const trenHarian: { tanggal: string; nilai: number }[] = []
      for (let i = 29; i >= 0; i--) {
        const d = new Date(hariIni)
        d.setDate(d.getDate() - i)
        const iso = tanggalISO(d)
        trenHarian.push({ tanggal: iso, nilai: Number(petaHari.get(iso)?.omzet ?? 0) })
      }

      const periodeIni = semuaHari.filter((h) => h.tanggal >= isoBatas30)
      const periodeSebelum = semuaHari.filter((h) => h.tanggal < isoBatas30)

      const omzet30Hari = periodeIni.reduce((t, h) => t + Number(h.omzet ?? 0), 0)
      const laba30Hari = periodeIni.reduce((t, h) => t + Number(h.laba_kotor ?? 0), 0)
      const omzetSebelum = periodeSebelum.reduce((t, h) => t + Number(h.omzet ?? 0), 0)
      const deltaOmzetPersen = omzetSebelum > 0 ? ((omzet30Hari - omzetSebelum) / omzetSebelum) * 100 : null

      return {
        trenHarian,
        omzet30Hari,
        laba30Hari,
        deltaOmzetPersen,
        nilaiPersediaan: barisStok.reduce((t, b) => t + Number(b.nilai_persediaan ?? 0), 0),
        totalPiutang: barisPiutang.reduce((t, b) => t + Number(b.total_piutang ?? 0), 0),
        piutangMacet: barisPiutang.reduce((t, b) => t + Number(b.umur_90_plus ?? 0), 0),
        perluRestock: barisStok.filter((b) => b.perlu_restock),
      }
    },
  })
}

export function Dashboard() {
  const { data, isLoading, error } = useRingkasan()

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (error) return <PesanError error={error} />
  if (!data) return null

  const margin = data.omzet30Hari > 0 ? (data.laba30Hari / data.omzet30Hari) * 100 : 0
  const trenLaba7 = data.trenHarian.slice(-7).map((t) => t.nilai)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Dasbor</h1>
        <p className="text-sm text-muted-foreground">Ringkasan 30 hari terakhir</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KartuStat
          judul="Omzet 30 hari"
          nilai={rupiah(data.omzet30Hari)}
          warna={AKSEN.biru}
          ikon={<TrendingUp className="h-4 w-4" />}
          delta={data.deltaOmzetPersen}
          sparkline={data.trenHarian.map((t) => t.nilai)}
        />
        <KartuStat
          judul="Laba kotor"
          nilai={rupiah(data.laba30Hari)}
          warna={AKSEN.aqua}
          ikon={<Coins className="h-4 w-4" />}
          catatan={`Margin ${margin.toFixed(1)}%`}
          sparkline={trenLaba7}
        />
        <KartuStat
          judul="Nilai persediaan"
          nilai={rupiah(data.nilaiPersediaan)}
          warna={AKSEN.ungu}
          ikon={<Boxes className="h-4 w-4" />}
        />
        <KartuStat
          judul="Piutang berjalan"
          nilai={rupiah(data.totalPiutang)}
          warna={data.piutangMacet > 0 ? AKSEN.merah : AKSEN.kuning}
          ikon={<Wallet className="h-4 w-4" />}
          catatan={data.piutangMacet > 0 ? `${rupiah(data.piutangMacet)} lewat 90 hari` : undefined}
          bahaya={data.piutangMacet > 0}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tren omzet harian</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <GrafikArea data={data.trenHarian} warna={AKSEN.biru} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Perlu restock
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {data.perluRestock.length === 0 ? (
            <KondisiKosong pesan="Semua produk di atas stok minimum." />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Kode</Th>
                  <Th>Produk</Th>
                  <Th className="text-right">Stok</Th>
                  <Th className="text-right">Minimum</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.perluRestock.map((p) => (
                  <Tr key={p.produk_id}>
                    <Td className="font-mono text-xs">{p.kode}</Td>
                    <Td>{p.nama}</Td>
                    <Td className="tabular text-right">{angka(p.qty)}</Td>
                    <Td className="tabular text-right text-muted-foreground">{angka(p.stok_min)}</Td>
                    <Td className="text-right">
                      <Badge variant={Number(p.qty) <= 0 ? 'bahaya' : 'peringatan'}>
                        {Number(p.qty) <= 0 ? 'Habis' : 'Menipis'}
                      </Badge>
                    </Td>
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

function KartuStat({
  judul,
  nilai,
  warna,
  ikon,
  catatan,
  delta,
  sparkline,
  bahaya,
}: {
  judul: string
  nilai: string
  warna: string
  ikon: ReactNode
  catatan?: string
  delta?: number | null
  sparkline?: number[]
  bahaya?: boolean
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{judul}</p>
            <p className="tabular mt-1.5 text-2xl font-semibold">{nilai}</p>
          </div>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${warna}1f`, color: warna }}
          >
            {ikon}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div>
            {delta !== undefined && delta !== null ? (
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                  delta >= 0 ? 'text-emerald-600' : 'text-destructive'
                }`}
              >
                {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(delta).toFixed(1)}% vs 30 hari sebelumnya
              </span>
            ) : catatan ? (
              <span className={`text-xs ${bahaya ? 'text-destructive' : 'text-muted-foreground'}`}>{catatan}</span>
            ) : null}
          </div>
          {sparkline && sparkline.length >= 2 ? <Sparkline data={sparkline} warna={warna} /> : null}
        </div>
      </CardContent>
    </Card>
  )
}
