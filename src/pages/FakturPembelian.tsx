import { useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
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
import type { StatusBayar, StatusDokumen } from '@/types/db'

interface BarisFaktur {
  id: string
  nomor: string
  tanggal: string
  jatuh_tempo: string
  status: StatusDokumen
  status_bayar: StatusBayar
  total: number
  sisa: number
  supplier: { nama: string } | null
}

const UKURAN_HALAMAN = 50

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

function useDaftarFaktur(cari: string, statusBayar: string, halaman: number) {
  return useQuery({
    queryKey: ['faktur-pembelian', cari, statusBayar, halaman],
    queryFn: async () => {
      let q = supabase
        .from('faktur_pembelian')
        .select('id, nomor, tanggal, jatuh_tempo, status, status_bayar, total, sisa, supplier:supplier_id(nama)', { count: 'exact' })
      if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
      if (statusBayar) q = q.eq('status_bayar', statusBayar)
      const mulai = (halaman - 1) * UKURAN_HALAMAN
      const { data, error, count } = await q
        .order('tanggal', { ascending: false })
        .order('nomor', { ascending: false })
        .range(mulai, mulai + UKURAN_HALAMAN - 1)
      if (error) throw error
      return { baris: (data ?? []) as unknown as BarisFaktur[], total: count ?? 0 }
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

const KOLOM_EKSPOR_FAKTUR_BELI: KolomEkspor<BarisFaktur>[] = [
  { header: 'Nomor', nilai: (r) => r.nomor },
  { header: 'Tanggal', nilai: (r) => r.tanggal, format: (v) => tanggal(v as string) },
  { header: 'Supplier', nilai: (r) => r.supplier?.nama ?? '-' },
  { header: 'Jatuh Tempo', nilai: (r) => r.jatuh_tempo, format: (v) => tanggal(v as string) },
  { header: 'Total', nilai: (r) => r.total, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: 'Sisa', nilai: (r) => r.sisa, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: 'Status', nilai: (r) => LABEL_STATUS[r.status] },
  { header: 'Status Bayar', nilai: (r) => LABEL_BAYAR[r.status_bayar] },
]

export function FakturPembelian() {
  const [cari, setCari] = useState('')
  const [statusBayar, setStatusBayar] = useState('')
  const [halaman, setHalaman] = useState(1)
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set())
  const { data, isLoading, error, isFetching } = useDaftarFaktur(cari, statusBayar, halaman)
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Faktur Pembelian')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Tagihan dari supplier, ditagihkan dari satu atau beberapa Penerimaan Barang')}</p>
        </div>
        <div className="flex gap-2">
          <TombolEkspor
            ambilData={async () => {
              let q = supabase
                .from('faktur_pembelian')
                .select('id, nomor, tanggal, jatuh_tempo, status, status_bayar, total, sisa, supplier:supplier_id(nama)')
              if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
              if (statusBayar) q = q.eq('status_bayar', statusBayar)
              const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(10000)
              if (error) throw error
              return (data ?? []) as unknown as BarisFaktur[]
            }}
            kolom={KOLOM_EKSPOR_FAKTUR_BELI}
            opsi={{ namaFile: `faktur-pembelian-${tanggalISO()}`, judul: tt('Faktur Pembelian') }}
          />
          <Button variant="pill" asChild>
            <Link to="/faktur-pembelian/baru">
              <Plus className="h-4 w-4" />
              Faktur Baru
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Cari nomor faktur..." value={cari} onChange={(e) => { setCari(e.target.value); setHalaman(1); setTerpilih(new Set()) }} />
        </div>
        <Select className="w-full sm:w-48" value={statusBayar} onChange={(e) => { setStatusBayar(e.target.value); setHalaman(1); setTerpilih(new Set()) }}>
          <option value="">Semua status bayar</option>
          {Object.entries(LABEL_BAYAR).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </div>

      <BarPilihanMassal jumlah={barisTerpilih.length} onBersihkan={() => setTerpilih(new Set())}>
        <TombolEkspor
          ambilData={async () => barisTerpilih}
          kolom={KOLOM_EKSPOR_FAKTUR_BELI}
          opsi={{ namaFile: `faktur-pembelian-terpilih-${tanggalISO()}`, judul: tt('Faktur Pembelian') }}
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
            <KondisiKosong pesan="Belum ada Faktur Pembelian." />
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
                  <Th>Jatuh tempo</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Sisa</Th>
                  <Th>Status</Th>
                  <Th>Bayar</Th>
                </Tr>
              </Thead>
              <Tbody>
                {baris.map((f) => (
                  <Tr key={f.id}>
                    <Td>
                      <label className="flex h-[36px] w-[36px] cursor-pointer items-center justify-center">
                        <input type="checkbox" className="h-4 w-4 accent-primary" checked={terpilih.has(f.id)} onChange={(e) => pilihBaris(f.id, e.target.checked)} aria-label={tt('Pilih baris {nomor}').replace('{nomor}', f.nomor)} />
                      </label>
                    </Td>
                    <Td>
                      <Link to={`/faktur-pembelian/${f.id}`} className="font-mono text-xs text-primary hover:underline">
                        {f.nomor}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{tanggal(f.tanggal)}</Td>
                    <Td className="font-medium">{f.supplier?.nama ?? '-'}</Td>
                    <Td className="text-muted-foreground">{tanggal(f.jatuh_tempo)}</Td>
                    <Td className="tabular text-right font-medium">{rupiah(f.total)}</Td>
                    <Td className="tabular text-right">{f.sisa > 0 ? rupiah(f.sisa) : '-'}</Td>
                    <Td>
                      <Badge variant={VARIAN_STATUS[f.status]}>{LABEL_STATUS[f.status]}</Badge>
                    </Td>
                    <Td>
                      <Badge variant={VARIAN_BAYAR[f.status_bayar]}>{LABEL_BAYAR[f.status_bayar]}</Badge>
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
