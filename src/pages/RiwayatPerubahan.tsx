import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge, Card, KondisiKosong, Paginasi, PesanError, Select, Spinner, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { tanggalWaktu } from '@/lib/format'
import { tt } from '@/lib/i18nText'

const UKURAN_HALAMAN = 50

interface BarisAudit {
  id: number
  tabel: string
  record_id: string | null
  aksi: 'insert' | 'update' | 'delete'
  data_lama: Record<string, unknown> | null
  data_baru: Record<string, unknown> | null
  dilakukan_pada: string
  pelaku: { nama: string } | null
}

function labelTabel(nama: string) {
  return nama.replaceAll('_', ' ').replace(/\b\w/g, (x) => x.toUpperCase())
}

function ringkasPerubahan(baris: BarisAudit) {
  if (baris.aksi === 'insert') return `Data baru: ${String(baris.data_baru?.nomor ?? baris.data_baru?.nama ?? baris.record_id ?? '-')}`
  if (baris.aksi === 'delete') return `Data dihapus: ${String(baris.data_lama?.nomor ?? baris.data_lama?.nama ?? baris.record_id ?? '-')}`
  const lama = baris.data_lama ?? {}
  const baru = baris.data_baru ?? {}
  const kunci = Object.keys(baru).filter((k) => k !== 'updated_at' && JSON.stringify(lama[k]) !== JSON.stringify(baru[k]))
  return kunci.length ? `Diubah: ${kunci.slice(0, 5).map((k) => labelTabel(k)).join(', ')}${kunci.length > 5 ? ` +${kunci.length - 5}` : ''}` : 'Data diperbarui'
}

export function RiwayatPerubahan() {
  const [halaman, setHalaman] = useState(1)
  const [filterTabel, setFilterTabel] = useState('')
  const [filterAksi, setFilterAksi] = useState('')

  useEffect(() => setHalaman(1), [filterTabel, filterAksi])

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-log', halaman, filterTabel, filterAksi],
    queryFn: async () => {
      const mulai = (halaman - 1) * UKURAN_HALAMAN
      let q = supabase
        .from('audit_log')
        .select('id, tabel, record_id, aksi, data_lama, data_baru, dilakukan_pada, pelaku:dilakukan_oleh(nama)', { count: 'exact' })
      if (filterTabel) q = q.eq('tabel', filterTabel)
      if (filterAksi) q = q.eq('aksi', filterAksi)
      const hasil = await q.order('dilakukan_pada', { ascending: false }).range(mulai, mulai + UKURAN_HALAMAN - 1)
      if (hasil.error) throw hasil.error
      return { baris: (hasil.data ?? []) as unknown as BarisAudit[], total: hasil.count ?? 0 }
    },
  })

  const tabelTersedia = useMemo(() => [...new Set((data?.baris ?? []).map((x) => x.tabel))].sort(), [data?.baris])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><History className="h-5 w-5" /> {tt('Riwayat Perubahan')}</h1>
        <p className="text-sm text-muted-foreground">{tt('Jejak siapa mengubah data penting dan kapan perubahan terjadi.')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Select className="w-56" value={filterTabel} onChange={(e) => setFilterTabel(e.target.value)}>
          <option value="">Semua data</option>
          {tabelTersedia.map((x) => <option key={x} value={x}>{labelTabel(x)}</option>)}
        </Select>
        <Select className="w-44" value={filterAksi} onChange={(e) => setFilterAksi(e.target.value)}>
          <option value="">Semua tindakan</option>
          <option value="insert">Dibuat</option><option value="update">Diubah</option><option value="delete">Dihapus</option>
        </Select>
      </div>
      {error ? <PesanError error={error} /> : null}
      <Card>
        {isLoading ? <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div> : !data?.baris.length ? (
          <KondisiKosong pesan="Belum ada riwayat. Perubahan data akan tercatat otomatis setelah migrasi dijalankan." />
        ) : (
          <Table><Thead><Tr><Th>Waktu</Th><Th>Pengguna</Th><Th>Data</Th><Th>Tindakan</Th><Th>Ringkasan</Th></Tr></Thead>
            <Tbody>{data.baris.map((x) => <Tr key={x.id}><Td className="whitespace-nowrap">{tanggalWaktu(x.dilakukan_pada)}</Td><Td>{x.pelaku?.nama ?? tt('Sistem')}</Td><Td>{labelTabel(x.tabel)}</Td><Td><Badge variant={x.aksi === 'delete' ? 'bahaya' : x.aksi === 'insert' ? 'sukses' : 'peringatan'}>{x.aksi === 'insert' ? 'Dibuat' : x.aksi === 'update' ? 'Diubah' : 'Dihapus'}</Badge></Td><Td>{ringkasPerubahan(x)}</Td></Tr>)}</Tbody>
          </Table>
        )}
      </Card>
      <Paginasi halaman={halaman} ukuranHalaman={UKURAN_HALAMAN} total={data?.total ?? 0} onUbah={setHalaman} />
    </div>
  )
}
