import { useEffect, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Printer, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tanggal, tanggalISO, terlihatSepertiNama } from '@/lib/format'
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
import { LABEL_STATUS, VARIAN_STATUS } from '@/pages/SalesOrder'
import type { StatusDokumen } from '@/types/db'

interface BarisSJ {
  id: string
  nomor: string
  tanggal: string
  status: StatusDokumen
  nama_penerima: string | null
  pelanggan: { nama: string } | null
  gudang: { nama: string } | null
}

function useDaftarSJ(cari: string, status: string, periode: RentangTanggal) {
  return useQuery({
    queryKey: ['surat-jalan', cari, status, periode],
    queryFn: async () => {
      let q = supabase
        .from('surat_jalan')
        .select('id, nomor, tanggal, status, nama_penerima, pelanggan:pelanggan_id(nama), gudang:gudang_id(nama)')
      if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
      if (status) q = q.eq('status', status)
      if (periode.dari) q = q.gte('tanggal', periode.dari)
      if (periode.sampai) q = q.lte('tanggal', periode.sampai)
      const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(100)
      if (error) throw error
      return (data ?? []) as unknown as BarisSJ[]
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

function namaPenerimaSj(sj: Pick<BarisSJ, 'nama_penerima' | 'pelanggan'>): string {
  return (sj.nama_penerima && terlihatSepertiNama(sj.nama_penerima) ? sj.nama_penerima : null) || sj.pelanggan?.nama || '-'
}

const KOLOM_EKSPOR_SJ: KolomEkspor<BarisSJ>[] = [
  { header: 'Nomor', nilai: (r) => r.nomor },
  { header: 'Tanggal', nilai: (r) => r.tanggal, format: (v) => tanggal(v as string) },
  { header: 'Pelanggan', nilai: (r) => namaPenerimaSj(r) },
  { header: 'Gudang', nilai: (r) => r.gudang?.nama ?? '-' },
  { header: 'Status', nilai: (r) => LABEL_STATUS[r.status] },
]

export function SuratJalan() {
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState('')
  const [periode, setPeriode] = useState<RentangTanggal>(RENTANG_KOSONG)
  const { data, isLoading, error, isFetching } = useDaftarSJ(cari, status, periode)

  // Untuk cetak massal label pengiriman -- lihat SuratJalanCetakMassal.
  // Dikosongkan tiap kali daftar berubah (filter/pencarian) supaya tidak
  // ada id yang kecentang tapi sudah tidak kelihatan di layar.
  const [dipilih, setDipilih] = useState<Set<string>>(new Set())
  useEffect(() => {
    setDipilih(new Set())
  }, [cari, status, periode])

  function toggleSatu(id: string) {
    setDipilih((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const semuaTercentang = !!data && data.length > 0 && data.every((sj) => dipilih.has(sj.id))
  function toggleSemua() {
    if (!data) return
    setDipilih(semuaTercentang ? new Set() : new Set(data.map((sj) => sj.id)))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Surat Jalan')}</h1>
          <p className="text-sm text-muted-foreground">
            {tt('Dibuat dari Sales Order yang sudah disetujui. Untuk membuat baru, buka SO-nya dan klik "Buat Surat Jalan". Centang beberapa baris untuk mencetak banyak label pengiriman sekaligus.')}
          </p>
        </div>
        <TombolEkspor
          ambilData={async () => {
            let q = supabase
              .from('surat_jalan')
              .select('id, nomor, tanggal, status, nama_penerima, pelanggan:pelanggan_id(nama), gudang:gudang_id(nama)')
            if (cari.trim()) q = q.ilike('nomor', `%${cari.trim()}%`)
            if (status) q = q.eq('status', status)
            if (periode.dari) q = q.gte('tanggal', periode.dari)
            if (periode.sampai) q = q.lte('tanggal', periode.sampai)
            const { data, error } = await q.order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(10000)
            if (error) throw error
            return (data ?? []) as unknown as BarisSJ[]
          }}
          kolom={KOLOM_EKSPOR_SJ}
          opsi={{
            namaFile: `surat-jalan-${tanggalISO()}`,
            judul: tt('Surat Jalan'),
            subjudul: periode.dari || periode.sampai ? `Periode ${periode.dari ?? '...'} s/d ${periode.sampai ?? '...'}` : undefined,
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Cari nomor SJ..." value={cari} onChange={(e) => setCari(e.target.value)} />
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

        {dipilih.size > 0 ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{dipilih.size} dipilih</span>
            <Button size="sm" asChild>
              <Link to={`/surat-jalan/cetak-massal?id=${[...dipilih].join(',')}`} target="_blank">
                <Printer className="h-4 w-4" />
                Cetak {dipilih.size} Label
              </Link>
            </Button>
          </div>
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
            <KondisiKosong pesan="Belum ada Surat Jalan." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th className="w-8">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={semuaTercentang}
                      onChange={toggleSemua}
                      aria-label="Pilih semua"
                    />
                  </Th>
                  <Th>Nomor</Th>
                  <Th>Tanggal</Th>
                  <Th>Pelanggan</Th>
                  <Th>Gudang</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((sj) => (
                  <Tr key={sj.id}>
                    <Td>
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={dipilih.has(sj.id)}
                        onChange={() => toggleSatu(sj.id)}
                        aria-label={`Pilih ${sj.nomor}`}
                      />
                    </Td>
                    <Td>
                      <Link to={`/surat-jalan/${sj.id}`} className="font-mono text-xs text-primary hover:underline">
                        {sj.nomor}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{tanggal(sj.tanggal)}</Td>
                    <Td>
                      {/* Lihat catatan sama di SalesOrder.tsx: pesanan marketplace pakai satu
                          akun agregat sebagai pelanggan -- nama pembeli asli ada di
                          nama_penerima, dijaga `terlihatSepertiNama` kalau isinya angka polos. */}
                      <p className="font-medium">
                        {(sj.nama_penerima && terlihatSepertiNama(sj.nama_penerima) ? sj.nama_penerima : null) || sj.pelanggan?.nama || '-'}
                      </p>
                      {sj.nama_penerima && terlihatSepertiNama(sj.nama_penerima) && sj.pelanggan?.nama && sj.nama_penerima !== sj.pelanggan.nama ? (
                        <p className="text-xs text-muted-foreground">{sj.pelanggan.nama}</p>
                      ) : null}
                    </Td>
                    <Td className="text-muted-foreground">{sj.gudang?.nama ?? '-'}</Td>
                    <Td>
                      <Badge variant={VARIAN_STATUS[sj.status]}>{LABEL_STATUS[sj.status]}</Badge>
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
