import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useGudangAktif, cariProduk } from '@/lib/queries'
import { angka, rupiah, tanggal, tanggalISO } from '@/lib/format'
import { Combobox, type OpsiCombobox } from '@/components/Combobox'
import {
  Badge,
  Card,
  CardContent,
  Input,
  KondisiKosong,
  Label,
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
import type { JenisMutasiStok } from '@/types/db'

interface BarisKartu {
  id: number
  tanggal: string
  gudang_id: string
  nama_gudang: string
  jenis: JenisMutasiStok
  ref_nomor: string | null
  masuk: number
  keluar: number
  saldo: number
  hpp_satuan: number | null
  nilai: number
  catatan: string | null
}

const LABEL_JENIS: Record<JenisMutasiStok, string> = {
  saldo_awal: 'Saldo Awal',
  pembelian: 'Pembelian',
  penjualan: 'Penjualan',
  retur_pembelian: 'Retur Pembelian',
  retur_penjualan: 'Retur Penjualan',
  transfer_masuk: 'Transfer Masuk',
  transfer_keluar: 'Transfer Keluar',
  penyesuaian: 'Penyesuaian',
}

function useKartuStok(produkId: string | null, gudangId: string, dari: string, sampai: string) {
  return useQuery({
    queryKey: ['kartu-stok', produkId, gudangId, dari, sampai],
    queryFn: async () => {
      let q = supabase.from('v_kartu_stok').select('*').eq('produk_id', produkId as string)
      if (gudangId) q = q.eq('gudang_id', gudangId)
      if (dari) q = q.gte('tanggal', dari)
      if (sampai) q = q.lte('tanggal', sampai)
      const { data, error } = await q.order('tanggal').order('id').limit(500).returns<BarisKartu[]>()
      if (error) throw error
      return data ?? []
    },
    enabled: !!produkId,
  })
}

export function KartuStok() {
  const { data: gudang } = useGudangAktif()
  const [produkId, setProdukId] = useState<string | null>(null)
  const [produkLabel, setProdukLabel] = useState<OpsiCombobox | null>(null)
  const [gudangId, setGudangId] = useState('')
  const batasAwal = new Date()
  batasAwal.setDate(batasAwal.getDate() - 30)
  const [dari, setDari] = useState(tanggalISO(batasAwal))
  const [sampai, setSampai] = useState(tanggalISO())

  const { data, isLoading, error, isFetching } = useKartuStok(produkId, gudangId, dari, sampai)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Kartu Stok</h1>
        <p className="text-sm text-muted-foreground">Riwayat mutasi dan saldo berjalan per produk</p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Produk</Label>
            <Combobox
              value={produkId}
              opsiTerpilih={produkLabel}
              onChange={(id, opsi) => {
                setProdukId(id)
                setProdukLabel(opsi)
              }}
              cariOpsi={cariProduk}
              placeholder="Cari produk..."
            />
          </div>
          {(gudang?.length ?? 0) > 1 ? (
            <div className="space-y-1.5">
              <Label>Gudang</Label>
              <Select value={gudangId} onChange={(e) => setGudangId(e.target.value)}>
                <option value="">Semua gudang</option>
                {(gudang ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nama}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Dari</Label>
            <Input type="date" value={dari} onChange={(e) => setDari(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Sampai</Label>
            <Input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {!produkId ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Pilih produk dulu untuk melihat kartu stoknya.
          </CardContent>
        </Card>
      ) : (
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
              <KondisiKosong pesan="Tidak ada mutasi pada rentang tanggal ini." />
            ) : (
              <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
                <Thead>
                  <Tr>
                    <Th>Tanggal</Th>
                    <Th>Jenis</Th>
                    <Th>No. dokumen</Th>
                    {(gudang?.length ?? 0) > 1 ? <Th>Gudang</Th> : null}
                    <Th className="text-right">Masuk</Th>
                    <Th className="text-right">Keluar</Th>
                    <Th className="text-right">Saldo</Th>
                    <Th className="text-right">Nilai</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.map((b) => (
                    <Tr key={b.id}>
                      <Td className="text-muted-foreground">{tanggal(b.tanggal)}</Td>
                      <Td>
                        <Badge variant="netral">{LABEL_JENIS[b.jenis]}</Badge>
                      </Td>
                      <Td className="font-mono text-xs">{b.ref_nomor ?? '-'}</Td>
                      {(gudang?.length ?? 0) > 1 ? <Td className="text-muted-foreground">{b.nama_gudang}</Td> : null}
                      <Td className="tabular text-right text-emerald-600">{b.masuk > 0 ? angka(b.masuk) : '-'}</Td>
                      <Td className="tabular text-right text-destructive">{b.keluar > 0 ? angka(b.keluar) : '-'}</Td>
                      <Td className="tabular text-right font-medium">{angka(b.saldo)}</Td>
                      <Td className="tabular text-right">{rupiah(b.nilai)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
