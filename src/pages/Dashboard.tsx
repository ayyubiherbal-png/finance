import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Boxes, TrendingUp, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, angka } from '@/lib/format'
import {
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
  Badge,
} from '@/components/ui'
import type { VPenjualanHarian, VStokProduk, VPiutangAging } from '@/types/db'

function useRingkasan() {
  return useQuery({
    queryKey: ['dasbor', 'ringkasan'],
    queryFn: async () => {
      const batasTanggal = new Date()
      batasTanggal.setDate(batasTanggal.getDate() - 30)
      const sejak = batasTanggal.toISOString().slice(0, 10)

      const [penjualan, stok, piutang] = await Promise.all([
        supabase
          .from('v_penjualan_harian')
          .select('tanggal, jumlah_faktur, omzet, laba_kotor')
          .gte('tanggal', sejak)
          .order('tanggal', { ascending: false })
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

      const barisPenjualan = penjualan.data ?? []
      const barisStok = stok.data ?? []
      const barisPiutang = piutang.data ?? []

      return {
        omzet30Hari: barisPenjualan.reduce((t, b) => t + Number(b.omzet ?? 0), 0),
        laba30Hari: barisPenjualan.reduce((t, b) => t + Number(b.laba_kotor ?? 0), 0),
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Dasbor</h1>
        <p className="text-sm text-muted-foreground">Ringkasan 30 hari terakhir</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KartuAngka
          judul="Omzet 30 hari"
          nilai={rupiah(data.omzet30Hari)}
          ikon={<TrendingUp className="h-4 w-4" />}
        />
        <KartuAngka
          judul="Laba kotor"
          nilai={rupiah(data.laba30Hari)}
          catatan={`Margin ${margin.toFixed(1)}%`}
          ikon={<TrendingUp className="h-4 w-4" />}
        />
        <KartuAngka
          judul="Nilai persediaan"
          nilai={rupiah(data.nilaiPersediaan)}
          ikon={<Boxes className="h-4 w-4" />}
        />
        <KartuAngka
          judul="Piutang berjalan"
          nilai={rupiah(data.totalPiutang)}
          catatan={data.piutangMacet > 0 ? `${rupiah(data.piutangMacet)} lewat 90 hari` : undefined}
          bahaya={data.piutangMacet > 0}
          ikon={<Wallet className="h-4 w-4" />}
        />
      </div>

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

function KartuAngka({
  judul,
  nilai,
  catatan,
  ikon,
  bahaya,
}: {
  judul: string
  nilai: string
  catatan?: string
  ikon: React.ReactNode
  bahaya?: boolean
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium uppercase tracking-wide">{judul}</span>
          {ikon}
        </div>
        <p className="tabular mt-1 text-xl font-semibold">{nilai}</p>
        {catatan ? (
          <p className={`mt-0.5 text-xs ${bahaya ? 'text-destructive' : 'text-muted-foreground'}`}>
            {catatan}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
