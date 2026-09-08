import { useQuery } from '@tanstack/react-query'
import { tt } from '@/lib/i18nText'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MessageCircle, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { angka, rupiah, tanggal as fmtTanggal, tanggalWaktu } from '@/lib/format'
import { tautanWa } from '@/lib/whatsapp'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { INFO_KATEGORI, type Kategori } from '@/pages/TugasFollowUp'
import type { RiwayatTahapPelanggan, SegmenPelanggan, StatusBayar, VPelangganCrm, VProdukFavoritPelanggan } from '@/types/db'

const LABEL_SEGMEN: Record<SegmenPelanggan, { label: string; varian: 'sukses' | 'default' | 'peringatan' | 'bahaya' | 'netral' }> = {
  juara: { label: 'Juara', varian: 'sukses' },
  setia: { label: 'Setia', varian: 'default' },
  baru: { label: 'Baru', varian: 'default' },
  mulai_hilang: { label: 'Mulai Hilang', varian: 'peringatan' },
  tidur: { label: 'Tidur', varian: 'bahaya' },
  belum_pernah: { label: 'Belum Pernah', varian: 'netral' },
}

const LABEL_BAYAR: Record<StatusBayar, string> = {
  belum: 'Belum Bayar',
  sebagian: 'Sebagian',
  lunas: 'Lunas',
}

interface KontakPelanggan {
  email: string | null
  alamat: string | null
  kelurahan: { nama: string } | null
  kecamatan: { nama: string } | null
  kabupaten_kota: { nama: string } | null
  provinsi: { nama: string } | null
}

interface RiwayatFaktur {
  id: string
  nomor: string
  tanggal: string
  total: number
  sisa: number
  status_bayar: StatusBayar
}

export function CrmPelangganProfil() {
  const { id } = useParams<{ id: string }>()

  const { data: crm, isLoading, error } = useQuery({
    queryKey: ['crm-pelanggan-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_pelanggan_crm')
        .select('*')
        .eq('pelanggan_id', id as string)
        .single()
      if (error) throw error
      return data as VPelangganCrm
    },
  })

  const { data: kontak } = useQuery({
    queryKey: ['crm-pelanggan-kontak', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pelanggan')
        .select(
          'email, alamat, kelurahan:kelurahan_kode(nama), kecamatan:kecamatan_kode(nama), ' +
            'kabupaten_kota:kabupaten_kode(nama), provinsi:provinsi_kode(nama)',
        )
        .eq('id', id as string)
        .single()
      if (error) throw error
      return data as unknown as KontakPelanggan
    },
    enabled: !!crm,
  })

  const { data: favorit } = useQuery({
    queryKey: ['crm-produk-favorit', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_produk_favorit_pelanggan')
        .select('*')
        .eq('pelanggan_id', id as string)
        .order('total_nilai', { ascending: false })
        .limit(5)
        .returns<VProdukFavoritPelanggan[]>()
      if (error) throw error
      return data ?? []
    },
    enabled: !!crm,
  })

  const { data: riwayat } = useQuery({
    queryKey: ['crm-riwayat-faktur', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('faktur_penjualan')
        .select('id, nomor, tanggal, total, sisa, status_bayar')
        .eq('pelanggan_id', id as string)
        .neq('status', 'dibatalkan')
        .order('tanggal', { ascending: false })
        .limit(20)
        .returns<RiwayatFaktur[]>()
      if (error) throw error
      return data ?? []
    },
    enabled: !!crm,
  })

  // Riwayat tahap FU (0037) -- jejak setiap kali pelanggan ini masuk jendela
  // suatu tahap treatment, digabung (di frontend, bukan SQL join) dengan
  // riwayat_follow_up lewat tugas_id yang sama untuk tahu statusnya:
  // sudah ditandai selesai (dan kapan), atau muncul tapi terlewat.
  const { data: riwayatTahap } = useQuery({
    queryKey: ['crm-riwayat-tahap', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('riwayat_tahap_pelanggan')
        .select('*')
        .eq('entitas_tipe', 'pelanggan')
        .eq('entitas_id', id as string)
        .order('muncul_pertama_pada', { ascending: false })
        .limit(50)
        .returns<RiwayatTahapPelanggan[]>()
      if (error) throw error
      return data ?? []
    },
    enabled: !!crm,
  })

  const { data: tahapSelesai } = useQuery({
    queryKey: ['crm-riwayat-tahap-selesai', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('riwayat_follow_up')
        .select('tugas_id, selesai_pada')
        .eq('entitas_tipe', 'pelanggan')
        .eq('entitas_id', id as string)
      if (error) throw error
      return new Map((data ?? []).map((r) => [r.tugas_id, r.selesai_pada as string]))
    },
    enabled: !!crm,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (error) return <PesanError error={error} />
  if (!crm) return null

  const wa = tautanWa(crm.whatsapp ?? crm.telepon)
  const alamatLengkap = kontak
    ? [kontak.alamat, kontak.kelurahan?.nama, kontak.kecamatan?.nama, kontak.kabupaten_kota?.nama, kontak.provinsi?.nama]
        .filter(Boolean)
        .join(', ')
    : ''

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/crm">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{crm.nama}</h1>
          <p className="font-mono text-xs text-muted-foreground">{crm.kode}</p>
        </div>
        <Badge variant={LABEL_SEGMEN[crm.segmen].varian}>{LABEL_SEGMEN[crm.segmen].label}</Badge>
        {wa ? (
          <Button variant="outline" size="sm" asChild>
            <a href={wa} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" />
              Chat WA
            </a>
          </Button>
        ) : null}
        <Button variant="outline" size="sm" asChild>
          <Link to={`/pelanggan/${crm.pelanggan_id}`}>
            <Pencil className="h-4 w-4" />
            Edit data
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Ringkas label="Total belanja" nilai={rupiah(crm.total_belanja)} />
        <Ringkas label="Jumlah transaksi" nilai={String(crm.jumlah_transaksi)} />
        <Ringkas label="Rata-rata belanja" nilai={rupiah(crm.rata_belanja)} />
        <Ringkas
          label="Terakhir order"
          nilai={crm.terakhir_order ? fmtTanggal(crm.terakhir_order) : '-'}
          catatan={crm.hari_sejak_order !== null ? `${crm.hari_sejak_order} hari lalu` : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kontak</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-2">
          <Info label="WhatsApp" nilai={crm.whatsapp ?? '-'} />
          <Info label="Telepon" nilai={crm.telepon ?? '-'} />
          <Info label="Email" nilai={kontak?.email ?? '-'} />
          <Info label="Pelanggan sejak" nilai={crm.pertama_order ? fmtTanggal(crm.pertama_order) : '-'} />
          <div className="sm:col-span-2">
            <Info label="Alamat" nilai={alamatLengkap || '-'} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Produk favorit</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {!favorit || favorit.length === 0 ? (
            <KondisiKosong pesan="Belum ada pembelian." />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Produk</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Nilai</Th>
                </Tr>
              </Thead>
              <Tbody>
                {favorit.map((f) => (
                  <Tr key={f.produk_id}>
                    <Td className="font-medium">
                      {f.nama_produk}
                      <span className="ml-1.5 font-mono text-xs text-muted-foreground">{f.kode_produk}</span>
                    </Td>
                    <Td className="tabular text-right">{angka(f.total_qty_dasar)}</Td>
                    <Td className="tabular text-right">{rupiah(f.total_nilai)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riwayat transaksi</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {!riwayat || riwayat.length === 0 ? (
            <KondisiKosong pesan="Belum ada faktur." />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Nomor</Th>
                  <Th>Tanggal</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status bayar</Th>
                </Tr>
              </Thead>
              <Tbody>
                {riwayat.map((f) => (
                  <Tr key={f.id}>
                    <Td className="font-mono text-xs">
                      <Link to={`/faktur-penjualan/${f.id}`} className="text-primary hover:underline">
                        {f.nomor}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{fmtTanggal(f.tanggal)}</Td>
                    <Td className="tabular text-right">{rupiah(f.total)}</Td>
                    <Td className="text-muted-foreground">
                      {tt(LABEL_BAYAR[f.status_bayar])}
                      {f.sisa > 0 ? <span className="ml-1 text-xs">({tt('sisa')} {rupiah(f.sisa)})</span> : null}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riwayat tahap Follow-Up</CardTitle>
          <p className="text-sm text-muted-foreground">
            {tt('Semua tahap treatment yang pernah muncul untuk pelanggan ini, terlepas apakah sempat ditandai selesai.')}
          </p>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {!riwayatTahap || riwayatTahap.length === 0 ? (
            <KondisiKosong pesan="Belum ada tahap FU yang tercatat untuk pelanggan ini." />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Kategori</Th>
                  <Th>Tahap</Th>
                  <Th>Muncul pertama</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {riwayatTahap.map((r) => {
                  const info = INFO_KATEGORI[r.kategori as Kategori] as (typeof INFO_KATEGORI)[Kategori] | undefined
                  const selesaiPada = tahapSelesai?.get(r.tugas_id)
                  return (
                    <Tr key={r.id}>
                      <Td>
                        <Badge variant={info?.varian ?? 'netral'}>{info?.label ?? r.kategori}</Badge>
                      </Td>
                      <Td className="font-medium">{r.label}</Td>
                      <Td className="text-muted-foreground">{fmtTanggal(r.muncul_pertama_pada)}</Td>
                      <Td>
                        {selesaiPada ? (
                          <span className="text-xs text-emerald-700 dark:text-emerald-400">{tt('Selesai')} -- {tanggalWaktu(selesaiPada)}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{tt('Belum ditandai selesai')}</span>
                        )}
                      </Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Ringkas({ label, nilai, catatan }: { label: string; nilai: string; catatan?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{tt(label)}</p>
      <p className="text-lg font-semibold tabular">{nilai}</p>
      {catatan ? <p className="text-xs text-muted-foreground">{catatan}</p> : null}
    </div>
  )
}

function Info({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{tt(label)}</p>
      <p className="text-sm font-medium">{nilai}</p>
    </div>
  )
}
