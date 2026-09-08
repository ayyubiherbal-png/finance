import { useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggal, terlihatSepertiNama } from '@/lib/format'
import { FilterPeriode, RENTANG_KOSONG, type RentangTanggal } from '@/components/FilterPeriode'
import {
  Badge,
  Button,
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
import { LABEL_STATUS, VARIAN_STATUS } from '@/pages/SalesOrder'
import { variantStatusPlatform } from '@/lib/importPesanan'
import type { KanalPenjualan, StatusBayar, StatusDokumen } from '@/types/db'

const KANAL_MARKETPLACE: KanalPenjualan[] = ['shopee', 'tiktok']

interface BarisFaktur {
  id: string
  nomor: string
  tanggal: string
  jatuh_tempo: string
  kanal: KanalPenjualan
  status: StatusDokumen
  status_bayar: StatusBayar
  total: number
  sisa: number
  pelanggan: { nama: string } | null
  so: { nama_penerima: string | null } | null
  pesanan_marketplace_impor: { status_platform: string | null }[]
}

const LABEL_BAYAR: Record<StatusBayar, string> = {
  belum: 'Belum Bayar',
  sebagian: 'Bayar Sebagian',
  lunas: 'Lunas',
}

const VARIAN_BAYAR: Record<StatusBayar, 'netral' | 'peringatan' | 'sukses'> = {
  belum: 'peringatan',
  sebagian: 'peringatan',
  lunas: 'sukses',
}

function useDaftarFaktur(cari: string, statusBayar: string, periode: RentangTanggal) {
  return useQuery({
    queryKey: ['faktur-penjualan', cari, statusBayar, periode],
    queryFn: async () => {
      let q = supabase
        .from('faktur_penjualan')
        .select(
          'id, nomor, tanggal, jatuh_tempo, kanal, status, status_bayar, total, sisa, pelanggan:pelanggan_id(nama), so:so_id(nama_penerima), pesanan_marketplace_impor(status_platform)',
        )
      if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
      if (statusBayar) q = q.eq('status_bayar', statusBayar)
      if (periode.dari) q = q.gte('tanggal', periode.dari)
      if (periode.sampai) q = q.lte('tanggal', periode.sampai)
      const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(100)
      if (error) throw error
      return (data ?? []) as unknown as BarisFaktur[]
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

export function FakturPenjualan() {
  const [cari, setCari] = useState('')
  const [statusBayar, setStatusBayar] = useState('')
  const [periode, setPeriode] = useState<RentangTanggal>(RENTANG_KOSONG)
  const { data, isLoading, error, isFetching } = useDaftarFaktur(cari, statusBayar, periode)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Faktur Penjualan')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Ditagihkan dari satu atau beberapa Surat Jalan')}</p>
        </div>
        <Button variant="pill" asChild>
          <Link to="/faktur-penjualan/baru">
            <Plus className="h-4 w-4" />
            Faktur Baru
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Cari nomor faktur..." value={cari} onChange={(e) => setCari(e.target.value)} />
        </div>
        <Select className="w-full sm:w-48" value={statusBayar} onChange={(e) => setStatusBayar(e.target.value)}>
          <option value="">Semua status bayar</option>
          {Object.entries(LABEL_BAYAR).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <FilterPeriode onChange={setPeriode} />
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
            <KondisiKosong pesan="Belum ada Faktur Penjualan." />
          ) : (
            <>
              <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
                <Thead>
                  <Tr>
                    <Th>Nomor</Th>
                    <Th>Tanggal</Th>
                    <Th>Pelanggan</Th>
                    <Th>Jatuh tempo</Th>
                    <Th className="text-right">Total</Th>
                    <Th className="text-right">Sisa</Th>
                    <Th>Status</Th>
                    <Th>Bayar</Th>
                    <Th>{tt('Status Marketplace')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.map((f) => {
                    // Status ASLI dari Shopee/TikTok saat pesanan ini diimpor -- lihat
                    // ImporPesanan.tsx. Ditampilkan apa adanya (bukan diterjemahkan jadi
                    // istilah aplikasi), supaya bisa dilihat lagi kapan pun tanpa buka file.
                    const statusPlatform = f.pesanan_marketplace_impor?.[0]?.status_platform
                    return (
                      <Tr key={f.id}>
                        <Td>
                          <Link to={`/faktur-penjualan/${f.id}`} className="font-mono text-xs text-primary hover:underline">
                            {f.nomor}
                          </Link>
                        </Td>
                        <Td className="text-muted-foreground">{tanggal(f.tanggal)}</Td>
                        <Td>
                          {/* Lihat catatan sama di SalesOrder/SuratJalan.tsx: pesanan marketplace
                              pakai satu akun agregat sebagai pelanggan -- nama pembeli asli
                              disalin dari Sales Order (nama_penerima), faktur sendiri tidak
                              punya kolom itu. Dijaga `terlihatSepertiNama` kalau isinya angka polos. */}
                          <p className="font-medium">
                            {(f.so?.nama_penerima && terlihatSepertiNama(f.so.nama_penerima) ? f.so.nama_penerima : null) || f.pelanggan?.nama || '-'}
                          </p>
                          {f.so?.nama_penerima && terlihatSepertiNama(f.so.nama_penerima) && f.pelanggan?.nama && f.so.nama_penerima !== f.pelanggan.nama ? (
                            <p className="text-xs text-muted-foreground">{f.pelanggan.nama}</p>
                          ) : null}
                        </Td>
                        <Td className="text-muted-foreground">{tanggal(f.jatuh_tempo)}</Td>
                        <Td className="tabular text-right font-medium">{rupiah(f.total)}</Td>
                        <Td className="tabular text-right">{f.sisa > 0 ? rupiah(f.sisa) : '-'}</Td>
                        <Td>
                          <Badge variant={VARIAN_STATUS[f.status]}>{LABEL_STATUS[f.status]}</Badge>
                        </Td>
                        <Td>
                          <Badge variant={VARIAN_BAYAR[f.status_bayar]}>{LABEL_BAYAR[f.status_bayar]}</Badge>
                        </Td>
                        <Td>
                          {KANAL_MARKETPLACE.includes(f.kanal) && statusPlatform ? (
                            <Badge variant={variantStatusPlatform(statusPlatform)}>{statusPlatform}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
              <div className="flex items-center justify-end gap-1.5 border-t border-border px-4 py-2 text-sm">
                <span className="text-muted-foreground">
                  {data.length >= 100 ? 'Total 100 faktur teratas yang tampil' : `Total ${data.length} faktur`}
                </span>
                <span className="tabular font-semibold">{rupiah(data.reduce((t, f) => t + f.total, 0))}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
