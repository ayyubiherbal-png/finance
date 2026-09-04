import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggal, tanggalISO } from '@/lib/format'
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
import type { VKartuKasBank, VSaldoKasBank } from '@/types/db'

function useDaftarAkun() {
  return useQuery({
    queryKey: ['akun-kas-bank-pilihan'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_saldo_kas_bank')
        .select('akun_id, kode, nama, aktif')
        .eq('aktif', true)
        .order('nama')
        .returns<Pick<VSaldoKasBank, 'akun_id' | 'kode' | 'nama' | 'aktif'>[]>()
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60_000,
  })
}

function useKartuKasBank(akunId: string, dari: string, sampai: string) {
  return useQuery({
    queryKey: ['kartu-kas-bank', akunId, dari, sampai],
    queryFn: async () => {
      let q = supabase.from('v_kartu_kas_bank').select('*').eq('akun_id', akunId)
      if (dari) q = q.gte('tanggal', dari)
      if (sampai) q = q.lte('tanggal', sampai)
      const { data, error } = await q.order('tanggal').order('ref_id').limit(500).returns<VKartuKasBank[]>()
      if (error) throw error
      return data ?? []
    },
    enabled: !!akunId,
  })
}

const LABEL_JENIS = {
  penerimaan_kas: 'Penerimaan Kas',
  pembayaran_supplier: 'Pembayaran Supplier',
}

export function KartuKasBank() {
  const { data: akunList } = useDaftarAkun()
  const [akunId, setAkunId] = useState('')
  const batasAwal = new Date()
  batasAwal.setDate(batasAwal.getDate() - 30)
  const [dari, setDari] = useState(tanggalISO(batasAwal))
  const [sampai, setSampai] = useState(tanggalISO())

  const { data, isLoading, error, isFetching } = useKartuKasBank(akunId, dari, sampai)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Kartu Kas & Bank</h1>
        <p className="text-sm text-muted-foreground">Riwayat mutasi dan saldo berjalan per akun</p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-1">
            <Label>Akun</Label>
            <Select value={akunId} onChange={(e) => setAkunId(e.target.value)}>
              <option value="" disabled>
                Pilih akun...
              </option>
              {(akunList ?? []).map((a) => (
                <option key={a.akun_id} value={a.akun_id}>
                  {a.nama}
                </option>
              ))}
            </Select>
          </div>
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

      {!akunId ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Pilih akun dulu untuk melihat kartunya.
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
                    <Th className="text-right">Masuk</Th>
                    <Th className="text-right">Keluar</Th>
                    <Th className="text-right">Saldo</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.map((b) => (
                    <Tr key={b.ref_id}>
                      <Td className="text-muted-foreground">{tanggal(b.tanggal)}</Td>
                      <Td>
                        <Badge variant="netral">{LABEL_JENIS[b.jenis]}</Badge>
                      </Td>
                      <Td className="font-mono text-xs">{b.ref_nomor}</Td>
                      <Td className="tabular text-right text-emerald-600">{b.masuk > 0 ? rupiah(b.masuk) : '-'}</Td>
                      <Td className="tabular text-right text-destructive">{b.keluar > 0 ? rupiah(b.keluar) : '-'}</Td>
                      <Td className="tabular text-right font-medium">{rupiah(b.saldo)}</Td>
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
