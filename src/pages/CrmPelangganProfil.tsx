import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { tt } from '@/lib/i18nText'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MessageCircle, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { angka, rupiah, tanggal as fmtTanggal, tanggalWaktu } from '@/lib/format'
import { tautanWa } from '@/lib/whatsapp'
import { cn } from '@/lib/utils'
import { toast } from '@/components/Toast'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  KondisiKosong,
  Label,
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
import type {
  KodeReferral,
  PoinPelanggan,
  ReferralPemakaian,
  RiwayatPoin,
  RiwayatTahapPelanggan,
  SegmenPelanggan,
  StatusBayar,
  VPelangganCrm,
  VProdukFavoritPelanggan,
} from '@/types/db'

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

  // Poin loyalitas (0040) -- saldo & riwayat cuma dibaca di sini, satu-satunya
  // jalan mengubahnya ada di RPC tukar_poin() (lihat simpanTukarPoin di bawah).
  const queryClient = useQueryClient()
  const { data: poin } = useQuery({
    queryKey: ['crm-poin', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('poin_pelanggan').select('*').eq('pelanggan_id', id as string).maybeSingle()
      if (error) throw error
      return data as PoinPelanggan | null
    },
    enabled: !!crm,
  })

  const { data: riwayatPoin } = useQuery({
    queryKey: ['crm-riwayat-poin', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('riwayat_poin')
        .select('*')
        .eq('pelanggan_id', id as string)
        .order('dibuat_pada', { ascending: false })
        .limit(20)
        .returns<RiwayatPoin[]>()
      if (error) throw error
      return data ?? []
    },
    enabled: !!crm,
  })

  // Kode referral (0041) -- kode dibuat otomatis oleh trigger saat pelanggan
  // dibuat, di sini murni dibaca + ditampilkan siapa saja yang sudah pakai.
  const { data: kodeReferral } = useQuery({
    queryKey: ['crm-kode-referral', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('kode_referral').select('*').eq('pelanggan_id', id as string).maybeSingle()
      if (error) throw error
      return data as KodeReferral | null
    },
    enabled: !!crm,
  })

  const { data: pemakaianReferral } = useQuery({
    queryKey: ['crm-referral-pemakaian', kodeReferral?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_pemakaian')
        .select('*, pelanggan_baru:pelanggan_baru_id(nama)')
        .eq('kode_referral_id', kodeReferral!.id)
        .order('dipakai_pada', { ascending: false })
      if (error) throw error
      return (data ?? []) as (ReferralPemakaian & { pelanggan_baru: { nama: string } | null })[]
    },
    enabled: !!kodeReferral,
  })

  const [formTukar, setFormTukar] = useState({ jumlah: '', alasan: '' })
  const [menukar, setMenukar] = useState(false)
  const [errorTukar, setErrorTukar] = useState<unknown>(null)

  async function simpanTukarPoin() {
    setErrorTukar(null)
    const jumlah = Number(formTukar.jumlah)
    if (!jumlah || jumlah <= 0) {
      setErrorTukar(new Error('Jumlah poin harus lebih dari 0.'))
      return
    }
    setMenukar(true)
    try {
      const { error: err } = await supabase.rpc('tukar_poin', {
        p_pelanggan_id: id as string,
        p_jumlah: jumlah,
        p_alasan: formTukar.alasan.trim(),
      })
      if (err) throw err
      toast('Poin berhasil ditukar.')
      setFormTukar({ jumlah: '', alasan: '' })
      queryClient.invalidateQueries({ queryKey: ['crm-poin', id] })
      queryClient.invalidateQueries({ queryKey: ['crm-riwayat-poin', id] })
    } catch (e) {
      setErrorTukar(e)
    } finally {
      setMenukar(false)
    }
  }

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
  const waBagikanReferral = kodeReferral
    ? tautanWa(
        crm.whatsapp ?? crm.telepon,
        `Halo ${crm.nama}, ini kode referral Anda: ${kodeReferral.kode} -- bagikan ke teman/keluarga, dapat bonus kalau mereka order pertama kali lewat kode ini!`,
      )
    : null
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

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Poin Loyalitas</CardTitle>
              <p className="text-sm text-muted-foreground">{tt('1 poin per Rp10.000 belanja, diberikan begitu faktur lunas.')}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{tt('Saldo')}</p>
              <p className="text-2xl font-bold tabular">{angka(poin?.saldo_poin ?? 0)}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3">
            <div className="space-y-1">
              <Label className="text-xs">Tukar poin</Label>
              <Input
                type="number"
                min={1}
                className="w-28"
                placeholder="Jumlah"
                value={formTukar.jumlah}
                onChange={(e) => setFormTukar((f) => ({ ...f, jumlah: e.target.value }))}
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Alasan</Label>
              <Input
                placeholder="mis. Potongan pembelian, hadiah"
                value={formTukar.alasan}
                onChange={(e) => setFormTukar((f) => ({ ...f, alasan: e.target.value }))}
              />
            </div>
            <Button size="sm" onClick={simpanTukarPoin} disabled={menukar || !formTukar.jumlah}>
              {menukar ? <Spinner className="h-3.5 w-3.5" /> : null}
              {tt('Tukar')}
            </Button>
          </div>
          {errorTukar ? <PesanError error={errorTukar} /> : null}

          {!riwayatPoin || riwayatPoin.length === 0 ? (
            <KondisiKosong pesan="Belum ada riwayat poin." />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Tanggal</Th>
                  <Th>Alasan</Th>
                  <Th className="text-right">Perubahan</Th>
                </Tr>
              </Thead>
              <Tbody>
                {riwayatPoin.map((r) => (
                  <Tr key={r.id}>
                    <Td className="text-muted-foreground">{tanggalWaktu(r.dibuat_pada)}</Td>
                    <Td>{r.alasan}</Td>
                    <Td className={cn('tabular text-right font-medium', r.perubahan > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive')}>
                      {r.perubahan > 0 ? '+' : ''}
                      {angka(r.perubahan)}
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Kode Referral</CardTitle>
              <p className="text-sm text-muted-foreground">{tt('Bagikan ke teman/keluarga -- bonus poin masuk begitu rujukannya order pertama kali.')}</p>
            </div>
            {kodeReferral ? (
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-muted px-3 py-1.5 font-mono text-sm font-semibold">{kodeReferral.kode}</span>
                {waBagikanReferral ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={waBagikanReferral} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-4 w-4" />
                      {tt('Kirim ke Pelanggan')}
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {!pemakaianReferral || pemakaianReferral.length === 0 ? (
            <KondisiKosong pesan="Belum ada yang pakai kode referral ini." />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Pelanggan Rujukan</Th>
                  <Th>Dipakai</Th>
                  <Th>Status Bonus</Th>
                </Tr>
              </Thead>
              <Tbody>
                {pemakaianReferral.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-medium">{p.pelanggan_baru?.nama ?? '-'}</Td>
                    <Td className="text-muted-foreground">{fmtTanggal(p.dipakai_pada)}</Td>
                    <Td>
                      {p.bonus_diberikan ? (
                        <Badge variant="sukses">{`+${p.bonus_poin} ${tt('poin diberikan')}`}</Badge>
                      ) : (
                        <Badge variant="netral">{tt('Menunggu order pertama')}</Badge>
                      )}
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
