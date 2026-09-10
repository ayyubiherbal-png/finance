import { useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggal, tanggalISO, terlihatSepertiNama } from '@/lib/format'
import { FilterPeriode, RENTANG_KOSONG, type RentangTanggal } from '@/components/FilterPeriode'
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
  Select,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui'
import type { KanalPenjualan, StatusDokumen } from '@/types/db'

interface BarisSO {
  id: string
  nomor: string
  tanggal: string
  status: StatusDokumen
  kanal: KanalPenjualan
  total: number
  nama_penerima: string | null
  pelanggan: { nama: string } | null
}

const LABEL_STATUS: Record<StatusDokumen, string> = {
  draf: 'Draf',
  menunggu: 'Menunggu',
  disetujui: 'Disetujui',
  sebagian: 'Terkirim Sebagian',
  selesai: 'Selesai',
  ditolak: 'Ditolak',
  dibatalkan: 'Dibatalkan',
}

const VARIAN_STATUS: Record<StatusDokumen, 'netral' | 'default' | 'sukses' | 'peringatan' | 'bahaya'> = {
  draf: 'netral',
  menunggu: 'peringatan',
  disetujui: 'default',
  sebagian: 'peringatan',
  selesai: 'sukses',
  ditolak: 'bahaya',
  dibatalkan: 'bahaya',
}

const LABEL_KANAL: Record<KanalPenjualan, string> = {
  canvassing: 'Canvassing',
  tokopedia: 'Tokopedia',
  shopee: 'Shopee',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  lainnya: 'Lainnya',
}

function useDaftarSO(cari: string, status: string, periode: RentangTanggal) {
  return useQuery({
    queryKey: ['sales-order', cari, status, periode],
    queryFn: async () => {
      let q = supabase
        .from('sales_order')
        .select('id, nomor, tanggal, status, kanal, total, nama_penerima, pelanggan:pelanggan_id(nama)')

      if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
      if (status) q = q.eq('status', status)
      if (periode.dari) q = q.gte('tanggal', periode.dari)
      if (periode.sampai) q = q.lte('tanggal', periode.sampai)

      const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(100)
      if (error) throw error
      return (data ?? []) as unknown as BarisSO[]
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

function namaPemesan(so: Pick<BarisSO, 'nama_penerima' | 'pelanggan'>): string {
  return (so.nama_penerima && terlihatSepertiNama(so.nama_penerima) ? so.nama_penerima : null) || so.pelanggan?.nama || '-'
}

const KOLOM_EKSPOR_SO: KolomEkspor<BarisSO>[] = [
  { header: 'Nomor', nilai: (r) => r.nomor },
  { header: 'Tanggal', nilai: (r) => r.tanggal, format: (v) => tanggal(v as string) },
  { header: 'Pelanggan', nilai: (r) => namaPemesan(r) },
  { header: 'Kanal', nilai: (r) => LABEL_KANAL[r.kanal] },
  { header: 'Total', nilai: (r) => r.total, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: 'Status', nilai: (r) => LABEL_STATUS[r.status] },
]

export function SalesOrder() {
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState('')
  const [periode, setPeriode] = useState<RentangTanggal>(RENTANG_KOSONG)
  const { data, isLoading, error, isFetching } = useDaftarSO(cari, status, periode)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Sales Order')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Pesanan dari canvassing maupun kanal online')}</p>
        </div>
        <div className="flex gap-2">
          <TombolEkspor
            ambilData={async () => {
              let q = supabase
                .from('sales_order')
                .select('id, nomor, tanggal, status, kanal, total, nama_penerima, pelanggan:pelanggan_id(nama)')
              if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
              if (status) q = q.eq('status', status)
              if (periode.dari) q = q.gte('tanggal', periode.dari)
              if (periode.sampai) q = q.lte('tanggal', periode.sampai)
              const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(10000)
              if (error) throw error
              return (data ?? []) as unknown as BarisSO[]
            }}
            kolom={KOLOM_EKSPOR_SO}
            opsi={{
              namaFile: `sales-order-${tanggalISO()}`,
              judul: tt('Sales Order'),
              subjudul: periode.dari || periode.sampai ? `Periode ${periode.dari ?? '...'} s/d ${periode.sampai ?? '...'}` : undefined,
            }}
          />
          <Button variant="pill" asChild>
            <Link to="/sales-order/baru">
              <Plus className="h-4 w-4" />
              SO Baru
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Cari nomor SO..."
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />
        </div>
        <Select className="w-full sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          {Object.entries(LABEL_STATUS).map(([v, l]) => (
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
            <KondisiKosong pesan="Belum ada Sales Order." />
          ) : (
            <>
              <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
                <Thead>
                  <Tr>
                    <Th>Nomor</Th>
                    <Th>Tanggal</Th>
                    <Th>Pelanggan</Th>
                    <Th>Kanal</Th>
                    <Th className="text-right">Total</Th>
                    <Th>Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.map((so) => (
                    <Tr key={so.id} className="cursor-pointer">
                      <Td>
                        <Link to={`/sales-order/${so.id}`} className="font-mono text-xs text-primary hover:underline">
                          {so.nomor}
                        </Link>
                      </Td>
                      <Td className="text-muted-foreground">{tanggal(so.tanggal)}</Td>
                      <Td>
                        {/* Pesanan marketplace pakai satu akun agregat ("Marketplace -- TikTok
                            Shop" dst.) sebagai pelanggan -- nama pembeli sesungguhnya per
                            pesanan ada di nama_penerima. Tanpa ini semua baris marketplace
                            kelihatan seperti pelanggan yang sama persis. `terlihatSepertiNama`
                            jaga-jaga kalau nama_penerima kebetulan angka polos (pernah kejadian
                            nyata: kolom mapping impor salah kena kolom berat/ongkir). */}
                        <p className="font-medium">
                          {(so.nama_penerima && terlihatSepertiNama(so.nama_penerima) ? so.nama_penerima : null) || so.pelanggan?.nama || '-'}
                        </p>
                        {so.nama_penerima && terlihatSepertiNama(so.nama_penerima) && so.pelanggan?.nama && so.nama_penerima !== so.pelanggan.nama ? (
                          <p className="text-xs text-muted-foreground">{so.pelanggan.nama}</p>
                        ) : null}
                      </Td>
                      <Td>
                        <Badge variant="netral">{LABEL_KANAL[so.kanal]}</Badge>
                      </Td>
                      <Td className="tabular text-right font-medium">{rupiah(so.total)}</Td>
                      <Td>
                        <Badge variant={VARIAN_STATUS[so.status]}>{LABEL_STATUS[so.status]}</Badge>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              <div className="flex items-center justify-end gap-1.5 border-t border-border px-4 py-2 text-sm">
                <span className="text-muted-foreground">
                  {data.length >= 100 ? tt('Total 100 SO teratas yang tampil') : `${tt('Total')} ${data.length} ${tt('SO')}`}
                </span>
                <span className="tabular font-semibold">{rupiah(data.reduce((t, so) => t + so.total, 0))}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export { LABEL_STATUS, VARIAN_STATUS, LABEL_KANAL }
