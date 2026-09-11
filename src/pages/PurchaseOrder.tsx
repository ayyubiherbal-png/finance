import { useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CheckCircle2, Plus, Search, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggal, tanggalISO } from '@/lib/format'
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
import { LABEL_STATUS, VARIAN_STATUS } from '@/pages/SalesOrder'
import type { StatusDokumen } from '@/types/db'
import { useKonfirmasi } from '@/components/Konfirmasi'
import { toast } from '@/components/Toast'

interface BarisPO {
  id: string
  nomor: string
  tanggal: string
  status: StatusDokumen
  total: number
  supplier: { nama: string } | null
  items: { id: string }[]
}

const UKURAN_HALAMAN = 50

function useDaftarPO(cari: string, status: string, halaman: number) {
  return useQuery({
    queryKey: ['purchase-order', cari, status, halaman],
    queryFn: async () => {
      let q = supabase.from('purchase_order').select('id, nomor, tanggal, status, total, supplier:supplier_id(nama), items:purchase_order_item(id)', { count: 'exact' })
      if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
      if (status) q = q.eq('status', status)
      const mulai = (halaman - 1) * UKURAN_HALAMAN
      const { data, error, count } = await q
        .order('tanggal', { ascending: false })
        .order('nomor', { ascending: false })
        .range(mulai, mulai + UKURAN_HALAMAN - 1)
      if (error) throw error
      return { baris: (data ?? []) as unknown as BarisPO[], total: count ?? 0 }
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

const KOLOM_EKSPOR_PO: KolomEkspor<BarisPO>[] = [
  { header: 'Nomor', nilai: (r) => r.nomor },
  { header: 'Tanggal', nilai: (r) => r.tanggal, format: (v) => tanggal(v as string) },
  { header: 'Supplier', nilai: (r) => r.supplier?.nama ?? '-' },
  { header: 'Total', nilai: (r) => r.total, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: 'Status', nilai: (r) => LABEL_STATUS[r.status] },
]

export function PurchaseOrder() {
  const queryClient = useQueryClient()
  const konfirmasi = useKonfirmasi()
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState('')
  const [halaman, setHalaman] = useState(1)
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set())
  const [memprosesMassal, setMemprosesMassal] = useState(false)
  const { data, isLoading, error, isFetching } = useDaftarPO(cari, status, halaman)
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

  async function ubahStatusMassal(statusBaru: 'disetujui' | 'dibatalkan') {
    const kandidat = barisTerpilih.filter((x) => statusBaru === 'disetujui' ? x.status === 'draf' && x.items.length > 0 : ['draf', 'menunggu'].includes(x.status))
    if (kandidat.length === 0) return
    const aksi = statusBaru === 'disetujui' ? tt('setujui') : tt('batalkan')
    if (!(await konfirmasi(tt('{aksi} {n} Purchase Order terpilih?').replace('{aksi}', aksi).replace('{n}', String(kandidat.length)), { berbahaya: statusBaru === 'dibatalkan' }))) return
    setMemprosesMassal(true)
    const { error } = await supabase.from('purchase_order').update({ status: statusBaru }).in('id', kandidat.map((x) => x.id))
    setMemprosesMassal(false)
    if (error) return toast(error.message, 'error')
    toast(tt('{n} Purchase Order berhasil diperbarui.').replace('{n}', String(kandidat.length)))
    setTerpilih(new Set())
    await queryClient.invalidateQueries({ queryKey: ['purchase-order'] })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Purchase Order')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Pemesanan barang ke supplier')}</p>
        </div>
        <div className="flex gap-2">
          <TombolEkspor
            ambilData={async () => {
              let q = supabase.from('purchase_order').select('id, nomor, tanggal, status, total, supplier:supplier_id(nama)')
              if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
              if (status) q = q.eq('status', status)
              const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(10000)
              if (error) throw error
              return (data ?? []) as unknown as BarisPO[]
            }}
            kolom={KOLOM_EKSPOR_PO}
            opsi={{ namaFile: `purchase-order-${tanggalISO()}`, judul: tt('Purchase Order') }}
          />
          <Button variant="pill" asChild>
            <Link to="/purchase-order/baru">
              <Plus className="h-4 w-4" />
              PO Baru
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Cari nomor PO..." value={cari} onChange={(e) => { setCari(e.target.value); setHalaman(1); setTerpilih(new Set()) }} />
        </div>
        <Select className="w-full sm:w-48" value={status} onChange={(e) => { setStatus(e.target.value); setHalaman(1); setTerpilih(new Set()) }}>
          <option value="">Semua status</option>
          {Object.entries(LABEL_STATUS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </div>

      <BarPilihanMassal jumlah={barisTerpilih.length} onBersihkan={() => setTerpilih(new Set())}>
        {barisTerpilih.some((x) => x.status === 'draf' && x.items.length > 0) ? <Button size="sm" onClick={() => ubahStatusMassal('disetujui')} disabled={memprosesMassal}><CheckCircle2 className="h-4 w-4" />{tt('Setujui')}</Button> : null}
        {barisTerpilih.some((x) => ['draf', 'menunggu'].includes(x.status)) ? <Button size="sm" variant="outline" onClick={() => ubahStatusMassal('dibatalkan')} disabled={memprosesMassal}><XCircle className="h-4 w-4" />{tt('Batalkan')}</Button> : null}
        <TombolEkspor
          ambilData={async () => barisTerpilih}
          kolom={KOLOM_EKSPOR_PO}
          opsi={{ namaFile: `purchase-order-terpilih-${tanggalISO()}`, judul: tt('Purchase Order') }}
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
            <KondisiKosong pesan="Belum ada Purchase Order." />
          ) : (
            <>
              <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th className="w-[44px]">
                    <label className="flex h-[36px] w-[36px] cursor-pointer items-center justify-center">
                      <input type="checkbox" className="h-4 w-4 accent-primary" checked={semuaTerpilih} onChange={(e) => setTerpilih(e.target.checked ? new Set(baris.map((r) => r.id)) : new Set())} aria-label={tt('Pilih semua di halaman ini')} />
                    </label>
                  </Th>
                  <Th>Nomor</Th>
                  <Th>Tanggal</Th>
                  <Th>Supplier</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {baris.map((po) => (
                  <Tr key={po.id}>
                    <Td>
                      <label className="flex h-[36px] w-[36px] cursor-pointer items-center justify-center">
                        <input type="checkbox" className="h-4 w-4 accent-primary" checked={terpilih.has(po.id)} onChange={(e) => pilihBaris(po.id, e.target.checked)} aria-label={tt('Pilih baris {nomor}').replace('{nomor}', po.nomor)} />
                      </label>
                    </Td>
                    <Td>
                      <Link to={`/purchase-order/${po.id}`} className="font-mono text-xs text-primary hover:underline">
                        {po.nomor}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{tanggal(po.tanggal)}</Td>
                    <Td className="font-medium">{po.supplier?.nama ?? '-'}</Td>
                    <Td className="tabular text-right font-medium">{rupiah(po.total)}</Td>
                    <Td>
                      <Badge variant={VARIAN_STATUS[po.status]}>{LABEL_STATUS[po.status]}</Badge>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
              </Table>
              <Paginasi halaman={halaman} ukuranHalaman={UKURAN_HALAMAN} total={data?.total ?? 0} onUbah={(h) => { setHalaman(h); setTerpilih(new Set()) }} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
