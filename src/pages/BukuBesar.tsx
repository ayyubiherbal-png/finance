import { useMemo, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggal } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ambilSemuaBertahap } from '@/lib/ambilSemua'
import { FilterPeriode, rentangDariPreset, type RentangTanggal } from '@/components/FilterPeriode'
import { TombolEkspor } from '@/components/TombolEkspor'
import type { KolomEkspor } from '@/lib/eksporData'
import { Card, CardContent, KondisiKosong, Label, PesanError, Select, Spinner, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import type { AkunCoa, BarisNeraca, VBukuBesar } from '@/types/db'

function useDaftarAkun() {
  return useQuery({
    queryKey: ['akun-coa-semua'],
    queryFn: async () =>
      ambilSemuaBertahap<AkunCoa>((dari, sampai) =>
        supabase.from('akun_coa').select('*').order('kode').range(dari, sampai).returns<AkunCoa[]>(),
      ),
  })
}

/** Saldo awal = saldo kumulatif s/d SEHARI SEBELUM tanggal mulai periode. */
function useSaldoAwal(akunId: string, dari: string | null) {
  return useQuery({
    queryKey: ['buku-besar-saldo-awal', akunId, dari],
    queryFn: async () => {
      const cutoff = new Date(dari as string)
      cutoff.setDate(cutoff.getDate() - 1)
      const { data, error } = await supabase.rpc('fn_neraca', { p_tanggal: cutoff.toISOString().slice(0, 10) })
      if (error) throw error
      return (data as BarisNeraca[] | null)?.find((b) => b.akun_id === akunId)?.saldo ?? 0
    },
    enabled: !!akunId && !!dari,
  })
}

function useTransaksi(akunId: string, periode: RentangTanggal) {
  return useQuery({
    queryKey: ['buku-besar-transaksi', akunId, periode],
    queryFn: async () =>
      ambilSemuaBertahap<VBukuBesar>((mulai, sampaiIdx) =>
        supabase
          .from('v_buku_besar')
          .select('*')
          .eq('akun_id', akunId)
          .gte('tanggal', periode.dari as string)
          .lte('tanggal', periode.sampai as string)
          .order('tanggal')
          .order('created_at')
          .range(mulai, sampaiIdx)
          .returns<VBukuBesar[]>(),
      ),
    enabled: !!akunId && !!periode.dari && !!periode.sampai,
  })
}

export function BukuBesar() {
  const [akunId, setAkunId] = useState('')
  const [periode, setPeriode] = useState<RentangTanggal>(() => rentangDariPreset('bulan_ini'))
  const { data: daftarAkun, isLoading: memuatAkun } = useDaftarAkun()
  const { data: saldoAwal, isLoading: memuatSaldoAwal } = useSaldoAwal(akunId, periode.dari)
  const { data: transaksi, isLoading: memuatTransaksi, error } = useTransaksi(akunId, periode)

  const akunTerpilih = daftarAkun?.find((a) => a.id === akunId)

  const baris = useMemo(() => {
    let saldo = saldoAwal ?? 0
    return (transaksi ?? []).map((t) => {
      const mutasi = akunTerpilih?.saldo_normal === 'kredit' ? t.kredit - t.debit : t.debit - t.kredit
      saldo += mutasi
      return { ...t, saldoBerjalan: saldo }
    })
  }, [transaksi, saldoAwal, akunTerpilih])

  const saldoAkhir = baris.length > 0 ? baris[baris.length - 1]!.saldoBerjalan : saldoAwal ?? 0
  const totalDebit = (transaksi ?? []).reduce((t, r) => t + Number(r.debit), 0)
  const totalKredit = (transaksi ?? []).reduce((t, r) => t + Number(r.kredit), 0)

  const kolomEkspor: KolomEkspor<(typeof baris)[number]>[] = [
    { header: 'Tanggal', nilai: (r) => r.tanggal, format: (v) => tanggal(v as string) },
    { header: 'Nomor Jurnal', nilai: (r) => r.nomor },
    { header: 'Referensi', nilai: (r) => r.ref_nomor },
    { header: 'Keterangan', nilai: (r) => r.keterangan },
    { header: 'Debit', nilai: (r) => r.debit, format: (v) => (v ? rupiah(v as number) : ''), rata: 'kanan' },
    { header: 'Kredit', nilai: (r) => r.kredit, format: (v) => (v ? rupiah(v as number) : ''), rata: 'kanan' },
    { header: 'Saldo', nilai: (r) => r.saldoBerjalan, format: (v) => rupiah(v as number), rata: 'kanan' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Buku Besar')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Riwayat mutasi & saldo berjalan tiap akun COA')}</p>
        </div>
        {akunId && baris.length > 0 ? (
          <TombolEkspor
            ambilData={async () => baris}
            kolom={kolomEkspor}
            opsi={{ namaFile: `buku-besar-${akunTerpilih?.kode}-${periode.dari}-${periode.sampai}`, judul: tt('Buku Besar') }}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] space-y-1.5">
          <Label className="text-xs">{tt('Akun')}</Label>
          <Select value={akunId} onChange={(e) => setAkunId(e.target.value)} disabled={memuatAkun}>
            <option value="">{tt('-- Pilih akun --')}</option>
            {(daftarAkun ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.kode} -- {a.nama}
              </option>
            ))}
          </Select>
        </div>
        <FilterPeriode onChange={setPeriode} presetAwal="bulan_ini" />
      </div>

      {!akunId ? (
        <Card>
          <CardContent className="p-4">
            <KondisiKosong pesan={tt('Pilih akun untuk melihat riwayat mutasinya.')} />
          </CardContent>
        </Card>
      ) : error ? (
        <PesanError error={error} />
      ) : memuatTransaksi || memuatSaldoAwal ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <KartuSaldo judul={tt('Saldo Awal')} nilai={saldoAwal ?? 0} />
            <KartuSaldo judul={tt('Mutasi Periode')} nilai={saldoAkhir - (saldoAwal ?? 0)} />
            <KartuSaldo judul={tt('Saldo Akhir')} nilai={saldoAkhir} />
          </div>

          <Card>
            <CardContent className="p-0 pb-2">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Tanggal</Th>
                    <Th>Nomor</Th>
                    <Th>Referensi</Th>
                    <Th>Keterangan</Th>
                    <Th className="text-right">Debit</Th>
                    <Th className="text-right">Kredit</Th>
                    <Th className="text-right">Saldo</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  <Tr>
                    <Td colSpan={6} className="text-right text-xs text-muted-foreground">
                      {tt('Saldo awal')}
                    </Td>
                    <Td className="tabular text-right text-xs text-muted-foreground">{rupiah(saldoAwal ?? 0)}</Td>
                  </Tr>
                  {baris.map((b) => (
                    <Tr key={b.baris_id}>
                      <Td className="text-muted-foreground">{tanggal(b.tanggal)}</Td>
                      <Td className="font-mono text-xs">{b.nomor}</Td>
                      <Td className="font-mono text-xs">{b.ref_nomor}</Td>
                      <Td>{b.keterangan}</Td>
                      <Td className="tabular text-right">{b.debit ? rupiah(b.debit) : '-'}</Td>
                      <Td className="tabular text-right">{b.kredit ? rupiah(b.kredit) : '-'}</Td>
                      <Td className={cn('tabular text-right font-medium', b.saldoBerjalan < 0 && 'text-destructive')}>
                        {rupiah(b.saldoBerjalan)}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              {baris.length === 0 ? <KondisiKosong pesan={tt('Tidak ada mutasi pada periode ini.')} /> : null}
              <div className="flex items-center justify-between border-t border-border px-4 pt-2 text-sm font-semibold">
                <span>{tt('Total')}</span>
                <div className="flex gap-6">
                  <span className="tabular">{rupiah(totalDebit)}</span>
                  <span className="tabular">{rupiah(totalKredit)}</span>
                  <span className={cn('tabular', saldoAkhir < 0 && 'text-destructive')}>{rupiah(saldoAkhir)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function KartuSaldo({ judul, nilai }: { judul: string; nilai: number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{judul}</p>
        <p className={cn('tabular mt-1 text-lg font-semibold', nilai < 0 && 'text-destructive')}>{rupiah(nilai)}</p>
      </CardContent>
    </Card>
  )
}
