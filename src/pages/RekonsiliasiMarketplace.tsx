import { useMemo, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggal, tanggalISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ambilSemuaBertahap } from '@/lib/ambilSemua'
import { LABEL_KANAL } from '@/pages/SalesOrder'
import { FilterPeriode, rentangDariPreset, type RentangTanggal } from '@/components/FilterPeriode'
import { TombolEkspor } from '@/components/TombolEkspor'
import type { KolomEkspor } from '@/lib/eksporData'
import {
  Badge,
  Card,
  CardContent,
  KondisiKosong,
  PesanError,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui'
import type { VPesananMenungguSettlement, VRekonsiliasiMarketplace } from '@/types/db'

function useRekonsiliasi(periode: RentangTanggal) {
  return useQuery({
    queryKey: ['rekonsiliasi-marketplace', periode],
    queryFn: async () =>
      ambilSemuaBertahap<VRekonsiliasiMarketplace>((dari, sampai) => {
        let q = supabase.from('v_rekonsiliasi_marketplace').select('*')
        if (periode.dari) q = q.gte('tanggal', periode.dari)
        if (periode.sampai) q = q.lte('tanggal', periode.sampai)
        return q.order('tanggal', { ascending: false }).range(dari, sampai)
      }),
    enabled: !!periode.dari && !!periode.sampai,
  })
}

function useMenungguSettlement() {
  return useQuery({
    queryKey: ['pesanan-menunggu-settlement-semua'],
    queryFn: async () =>
      ambilSemuaBertahap<VPesananMenungguSettlement>((dari, sampai) =>
        supabase.from('v_pesanan_menunggu_settlement').select('*').order('diimpor_pada').range(dari, sampai),
      ),
  })
}

const KOLOM_EKSPOR_SETTLEMENT: KolomEkspor<VRekonsiliasiMarketplace>[] = [
  { header: 'Tanggal', nilai: (r) => r.tanggal, format: (v) => tanggal(v as string) },
  { header: 'Kanal', nilai: (r) => LABEL_KANAL[r.kanal] },
  { header: 'Nomor Settlement', nilai: (r) => r.nomor_settlement_platform },
  { header: 'Bruto', nilai: (r) => r.bruto, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: 'Potongan', nilai: (r) => r.fee_platform + r.voucher_toko + r.ongkir_dipotong + r.refund, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: 'Netto (Dicatat)', nilai: (r) => r.netto, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: 'Netto (Jurnal Umum)', nilai: (r) => r.netto_gl, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: 'Selisih', nilai: (r) => r.netto - r.netto_gl, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: 'Status', nilai: (r) => (r.status === 'dibatalkan' ? 'Dibatalkan' : 'Selesai') },
]

const KOLOM_EKSPOR_MENUNGGU: KolomEkspor<VPesananMenungguSettlement>[] = [
  { header: 'Kanal', nilai: (r) => LABEL_KANAL[r.kanal] },
  { header: 'Nomor Pesanan', nilai: (r) => r.nomor_pesanan_platform },
  { header: 'Faktur', nilai: (r) => r.nomor_faktur },
  { header: 'Bruto Menunggu', nilai: (r) => r.bruto_menunggu, format: (v) => rupiah(v as number), rata: 'kanan' },
]

export function RekonsiliasiMarketplace() {
  const [periode, setPeriode] = useState<RentangTanggal>(() => rentangDariPreset('bulan_ini'))
  const { data, isLoading, error } = useRekonsiliasi(periode)
  const { data: menunggu, isLoading: memuatMenunggu } = useMenungguSettlement()

  const aktif = useMemo(() => (data ?? []).filter((r) => r.status !== 'dibatalkan'), [data])

  const ringkasan = useMemo(() => {
    const totalBruto = aktif.reduce((t, r) => t + Number(r.bruto), 0)
    const totalPotongan = aktif.reduce((t, r) => t + Number(r.fee_platform) + Number(r.voucher_toko) + Number(r.ongkir_dipotong) + Number(r.refund), 0)
    const totalNetto = aktif.reduce((t, r) => t + Number(r.netto), 0)
    const totalNettoGl = aktif.reduce((t, r) => t + Number(r.netto_gl), 0)
    return { totalBruto, totalPotongan, totalNetto, totalNettoGl, selisih: totalNetto - totalNettoGl }
  }, [aktif])

  const perKanal = useMemo(() => {
    const peta = new Map<string, { kanal: VRekonsiliasiMarketplace['kanal']; jumlah: number; bruto: number; potongan: number; netto: number }>()
    for (const r of aktif) {
      const ada = peta.get(r.kanal) ?? { kanal: r.kanal, jumlah: 0, bruto: 0, potongan: 0, netto: 0 }
      ada.jumlah += 1
      ada.bruto += Number(r.bruto)
      ada.potongan += Number(r.fee_platform) + Number(r.voucher_toko) + Number(r.ongkir_dipotong) + Number(r.refund)
      ada.netto += Number(r.netto)
      peta.set(r.kanal, ada)
    }
    return [...peta.values()].sort((a, b) => b.netto - a.netto)
  }, [aktif])

  const totalMenunggu = (menunggu ?? []).reduce((t, r) => t + Number(r.bruto_menunggu), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Rekonsiliasi Marketplace')}</h1>
          <p className="text-sm text-muted-foreground">
            {tt('Cocokkan pencairan marketplace dengan mutasi kas/bank di Jurnal Umum, dan pantau pesanan yang belum di-settlement')}
          </p>
        </div>
        <FilterPeriode onChange={setPeriode} presetAwal="bulan_ini" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : error ? (
        <PesanError error={error} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KartuRingkas judul={tt('Total Bruto')} nilai={rupiah(ringkasan.totalBruto)} />
            <KartuRingkas judul={tt('Total Potongan')} nilai={rupiah(ringkasan.totalPotongan)} />
            <KartuRingkas judul={tt('Total Netto (Dana Diterima)')} nilai={rupiah(ringkasan.totalNetto)} />
            <KartuRingkas
              judul={tt('Selisih vs Jurnal Umum')}
              nilai={rupiah(ringkasan.selisih)}
              bahaya={Math.abs(ringkasan.selisih) > 1}
            />
          </div>
          {Math.abs(ringkasan.selisih) > 1 ? (
            <p className="text-xs text-destructive">
              {tt('Ada selisih antara netto settlement dan mutasi kas/bank di Jurnal Umum -- seharusnya selalu nol. Laporkan sebagai bug.')}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {tt('Netto settlement cocok persis dengan mutasi kas/bank di Jurnal Umum -- tidak ada selisih.')}
            </p>
          )}

          <Card>
            <CardContent className="p-0 pb-2">
              <div className="flex items-center justify-between p-4 pb-0">
                <h2 className="text-sm font-semibold">{tt('Per Kanal')}</h2>
              </div>
              {perKanal.length === 0 ? (
                <div className="p-4">
                  <KondisiKosong pesan={tt('Belum ada settlement pada periode ini.')} />
                </div>
              ) : (
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Kanal</Th>
                      <Th className="text-right">Jml Settlement</Th>
                      <Th className="text-right">Bruto</Th>
                      <Th className="text-right">Potongan</Th>
                      <Th className="text-right">Netto</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {perKanal.map((r) => (
                      <Tr key={r.kanal}>
                        <Td className="font-medium">{LABEL_KANAL[r.kanal]}</Td>
                        <Td className="tabular text-right">{r.jumlah}</Td>
                        <Td className="tabular text-right">{rupiah(r.bruto)}</Td>
                        <Td className="tabular text-right text-muted-foreground">{rupiah(r.potongan)}</Td>
                        <Td className="tabular text-right font-medium">{rupiah(r.netto)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <TombolEkspor
              ambilData={async () => data ?? []}
              kolom={KOLOM_EKSPOR_SETTLEMENT}
              opsi={{ namaFile: `rekonsiliasi-marketplace-${periode.dari}-${periode.sampai}`, judul: tt('Rekonsiliasi Marketplace') }}
            />
          </div>
        </>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">
            {tt('Pesanan Menunggu Settlement')}
            {menunggu && menunggu.length > 0 ? (
              <Badge variant="peringatan" className="ml-2">
                {menunggu.length} &middot; {rupiah(totalMenunggu)}
              </Badge>
            ) : null}
          </h2>
          {menunggu && menunggu.length > 0 ? (
            <TombolEkspor
              ambilData={async () => menunggu}
              kolom={KOLOM_EKSPOR_MENUNGGU}
              opsi={{ namaFile: `pesanan-menunggu-settlement-${tanggalISO()}`, judul: tt('Pesanan Menunggu Settlement') }}
            />
          ) : null}
        </div>
        <Card>
          <CardContent className="p-0 pb-2">
            {memuatMenunggu ? (
              <div className="flex justify-center py-16">
                <Spinner className="h-6 w-6" />
              </div>
            ) : !menunggu || menunggu.length === 0 ? (
              <KondisiKosong pesan={tt('Semua pesanan marketplace sudah di-settlement.')} />
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Kanal</Th>
                    <Th>Nomor Pesanan</Th>
                    <Th>Faktur</Th>
                    <Th className="text-right">Bruto Menunggu</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {menunggu.map((r) => (
                    <Tr key={r.pesanan_id}>
                      <Td>
                        <Badge variant="netral">{LABEL_KANAL[r.kanal]}</Badge>
                      </Td>
                      <Td className="font-mono text-xs">{r.nomor_pesanan_platform}</Td>
                      <Td className="font-medium">{r.nomor_faktur}</Td>
                      <Td className="tabular text-right font-medium">{rupiah(r.bruto_menunggu)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function KartuRingkas({ judul, nilai, bahaya }: { judul: string; nilai: string; bahaya?: boolean }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{judul}</p>
        <p className={cn('tabular mt-1 text-lg font-semibold', bahaya && 'text-destructive')}>{nilai}</p>
      </CardContent>
    </Card>
  )
}
