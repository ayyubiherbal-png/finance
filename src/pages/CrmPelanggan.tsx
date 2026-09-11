import { useEffect, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { MessageCircle, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggal as fmtTanggal, tanggalISO } from '@/lib/format'
import { tautanWa } from '@/lib/whatsapp'
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
  Paginasi,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui'
import { cn, kutipFilterPostgrest } from '@/lib/utils'
import type { SegmenPelanggan, VPelangganCrm } from '@/types/db'

/** Urutan sengaja dari "paling sehat" ke "paling perlu dikejar". */
const SEGMEN: { kunci: SegmenPelanggan; label: string; varian: 'sukses' | 'default' | 'peringatan' | 'bahaya' | 'netral'; jelas: string }[] = [
  { kunci: 'juara', label: 'Juara', varian: 'sukses', jelas: '3+ transaksi, masih aktif belanja' },
  { kunci: 'setia', label: 'Setia', varian: 'default', jelas: '2 transaksi, masih aktif belanja' },
  { kunci: 'baru', label: 'Baru', varian: 'default', jelas: 'Baru 1x belanja' },
  { kunci: 'mulai_hilang', label: 'Mulai Hilang', varian: 'peringatan', jelas: '2-4 bulan tidak belanja -- perlu dihubungi' },
  { kunci: 'tidur', label: 'Tidur', varian: 'bahaya', jelas: 'Lebih dari 4 bulan tidak belanja' },
  { kunci: 'belum_pernah', label: 'Belum Pernah', varian: 'netral', jelas: 'Terdaftar tapi belum pernah belanja' },
]

export const INFO_SEGMEN = Object.fromEntries(SEGMEN.map((s) => [s.kunci, s])) as Record<
  SegmenPelanggan,
  (typeof SEGMEN)[number]
>

const UKURAN_HALAMAN = 50

function usePelangganCrm(cari: string, segmen: SegmenPelanggan | null, halaman: number) {
  return useQuery({
    queryKey: ['crm-pelanggan', cari, segmen, halaman],
    queryFn: async () => {
      let q = supabase
        .from('v_pelanggan_crm')
        .select('*', { count: 'exact' })
        .eq('aktif', true)
        .eq('akun_agregat', false) // akun agregat marketplace bukan orang, tidak bisa di-follow up
      if (segmen) q = q.eq('segmen', segmen)
      if (cari.trim()) {
        const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
        q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
      }
      const mulai = (halaman - 1) * UKURAN_HALAMAN
      const { data, error, count } = await q
        .order('total_belanja', { ascending: false })
        .range(mulai, mulai + UKURAN_HALAMAN - 1)
        .returns<VPelangganCrm[]>()
      if (error) throw error
      return { baris: data ?? [], total: count ?? 0 }
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

function useHitunganSegmen() {
  return useQuery({
    queryKey: ['crm-pelanggan', 'hitungan-segmen'],
    queryFn: async () => {
      const hasil = await Promise.all(SEGMEN.map((s) => supabase.from('v_pelanggan_crm').select('pelanggan_id', { count: 'exact', head: true }).eq('aktif', true).eq('akun_agregat', false).eq('segmen', s.kunci)))
      const gagal = hasil.find((x) => x.error)
      if (gagal?.error) throw gagal.error
      return Object.fromEntries(SEGMEN.map((s, i) => [s.kunci, hasil[i]!.count ?? 0])) as Record<SegmenPelanggan, number>
    },
  })
}

const KOLOM_EKSPOR_CRM: KolomEkspor<VPelangganCrm>[] = [
  { header: 'Kode', nilai: (r) => r.kode },
  { header: 'Nama', nilai: (r) => r.nama },
  { header: 'Segmen', nilai: (r) => INFO_SEGMEN[r.segmen].label },
  { header: 'Transaksi', nilai: (r) => r.jumlah_transaksi, rata: 'kanan' },
  { header: 'Total Belanja', nilai: (r) => r.total_belanja, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: 'Terakhir Order', nilai: (r) => r.terakhir_order ?? '-', format: (v) => (v ? fmtTanggal(v as string) : '-') },
]

export function CrmPelanggan() {
  const [cari, setCari] = useState('')
  const [segmenAktif, setSegmenAktif] = useState<SegmenPelanggan | null>(null)
  const [halaman, setHalaman] = useState(1)
  const { data, isLoading, error, isFetching } = usePelangganCrm(cari, segmenAktif, halaman)
  const hitunganQuery = useHitunganSegmen()
  const errorHalaman = error ?? hitunganQuery.error
  useEffect(() => setHalaman(1), [cari, segmenAktif])
  const tersaring = data?.baris ?? []
  const hitungan = SEGMEN.map((s) => ({ ...s, jumlah: hitunganQuery.data?.[s.kunci] ?? 0 }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('CRM Pelanggan')}</h1>
          <p className="text-sm text-muted-foreground">
            {tt('Segmentasi otomatis dari riwayat belanja -- klik segmen untuk menyaring')}
          </p>
        </div>
        <TombolEkspor
          ambilData={async () => {
            let q = supabase.from('v_pelanggan_crm').select('*').eq('aktif', true).eq('akun_agregat', false)
            if (segmenAktif) q = q.eq('segmen', segmenAktif)
            if (cari.trim()) {
              const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
              q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
            }
            const { data, error } = await q.order('total_belanja', { ascending: false }).limit(10000).returns<VPelangganCrm[]>()
            if (error) throw error
            return data ?? []
          }}
          kolom={KOLOM_EKSPOR_CRM}
          opsi={{ namaFile: `crm-pelanggan-${tanggalISO()}`, judul: tt('CRM Pelanggan') }}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : errorHalaman ? (
        <PesanError error={errorHalaman} />
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {hitungan.map((s) => {
              const aktif = segmenAktif === s.kunci
              return (
                <button
                  key={s.kunci}
                  type="button"
                  title={tt(s.jelas)}
                  onClick={() => setSegmenAktif(aktif ? null : s.kunci)}
                  className={cn(
                    'cursor-pointer rounded-lg border p-3 text-left transition-colors',
                    aktif ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
                  )}
                >
                  <p className="text-xs text-muted-foreground">{tt(s.label)}</p>
                  <p className="text-xl font-semibold">{s.jumlah}</p>
                </button>
              )
            })}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Cari nama atau ID..."
              value={cari}
              onChange={(e) => setCari(e.target.value)}
            />
          </div>

          {segmenAktif ? (
            <p className="text-sm text-muted-foreground">
              {tt('Menampilkan segmen')} <span className="font-medium text-foreground">{tt(INFO_SEGMEN[segmenAktif].label)}</span> --{' '}
              {tt(INFO_SEGMEN[segmenAktif].jelas)}.{' '}
              <button type="button" className="cursor-pointer text-primary underline" onClick={() => setSegmenAktif(null)}>
                {tt('Tampilkan semua')}
              </button>
            </p>
          ) : null}

          <Card>
            <CardContent className="p-0 pb-2">
              {tersaring.length === 0 ? (
                <KondisiKosong pesan="Tidak ada pelanggan yang cocok." />
              ) : (
                <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
                  <Thead>
                    <Tr>
                      <Th>Nama</Th>
                      <Th>Segmen</Th>
                      <Th className="text-right">Transaksi</Th>
                      <Th className="text-right">Total belanja</Th>
                      <Th>Terakhir order</Th>
                      <Th></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {tersaring.map((p) => {
                      const wa = tautanWa(p.whatsapp ?? p.telepon)
                      return (
                        <Tr key={p.pelanggan_id}>
                          <Td className="font-medium">
                            <Link to={`/crm/pelanggan/${p.pelanggan_id}`} className="text-primary hover:underline">
                              {p.nama}
                            </Link>
                            <span className="ml-1.5 font-mono text-xs text-muted-foreground">{p.kode}</span>
                          </Td>
                          <Td>
                            <Badge variant={INFO_SEGMEN[p.segmen].varian}>{INFO_SEGMEN[p.segmen].label}</Badge>
                          </Td>
                          <Td className="tabular text-right">{p.jumlah_transaksi}</Td>
                          <Td className="tabular text-right">{rupiah(p.total_belanja)}</Td>
                          <Td className="text-muted-foreground">
                            {p.terakhir_order ? (
                              <>
                                {fmtTanggal(p.terakhir_order)}
                                {p.hari_sejak_order !== null ? (
                                  <span className="ml-1 text-xs">({p.hari_sejak_order} {tt('hari lalu')})</span>
                                ) : null}
                              </>
                            ) : (
                              '-'
                            )}
                          </Td>
                          <Td className="text-right">
                            {wa ? (
                              <Button variant="outline" size="sm" asChild>
                                <a href={wa} target="_blank" rel="noreferrer">
                                  <MessageCircle className="h-4 w-4" />
                                  Chat
                                </a>
                              </Button>
                            ) : null}
                          </Td>
                        </Tr>
                      )
                    })}
                  </Tbody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Paginasi halaman={halaman} ukuranHalaman={UKURAN_HALAMAN} total={data?.total ?? 0} onUbah={setHalaman} />
        </>
      )}
    </div>
  )
}
