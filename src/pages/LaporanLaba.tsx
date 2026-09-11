import { useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rupiah, angka, tanggalISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TombolEkspor } from '@/components/TombolEkspor'
import type { KolomEkspor } from '@/lib/eksporData'
import {
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
import type { VLabaPelanggan, VLabaProduk, VRingkasanLabaBiaya } from '@/types/db'

function useLabaProduk() {
  return useQuery({
    queryKey: ['laporan-laba-produk'],
    queryFn: async () => {
      const semua: VLabaProduk[] = []
      const ukuranHalaman = 1_000
      for (let mulai = 0; ; mulai += ukuranHalaman) {
        const { data, error } = await supabase
          .from('v_laba_produk')
          .select('*')
          .order('laba_kotor', { ascending: false })
          .order('produk_id')
          .range(mulai, mulai + ukuranHalaman - 1)
          .returns<VLabaProduk[]>()
        if (error) throw error
        semua.push(...(data ?? []))
        if ((data?.length ?? 0) < ukuranHalaman) break
      }
      return semua
    },
  })
}

function useLabaPelanggan() {
  return useQuery({
    queryKey: ['laporan-laba-pelanggan'],
    queryFn: async () => {
      const semua: VLabaPelanggan[] = []
      const ukuranHalaman = 1_000
      for (let mulai = 0; ; mulai += ukuranHalaman) {
        const { data, error } = await supabase
          .from('v_laba_pelanggan')
          .select('*')
          .order('laba_kotor', { ascending: false })
          .order('pelanggan_id')
          .range(mulai, mulai + ukuranHalaman - 1)
          .returns<VLabaPelanggan[]>()
        if (error) throw error
        semua.push(...(data ?? []))
        if ((data?.length ?? 0) < ukuranHalaman) break
      }
      return semua
    },
  })
}

function useRingkasanLabaBiaya() {
  return useQuery({
    queryKey: ['laporan-laba-ringkasan'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_ringkasan_laba_biaya').select('*').single()
      if (error) throw error
      return data as VRingkasanLabaBiaya
    },
  })
}

export function LaporanLaba() {
  const [tab, setTab] = useState<'produk' | 'pelanggan'>('produk')
  const produk = useLabaProduk()
  const pelanggan = useLabaPelanggan()
  const ringkasan = useRingkasanLabaBiaya()

  const aktif = tab === 'produk' ? produk : pelanggan
  const data = aktif.data
  const totalOmzet = (data ?? []).reduce((t: number, r: { omzet: number }) => t + Number(r.omzet), 0)
  const totalLaba = (data ?? []).reduce((t: number, r: { laba_kotor: number }) => t + Number(r.laba_kotor), 0)
  const marginKeseluruhan = totalOmzet > 0 ? (totalLaba / totalOmzet) * 100 : 0

  const kolomEkspor: KolomEkspor<VLabaProduk | VLabaPelanggan>[] =
    tab === 'produk'
      ? [
          { header: 'Produk', nilai: (r) => (r as VLabaProduk).nama_produk },
          { header: 'Kode', nilai: (r) => (r as VLabaProduk).kode_produk },
          { header: 'Qty Terjual', nilai: (r) => (r as VLabaProduk).qty_terjual, format: (v) => angka(v as number), rata: 'kanan' },
          { header: 'Omzet', nilai: (r) => r.omzet, format: (v) => rupiah(v as number), rata: 'kanan' },
          { header: 'HPP', nilai: (r) => r.hpp, format: (v) => rupiah(v as number), rata: 'kanan' },
          { header: 'Laba Kotor', nilai: (r) => r.laba_kotor, format: (v) => rupiah(v as number), rata: 'kanan' },
          { header: 'Margin', nilai: (r) => r.margin_persen, format: (v) => `${(v as number).toFixed(1)}%`, rata: 'kanan' },
        ]
      : [
          { header: 'Pelanggan', nilai: (r) => (r as VLabaPelanggan).nama_pelanggan },
          { header: 'Jml Faktur', nilai: (r) => (r as VLabaPelanggan).jumlah_faktur, rata: 'kanan' },
          { header: 'Omzet', nilai: (r) => r.omzet, format: (v) => rupiah(v as number), rata: 'kanan' },
          { header: 'HPP', nilai: (r) => r.hpp, format: (v) => rupiah(v as number), rata: 'kanan' },
          { header: 'Laba Kotor', nilai: (r) => r.laba_kotor, format: (v) => rupiah(v as number), rata: 'kanan' },
          { header: 'Margin', nilai: (r) => r.margin_persen, format: (v) => `${(v as number).toFixed(1)}%`, rata: 'kanan' },
        ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Laporan Laba Kotor')}</h1>
          <p className="text-sm text-muted-foreground">{tt('Penjualan bersih dikurangi HPP setelah retur, dianalisis per produk atau pelanggan')}</p>
        </div>
        {data && data.length > 0 ? (
          <TombolEkspor
            ambilData={async () => data}
            kolom={kolomEkspor}
            opsi={{ namaFile: `laporan-laba-${tab}-${tanggalISO()}`, judul: tt('Laporan Laba Kotor') }}
          />
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KartuAngka judul="Omzet" nilai={rupiah(totalOmzet)} />
        <KartuAngka judul="Laba kotor" nilai={rupiah(totalLaba)} />
        <KartuAngka judul="Margin" nilai={`${marginKeseluruhan.toFixed(1)}%`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KartuAngka
          judul={tt('Total Biaya Operasional (semua waktu)')}
          nilai={rupiah(ringkasan.data?.total_biaya_operasional ?? 0)}
        />
        <KartuAngka judul={tt('Laba Bersih (semua waktu)')} nilai={rupiah(ringkasan.data?.laba_bersih ?? 0)} />
        <KartuAngka
          judul={tt('Biaya Non-Operasional (semua waktu)')}
          nilai={rupiah(ringkasan.data?.total_biaya_non_operasional ?? 0)}
        />
      </div>
      {(ringkasan.data?.total_biaya_non_operasional ?? 0) > 0 ? (
        <p className="text-xs text-muted-foreground">
          {tt('Biaya non-operasional (modal, ambil pribadi, dll) TIDAK ikut mengurangi Laba Bersih di atas -- kelola tandanya di menu Kategori Biaya.')}
        </p>
      ) : null}

      <div className="inline-flex rounded-md border border-border p-0.5">
        {(['produk', 'pelanggan'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'cursor-pointer rounded px-3 py-1.5 text-sm font-medium capitalize transition-colors',
              tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tt('Per')} {t}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 pb-2">
          {aktif.isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner className="h-6 w-6" />
            </div>
          ) : aktif.error ? (
            <div className="p-4">
              <PesanError error={aktif.error} />
            </div>
          ) : !data || data.length === 0 ? (
            <KondisiKosong pesan="Belum ada penjualan tercatat." />
          ) : tab === 'produk' ? (
            <Table>
              <Thead>
                <Tr>
                  <Th>Produk</Th>
                  <Th className="text-right">Qty terjual</Th>
                  <Th className="text-right">Omzet</Th>
                  <Th className="text-right">HPP</Th>
                  <Th className="text-right">Laba kotor</Th>
                  <Th className="text-right">Margin</Th>
                </Tr>
              </Thead>
              <Tbody>
                {(data as VLabaProduk[]).map((r) => (
                  <Tr key={r.produk_id}>
                    <Td className="font-medium">
                      {r.nama_produk}
                      <span className="ml-1 font-mono text-xs text-muted-foreground">{r.kode_produk}</span>
                    </Td>
                    <Td className="tabular text-right">{angka(r.qty_terjual)}</Td>
                    <Td className="tabular text-right">{rupiah(r.omzet)}</Td>
                    <Td className="tabular text-right text-muted-foreground">{rupiah(r.hpp)}</Td>
                    <Td className="tabular text-right font-medium">{rupiah(r.laba_kotor)}</Td>
                    <Td className={cn('tabular text-right', r.margin_persen < 0 && 'text-destructive')}>
                      {r.margin_persen.toFixed(1)}%
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Pelanggan</Th>
                  <Th className="text-right">Jml faktur</Th>
                  <Th className="text-right">Omzet</Th>
                  <Th className="text-right">HPP</Th>
                  <Th className="text-right">Laba kotor</Th>
                  <Th className="text-right">Margin</Th>
                </Tr>
              </Thead>
              <Tbody>
                {(data as VLabaPelanggan[]).map((r) => (
                  <Tr key={r.pelanggan_id}>
                    <Td className="font-medium">{r.nama_pelanggan}</Td>
                    <Td className="tabular text-right">{r.jumlah_faktur}</Td>
                    <Td className="tabular text-right">{rupiah(r.omzet)}</Td>
                    <Td className="tabular text-right text-muted-foreground">{rupiah(r.hpp)}</Td>
                    <Td className="tabular text-right font-medium">{rupiah(r.laba_kotor)}</Td>
                    <Td className={cn('tabular text-right', r.margin_persen < 0 && 'text-destructive')}>
                      {r.margin_persen.toFixed(1)}%
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

function KartuAngka({ judul, nilai }: { judul: string; nilai: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{judul}</p>
        <p className="tabular mt-1 text-lg font-semibold">{nilai}</p>
      </CardContent>
    </Card>
  )
}
