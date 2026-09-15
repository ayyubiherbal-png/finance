import { useMemo, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggalISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TombolEkspor } from '@/components/TombolEkspor'
import type { KolomEkspor } from '@/lib/eksporData'
import { Card, CardContent, Input, Label, PesanError, Spinner } from '@/components/ui'
import type { BarisNeraca } from '@/types/db'

function useNeraca(tanggal: string) {
  return useQuery({
    queryKey: ['neraca', tanggal],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_neraca', { p_tanggal: tanggal })
      if (error) throw error
      return (data ?? []) as BarisNeraca[]
    },
    enabled: !!tanggal,
  })
}

interface BarisTampil {
  kode: string
  nama: string
  saldo: number
}

export function Neraca() {
  const [tanggal, setTanggal] = useState(() => tanggalISO())
  const { data, isLoading, error } = useNeraca(tanggal)

  const ringkasan = useMemo(() => {
    const baris = data ?? []
    const aset = baris.filter((b) => b.tipe === 'aset' && b.saldo !== 0)
    const liabilitas = baris.filter((b) => b.tipe === 'liabilitas' && b.saldo !== 0)
    const ekuitas: BarisTampil[] = baris.filter((b) => b.tipe === 'ekuitas' && b.saldo !== 0).map((b) => ({ kode: b.kode, nama: b.nama, saldo: b.saldo }))

    const totalPendapatan = baris.filter((b) => b.tipe === 'pendapatan').reduce((t, b) => t + b.saldo, 0)
    const totalBeban = baris.filter((b) => b.tipe === 'beban').reduce((t, b) => t + b.saldo, 0)
    const labaBerjalan = totalPendapatan - totalBeban
    if (labaBerjalan !== 0) {
      ekuitas.push({ kode: '', nama: tt('Laba Berjalan (Belum Dibagi)'), saldo: labaBerjalan })
    }

    const totalAset = aset.reduce((t, b) => t + b.saldo, 0)
    const totalLiabilitas = liabilitas.reduce((t, b) => t + b.saldo, 0)
    const totalEkuitas = ekuitas.reduce((t, b) => t + b.saldo, 0)

    return { aset, liabilitas, ekuitas, totalAset, totalLiabilitas, totalEkuitas }
  }, [data])

  const selisih = ringkasan.totalAset - (ringkasan.totalLiabilitas + ringkasan.totalEkuitas)

  const barisEkspor = [
    ...ringkasan.aset.map((b) => ({ seksi: 'Aset', kode: b.kode, nama: b.nama, saldo: b.saldo })),
    { seksi: '', kode: '', nama: 'Total Aset', saldo: ringkasan.totalAset },
    ...ringkasan.liabilitas.map((b) => ({ seksi: 'Liabilitas', kode: b.kode, nama: b.nama, saldo: b.saldo })),
    { seksi: '', kode: '', nama: 'Total Liabilitas', saldo: ringkasan.totalLiabilitas },
    ...ringkasan.ekuitas.map((b) => ({ seksi: 'Ekuitas', kode: b.kode, nama: b.nama, saldo: b.saldo })),
    { seksi: '', kode: '', nama: 'Total Ekuitas', saldo: ringkasan.totalEkuitas },
  ]
  const kolomEkspor: KolomEkspor<(typeof barisEkspor)[number]>[] = [
    { header: 'Seksi', nilai: (r) => r.seksi },
    { header: 'Kode', nilai: (r) => r.kode },
    { header: 'Nama Akun', nilai: (r) => r.nama },
    { header: 'Saldo', nilai: (r) => r.saldo, format: (v) => rupiah(v as number), rata: 'kanan' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Neraca')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Posisi aset, liabilitas, dan ekuitas per tanggal tertentu')}</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{tt('Per tanggal')}</Label>
            <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="w-40" />
          </div>
          <TombolEkspor
            ambilData={async () => barisEkspor}
            kolom={kolomEkspor}
            opsi={{ namaFile: `neraca-${tanggal}`, judul: tt('Neraca') }}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : error ? (
        <PesanError error={error} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="space-y-1 p-4">
                <h2 className="pb-1 text-sm font-semibold">{tt('Aset')}</h2>
                {ringkasan.aset.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">{tt('Belum ada saldo aset.')}</p>
                ) : (
                  ringkasan.aset.map((b) => <BarisAkun key={b.kode} kode={b.kode} nama={b.nama} saldo={b.saldo} />)
                )}
                <BarisTotal label={tt('Total Aset')} nilai={ringkasan.totalAset} />
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardContent className="space-y-1 p-4">
                  <h2 className="pb-1 text-sm font-semibold">{tt('Liabilitas')}</h2>
                  {ringkasan.liabilitas.length === 0 ? (
                    <p className="py-2 text-xs text-muted-foreground">{tt('Belum ada saldo liabilitas.')}</p>
                  ) : (
                    ringkasan.liabilitas.map((b) => <BarisAkun key={b.kode} kode={b.kode} nama={b.nama} saldo={b.saldo} />)
                  )}
                  <BarisTotal label={tt('Total Liabilitas')} nilai={ringkasan.totalLiabilitas} />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-1 p-4">
                  <h2 className="pb-1 text-sm font-semibold">{tt('Ekuitas')}</h2>
                  {ringkasan.ekuitas.length === 0 ? (
                    <p className="py-2 text-xs text-muted-foreground">{tt('Belum ada saldo ekuitas.')}</p>
                  ) : (
                    ringkasan.ekuitas.map((b) => <BarisAkun key={b.kode || b.nama} kode={b.kode} nama={b.nama} saldo={b.saldo} />)
                  )}
                  <BarisTotal label={tt('Total Ekuitas')} nilai={ringkasan.totalEkuitas} />
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
              <span className="text-sm font-semibold">{tt('Total Liabilitas + Ekuitas')}</span>
              <span className="tabular text-base font-bold">{rupiah(ringkasan.totalLiabilitas + ringkasan.totalEkuitas)}</span>
            </CardContent>
          </Card>

          {Math.abs(selisih) > 1 ? (
            <p className="text-xs text-destructive">
              {tt('Selisih Aset vs Liabilitas+Ekuitas: {n} -- seharusnya nol. Laporkan sebagai bug.').replace('{n}', rupiah(selisih))}
            </p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            {tt(
              'Saldo dihitung dari Jurnal Umum sejak sistem ini mulai mencatat double-entry (September 2026). Transaksi/persediaan dari sebelum tanggal itu belum tercermin di sini sampai jurnal saldo awal (opening balance) dibuat.',
            )}
          </p>
        </>
      )}
    </div>
  )
}

function BarisAkun({ kode, nama, saldo }: { kode: string; nama: string; saldo: number }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted-foreground">
        {kode ? <span className="font-mono text-xs">{kode}</span> : null} {nama}
      </span>
      <span className={cn('tabular', saldo < 0 && 'text-destructive')}>{rupiah(saldo)}</span>
    </div>
  )
}

function BarisTotal({ label, nilai }: { label: string; nilai: number }) {
  return (
    <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
      <span>{label}</span>
      <span className={cn('tabular', nilai < 0 && 'text-destructive')}>{rupiah(nilai)}</span>
    </div>
  )
}
