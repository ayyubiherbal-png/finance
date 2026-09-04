import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rupiah, angka } from '@/lib/format'
import { cn } from '@/lib/utils'
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
import type { VLabaPelanggan, VLabaProduk } from '@/types/db'

function useLabaProduk() {
  return useQuery({
    queryKey: ['laporan-laba-produk'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_laba_produk')
        .select('*')
        .order('laba_kotor', { ascending: false })
        .limit(200)
        .returns<VLabaProduk[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

function useLabaPelanggan() {
  return useQuery({
    queryKey: ['laporan-laba-pelanggan'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_laba_pelanggan')
        .select('*')
        .order('laba_kotor', { ascending: false })
        .limit(200)
        .returns<VLabaPelanggan[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

export function LaporanLaba() {
  const [tab, setTab] = useState<'produk' | 'pelanggan'>('produk')
  const produk = useLabaProduk()
  const pelanggan = useLabaPelanggan()

  const aktif = tab === 'produk' ? produk : pelanggan
  const data = aktif.data
  const totalOmzet = (data ?? []).reduce((t: number, r: { omzet: number }) => t + Number(r.omzet), 0)
  const totalLaba = (data ?? []).reduce((t: number, r: { laba_kotor: number }) => t + Number(r.laba_kotor), 0)
  const marginKeseluruhan = totalOmzet > 0 ? (totalLaba / totalOmzet) * 100 : 0

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Laporan Laba Kotor</h1>
        <p className="text-sm text-muted-foreground">Omzet dikurangi HPP, dari seluruh faktur penjualan</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KartuAngka judul="Omzet" nilai={rupiah(totalOmzet)} />
        <KartuAngka judul="Laba kotor" nilai={rupiah(totalLaba)} />
        <KartuAngka judul="Margin" nilai={`${marginKeseluruhan.toFixed(1)}%`} />
      </div>

      <div className="inline-flex rounded-md border border-border p-0.5">
        {(['produk', 'pelanggan'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded px-3 py-1.5 text-sm font-medium capitalize transition-colors',
              tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Per {t}
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
