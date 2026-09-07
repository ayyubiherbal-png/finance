import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { MessageCircle, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggal as fmtTanggal } from '@/lib/format'
import { tautanWa } from '@/lib/whatsapp'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
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
import { cn } from '@/lib/utils'
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

function usePelangganCrm() {
  return useQuery({
    queryKey: ['crm-pelanggan'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_pelanggan_crm')
        .select('*')
        .eq('aktif', true)
        .eq('akun_agregat', false) // akun agregat marketplace bukan orang, tidak bisa di-follow up
        .order('total_belanja', { ascending: false })
        .limit(500)
        .returns<VPelangganCrm[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

export function CrmPelanggan() {
  const [cari, setCari] = useState('')
  const [segmenAktif, setSegmenAktif] = useState<SegmenPelanggan | null>(null)
  const { data, isLoading, error } = usePelangganCrm()

  const semua = data ?? []
  const hitungan = SEGMEN.map((s) => ({ ...s, jumlah: semua.filter((p) => p.segmen === s.kunci).length }))

  const pola = cari.trim().toLowerCase()
  const tersaring = semua.filter((p) => {
    if (segmenAktif && p.segmen !== segmenAktif) return false
    if (!pola) return true
    return p.nama.toLowerCase().includes(pola) || p.kode.toLowerCase().includes(pola)
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">CRM Pelanggan</h1>
        <p className="text-sm text-muted-foreground">
          Segmentasi otomatis dari riwayat belanja -- klik segmen untuk menyaring
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : error ? (
        <PesanError error={error} />
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {hitungan.map((s) => {
              const aktif = segmenAktif === s.kunci
              return (
                <button
                  key={s.kunci}
                  type="button"
                  title={s.jelas}
                  onClick={() => setSegmenAktif(aktif ? null : s.kunci)}
                  className={cn(
                    'cursor-pointer rounded-lg border p-3 text-left transition-colors',
                    aktif ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
                  )}
                >
                  <p className="text-xs text-muted-foreground">{s.label}</p>
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
              Menampilkan segmen <span className="font-medium text-foreground">{INFO_SEGMEN[segmenAktif].label}</span> --{' '}
              {INFO_SEGMEN[segmenAktif].jelas}.{' '}
              <button type="button" className="cursor-pointer text-primary underline" onClick={() => setSegmenAktif(null)}>
                Tampilkan semua
              </button>
            </p>
          ) : null}

          <Card>
            <CardContent className="p-0 pb-2">
              {tersaring.length === 0 ? (
                <KondisiKosong pesan="Tidak ada pelanggan yang cocok." />
              ) : (
                <Table>
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
                                  <span className="ml-1 text-xs">({p.hari_sejak_order} hari lalu)</span>
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
        </>
      )}
    </div>
  )
}
