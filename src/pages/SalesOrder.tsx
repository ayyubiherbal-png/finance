import { useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Plus, Search, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggal, tanggalISO, terlihatSepertiNama } from '@/lib/format'
import { FilterPeriode, RENTANG_KOSONG, type RentangTanggal } from '@/components/FilterPeriode'
import { TombolEkspor } from '@/components/TombolEkspor'
import type { KolomEkspor } from '@/lib/eksporData'
import {
  Badge,
  BarPilihanMassal,
  Button,
  Card,
  CardContent,
  Input,
  KondisiKosong,
  PesanError,
  Paginasi,
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
import { useKonfirmasi } from '@/components/Konfirmasi'
import { toast } from '@/components/Toast'

interface BarisSO {
  id: string
  nomor: string
  tanggal: string
  status: StatusDokumen
  kanal: KanalPenjualan
  total: number
  nama_penerima: string | null
  pelanggan: { nama: string } | null
  items: { id: string }[]
}

const UKURAN_HALAMAN = 50

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

function useDaftarSO(cari: string, status: string, periode: RentangTanggal, halaman: number) {
  return useQuery({
    queryKey: ['sales-order', cari, status, periode, halaman],
    queryFn: async () => {
      let q = supabase
        .from('sales_order')
        .select('id, nomor, tanggal, status, kanal, total, nama_penerima, pelanggan:pelanggan_id(nama), items:sales_order_item(id)', { count: 'exact' })

      if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
      if (status) q = q.eq('status', status)
      if (periode.dari) q = q.gte('tanggal', periode.dari)
      if (periode.sampai) q = q.lte('tanggal', periode.sampai)

      const mulai = halaman * UKURAN_HALAMAN
      const { data, error, count } = await q
        .order('tanggal', { ascending: false })
        .order('nomor', { ascending: false })
        .range(mulai, mulai + UKURAN_HALAMAN - 1)
      if (error) throw error
      return { baris: (data ?? []) as unknown as BarisSO[], total: count ?? 0 }
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
  const queryClient = useQueryClient()
  const konfirmasi = useKonfirmasi()
  const [searchParams] = useSearchParams()
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState(searchParams.get('status') ?? '')
  const [periode, setPeriode] = useState<RentangTanggal>(RENTANG_KOSONG)
  const [halaman, setHalaman] = useState(0)
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set())
  const [memprosesMassal, setMemprosesMassal] = useState(false)
  const { data, isLoading, error, isFetching } = useDaftarSO(cari, status, periode, halaman)
  const baris = data?.baris ?? []
  const barisTerpilih = baris.filter((r) => terpilih.has(r.id))
  const semuaTerpilih = baris.length > 0 && baris.every((r) => terpilih.has(r.id))

  function pilihBaris(id: string, dipilih: boolean) {
    setTerpilih((lama) => {
      const baru = new Set(lama)
      if (dipilih) baru.add(id)
      else baru.delete(id)
      return baru
    })
  }

  function pilihSemua(dipilih: boolean) {
    setTerpilih(dipilih ? new Set(baris.map((r) => r.id)) : new Set())
  }

  async function ubahStatusMassal(statusBaru: 'disetujui' | 'dibatalkan') {
    const kandidat = barisTerpilih.filter((x) => statusBaru === 'disetujui' ? x.status === 'draf' && x.items.length > 0 : ['draf', 'menunggu'].includes(x.status))
    if (kandidat.length === 0) return
    const aksi = statusBaru === 'disetujui' ? tt('setujui') : tt('batalkan')
    if (!(await konfirmasi(tt('{aksi} {n} Sales Order terpilih?').replace('{aksi}', aksi).replace('{n}', String(kandidat.length)), { berbahaya: statusBaru === 'dibatalkan' }))) return
    setMemprosesMassal(true)
    const { error } = await supabase.from('sales_order').update({ status: statusBaru }).in('id', kandidat.map((x) => x.id))
    setMemprosesMassal(false)
    if (error) return toast(error.message, 'error')
    toast(tt('{n} Sales Order berhasil diperbarui.').replace('{n}', String(kandidat.length)))
    setTerpilih(new Set())
    await queryClient.invalidateQueries({ queryKey: ['sales-order'] })
  }

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
            onChange={(e) => {
              setCari(e.target.value)
              setHalaman(0)
              setTerpilih(new Set())
            }}
          />
        </div>
        <Select className="w-full sm:w-48" value={status} onChange={(e) => { setStatus(e.target.value); setHalaman(0); setTerpilih(new Set()) }}>
          <option value="">Semua status</option>
          {Object.entries(LABEL_STATUS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <FilterPeriode onChange={(rentang) => { setPeriode(rentang); setHalaman(0); setTerpilih(new Set()) }} />
      </div>

      <BarPilihanMassal jumlah={barisTerpilih.length} onBersihkan={() => setTerpilih(new Set())}>
        {barisTerpilih.some((x) => x.status === 'draf' && x.items.length > 0) ? <Button size="sm" onClick={() => ubahStatusMassal('disetujui')} disabled={memprosesMassal}><CheckCircle2 className="h-4 w-4" />{tt('Setujui')}</Button> : null}
        {barisTerpilih.some((x) => ['draf', 'menunggu'].includes(x.status)) ? <Button size="sm" variant="outline" onClick={() => ubahStatusMassal('dibatalkan')} disabled={memprosesMassal}><XCircle className="h-4 w-4" />{tt('Batalkan')}</Button> : null}
        <TombolEkspor
          ambilData={async () => barisTerpilih}
          kolom={KOLOM_EKSPOR_SO}
          opsi={{ namaFile: `sales-order-terpilih-${tanggalISO()}`, judul: tt('Sales Order') }}
        />
      </BarPilihanMassal>

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
          ) : baris.length === 0 ? (
            <KondisiKosong pesan="Belum ada Sales Order." />
          ) : (
            <>
              <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
                <Thead>
                  <Tr>
                    <Th className="w-[44px]">
                      <label className="flex h-[36px] w-[36px] cursor-pointer items-center justify-center">
                        <input type="checkbox" className="h-4 w-4 accent-primary" checked={semuaTerpilih} onChange={(e) => pilihSemua(e.target.checked)} aria-label={tt('Pilih semua di halaman ini')} />
                      </label>
                    </Th>
                    <Th>Nomor</Th>
                    <Th>Tanggal</Th>
                    <Th>Pelanggan</Th>
                    <Th>Kanal</Th>
                    <Th className="text-right">Total</Th>
                    <Th>Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {baris.map((so) => (
                    <Tr key={so.id} className="cursor-pointer">
                      <Td>
                        <label className="flex h-[36px] w-[36px] cursor-pointer items-center justify-center">
                          <input type="checkbox" className="h-4 w-4 accent-primary" checked={terpilih.has(so.id)} onChange={(e) => pilihBaris(so.id, e.target.checked)} aria-label={tt('Pilih baris {nomor}').replace('{nomor}', so.nomor)} />
                        </label>
                      </Td>
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
                  {`${tt('Total')} ${baris.length} ${tt('SO')}`}
                </span>
                <span className="tabular font-semibold">{rupiah(baris.reduce((t, so) => t + so.total, 0))}</span>
              </div>
              <Paginasi halaman={halaman} ukuranHalaman={UKURAN_HALAMAN} total={data?.total ?? 0} onUbah={(h) => { setHalaman(h); setTerpilih(new Set()) }} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export { LABEL_STATUS, VARIAN_STATUS, LABEL_KANAL }
