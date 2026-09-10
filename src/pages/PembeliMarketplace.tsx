import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { tt } from '@/lib/i18nText'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, History, MessageCircle, RefreshCw, Search, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggal as fmtTanggal, tanggalWaktu, tanggalISO } from '@/lib/format'
import { tautanWa } from '@/lib/whatsapp'
import { toast } from '@/components/Toast'
import { cn, kutipFilterPostgrest } from '@/lib/utils'
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
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui'
import { INFO_SEGMEN } from '@/pages/CrmPelanggan'
import type { CatatanRiwayat, PembeliMarketplace as BarisPembeli, SegmenPelanggan } from '@/types/db'

const LABEL_KANAL: Record<BarisPembeli['kanal'], string> = { shopee: 'Shopee', tiktok: 'TikTok Shop' }

/** Urutan sama seperti CrmPelanggan.tsx -- "belum_pernah" tidak dipakai
 * di sini (setiap baris pasti punya minimal 1 pesanan, itu syarat
 * masuk lewat sinkronisasi). */
const SEGMEN_MP: SegmenPelanggan[] = ['juara', 'setia', 'baru', 'mulai_hilang', 'tidur']

/**
 * Logika RFM SAMA PERSIS seperti view `v_pelanggan_crm` (0019) --
 * "hari_sejak_order > 120 -> tidur; > 60 -> mulai_hilang; >=3 transaksi
 * -> juara; ..." -- cuma dihitung di frontend dari `jumlah_pesanan`/
 * `pesanan_terakhir` yang sudah tersimpan di `pembeli_marketplace`,
 * bukan lewat view database terpisah (datanya sudah di tangan lewat
 * query yang sama, tidak perlu round-trip lagi).
 */
function segmenPembeli(p: BarisPembeli): SegmenPelanggan {
  if (!p.pesanan_terakhir) return 'belum_pernah'
  const [y, m, d] = p.pesanan_terakhir.split('-').map(Number)
  const tanggal = Date.UTC(y!, m! - 1, d!)
  const now = new Date()
  const hariIni = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const hari = Math.round((hariIni - tanggal) / 86_400_000)
  if (hari > 120) return 'tidur'
  if (hari > 60) return 'mulai_hilang'
  if (p.jumlah_pesanan >= 3) return 'juara'
  if (p.jumlah_pesanan === 2) return 'setia'
  return 'baru'
}

function usePembeliMarketplace(cari: string) {
  return useQuery({
    queryKey: ['pembeli-marketplace', cari],
    queryFn: async () => {
      let q = supabase.from('pembeli_marketplace').select('*')
      if (cari.trim()) {
        const pola = kutipFilterPostgrest(`%${cari.trim()}%`)
        q = q.or(`nama.ilike.${pola},telepon.ilike.${pola},catatan.ilike.${pola}`)
      }
      const { data, error } = await q.order('pesanan_terakhir', { ascending: false }).limit(500)
      if (error) throw error
      return (data ?? []) as BarisPembeli[]
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

/** Riwayat catatan (0032) -- diisi otomatis oleh trigger tiap kali `catatan` berubah, dibaca on-demand saat toggle dibuka. */
function useCatatanRiwayat(pembeliId: string | null) {
  return useQuery({
    queryKey: ['catatan-riwayat', 'pembeli_marketplace', pembeliId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catatan_riwayat')
        .select('*, profil:dibuat_oleh(nama)')
        .eq('entitas_tipe', 'pembeli_marketplace')
        .eq('entitas_id', pembeliId as string)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as (CatatanRiwayat & { profil: { nama: string } | null })[]
    },
    enabled: !!pembeliId,
  })
}

interface FormEdit {
  nama: string
  telepon: string
  alamat: string
  catatan: string
}

/** Nama+telepon+alamat lengkap -- syarat minimal yang disepakati user sebelum bisa "Jadikan Pelanggan". */
function siapDijadikanPelanggan(p: BarisPembeli): boolean {
  return !!(p.nama?.trim() && p.telepon?.trim() && p.alamat?.trim())
}

const KOLOM_EKSPOR_PEMBELI_MP: KolomEkspor<BarisPembeli>[] = [
  { header: 'Kanal', nilai: (r) => LABEL_KANAL[r.kanal] },
  { header: 'Nama', nilai: (r) => r.nama || '-' },
  { header: 'Segmen', nilai: (r) => INFO_SEGMEN[segmenPembeli(r)].label },
  { header: 'Telepon', nilai: (r) => r.telepon || '-' },
  { header: 'Alamat', nilai: (r) => r.alamat || '-' },
  { header: 'Jml. Pesanan', nilai: (r) => r.jumlah_pesanan, rata: 'kanan' },
  { header: 'Total Belanja', nilai: (r) => r.total_belanja, format: (v) => rupiah(v as number), rata: 'kanan' },
  { header: 'Pesanan Terakhir', nilai: (r) => r.pesanan_terakhir ?? '-', format: (v) => (v && v !== '-' ? fmtTanggal(v as string) : '-') },
  { header: 'Catatan FU', nilai: (r) => r.catatan || '-' },
  { header: 'Sudah Jadi Pelanggan', nilai: (r) => (r.pelanggan_id ? 'Ya' : 'Tidak') },
]

export function PembeliMarketplace() {
  const navigate = useNavigate()
  const [cari, setCari] = useState('')
  const { data, isLoading, error, isFetching } = usePembeliMarketplace(cari)
  const queryClient = useQueryClient()
  const [segmenAktif, setSegmenAktif] = useState<SegmenPelanggan | null>(null)

  const semua = data ?? []
  const hitunganSegmen = SEGMEN_MP.map((kunci) => ({ ...INFO_SEGMEN[kunci], jumlah: semua.filter((p) => segmenPembeli(p) === kunci).length }))
  const tersaring = segmenAktif ? semua.filter((p) => segmenPembeli(p) === segmenAktif) : semua

  const [menyinkronkan, setMenyinkronkan] = useState(false)
  const [errorAksi, setErrorAksi] = useState<unknown>(null)

  const [sedangEdit, setSedangEdit] = useState<string | null>(null)
  const [formEdit, setFormEdit] = useState<FormEdit>({ nama: '', telepon: '', alamat: '', catatan: '' })
  const [menyimpan, setMenyimpan] = useState(false)
  const [riwayatTerbuka, setRiwayatTerbuka] = useState<string | null>(null)
  const { data: riwayatCatatan, isLoading: riwayatMemuat } = useCatatanRiwayat(riwayatTerbuka)

  function muatUlang() {
    queryClient.invalidateQueries({ queryKey: ['pembeli-marketplace'] })
  }

  async function sinkronkan() {
    setMenyinkronkan(true)
    setErrorAksi(null)
    try {
      const { data: jumlah, error: err } = await supabase.rpc('sinkron_pembeli_marketplace')
      if (err) throw err
      toast(tt('Sinkronisasi selesai -- {n} baris ditambah/diperbarui.').replace('{n}', String(jumlah ?? 0)))
      muatUlang()
    } catch (err) {
      setErrorAksi(err)
    } finally {
      setMenyinkronkan(false)
    }
  }

  function mulaiEdit(p: BarisPembeli) {
    setSedangEdit(p.id)
    setFormEdit({ nama: p.nama ?? '', telepon: p.telepon ?? '', alamat: p.alamat ?? '', catatan: p.catatan ?? '' })
    setErrorAksi(null)
    setRiwayatTerbuka(null)
  }

  async function simpanEdit(id: string) {
    setMenyimpan(true)
    setErrorAksi(null)
    try {
      const { error: err } = await supabase
        .from('pembeli_marketplace')
        .update({
          nama: formEdit.nama.trim() || null,
          telepon: formEdit.telepon.trim() || null,
          alamat: formEdit.alamat.trim() || null,
          catatan: formEdit.catatan.trim() || null,
          diedit_manual: true,
        })
        .eq('id', id)
      if (err) throw err
      setSedangEdit(null)
      muatUlang()
      queryClient.invalidateQueries({ queryKey: ['catatan-riwayat', 'pembeli_marketplace', id] })
    } catch (err) {
      setErrorAksi(err)
    } finally {
      setMenyimpan(false)
    }
  }

  function jadikanPelanggan(p: BarisPembeli) {
    navigate('/pelanggan/baru', {
      state: {
        dariPembeliMarketplaceId: p.id,
        nama: p.nama ?? '',
        whatsapp: p.telepon ?? '',
        alamat: p.alamat ?? '',
        sumber: p.kanal,
      },
    })
  }

  async function hapus(p: BarisPembeli) {
    const label = p.nama || p.telepon || p.kunci
    if (!window.confirm(tt('Hapus {nama} dari daftar ini? Data pesanan/Faktur asli TIDAK ikut terhapus, ini cuma daftar follow-up.').replace('{nama}', label)))
      return
    setErrorAksi(null)
    try {
      const { error: err } = await supabase.from('pembeli_marketplace').delete().eq('id', p.id)
      if (err) throw err
      muatUlang()
    } catch (err) {
      setErrorAksi(err)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Pembeli Marketplace')}</h1>
          <p className="text-sm text-muted-foreground">
            {tt('Segmentasi otomatis dari riwayat pesanan -- klik segmen untuk menyaring. Bisa diedit & dihapus bebas, tidak memengaruhi Faktur/Surat Jalan yang sudah ada.')}
          </p>
        </div>
        <TombolEkspor
          ambilData={async () => tersaring}
          kolom={KOLOM_EKSPOR_PEMBELI_MP}
          opsi={{ namaFile: `pembeli-marketplace-${tanggalISO()}`, judul: tt('Pembeli Marketplace') }}
        />
      </div>

      {semua.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {hitunganSegmen.map((s) => {
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
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Cari nama, telepon, catatan..." value={cari} onChange={(e) => setCari(e.target.value)} />
        </div>
        <Button variant="outline" onClick={sinkronkan} disabled={menyinkronkan}>
          {menyinkronkan ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          {tt('Sinkronkan dari Pesanan')}
        </Button>
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

      {semua.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {tt(
            'Catatan: 97% pembeli TikTok cuma belanja sekali (wajar untuk trafik iklan). Kalau ada "pesanan" berdekatan cuma 1-2 hari dari pembeli yang sama, itu kemungkinan besar SATU checkout yang dipecah platform jadi beberapa nomor pesanan -- bukan bukti kunjungan ulang yang asli.',
          )}
        </p>
      ) : null}

      {errorAksi ? <PesanError error={errorAksi} /> : null}

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
          ) : semua.length === 0 ? (
            <KondisiKosong pesan='Belum ada data. Klik "Sinkronkan dari Pesanan" untuk menarik pembeli dari pesanan Shopee/TikTok yang sudah diimpor.' />
          ) : tersaring.length === 0 ? (
            <KondisiKosong pesan="Tidak ada pembeli yang cocok." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th>{tt('Kanal')}</Th>
                  <Th>{tt('Nama')}</Th>
                  <Th>{tt('Segmen')}</Th>
                  <Th>{tt('Telepon')}</Th>
                  <Th>{tt('Alamat')}</Th>
                  <Th className="text-right">{tt('Jml. Pesanan')}</Th>
                  <Th className="text-right">{tt('Total Belanja')}</Th>
                  <Th>{tt('Pesanan Terakhir')}</Th>
                  <Th>{tt('Catatan FU')}</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {tersaring.map((p) => {
                  const editing = sedangEdit === p.id
                  const tautan = tautanWa(p.telepon)
                  const segmen = INFO_SEGMEN[segmenPembeli(p)]
                  return (
                    <Tr key={p.id}>
                      <Td>
                        <Badge variant="netral">{LABEL_KANAL[p.kanal]}</Badge>
                      </Td>
                      <Td className={editing ? 'min-w-[10rem]' : 'max-w-[10rem] truncate font-medium'} title={editing ? undefined : (p.nama ?? undefined)}>
                        {editing ? <Input value={formEdit.nama} onChange={(e) => setFormEdit((f) => ({ ...f, nama: e.target.value }))} placeholder="Nama asli..." /> : p.nama || '-'}
                      </Td>
                      <Td title={segmen.jelas}>
                        <Badge variant={segmen.varian}>{segmen.label}</Badge>
                      </Td>
                      <Td className={cn('font-mono text-xs', editing && 'min-w-[10rem]')}>
                        {editing ? (
                          <Input value={formEdit.telepon} onChange={(e) => setFormEdit((f) => ({ ...f, telepon: e.target.value }))} placeholder="0812..." />
                        ) : tautan ? (
                          <a href={tautan} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                            {p.telepon}
                          </a>
                        ) : (
                          p.telepon || <span className="text-muted-foreground">-</span>
                        )}
                      </Td>
                      <Td className={editing ? 'min-w-[12rem]' : 'max-w-xs truncate text-muted-foreground'} title={editing ? undefined : (p.alamat ?? undefined)}>
                        {editing ? (
                          <Input value={formEdit.alamat} onChange={(e) => setFormEdit((f) => ({ ...f, alamat: e.target.value }))} placeholder="Alamat..." />
                        ) : (
                          p.alamat || '-'
                        )}
                      </Td>
                      <Td className="tabular text-right">{p.jumlah_pesanan}</Td>
                      <Td className="tabular text-right">{rupiah(p.total_belanja)}</Td>
                      <Td className="text-muted-foreground">{p.pesanan_terakhir ? fmtTanggal(p.pesanan_terakhir) : '-'}</Td>
                      <Td className={editing ? 'min-w-[10rem]' : 'max-w-[10rem] text-muted-foreground'}>
                        {editing ? (
                          <Input value={formEdit.catatan} onChange={(e) => setFormEdit((f) => ({ ...f, catatan: e.target.value }))} placeholder="mis. sudah dihubungi..." />
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <span className="truncate" title={p.catatan ?? undefined}>
                                {p.catatan || '-'}
                              </span>
                              <button
                                type="button"
                                className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                                title={tt('Riwayat catatan')}
                                onClick={() => setRiwayatTerbuka((r) => (r === p.id ? null : p.id))}
                              >
                                <History className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {riwayatTerbuka === p.id ? (
                              <div className="w-56 max-w-[16rem] rounded-md border border-border bg-card p-2 text-xs shadow-sm">
                                {riwayatMemuat ? (
                                  <Spinner className="h-3.5 w-3.5" />
                                ) : !riwayatCatatan || riwayatCatatan.length === 0 ? (
                                  <p className="text-muted-foreground">{tt('Belum ada riwayat.')}</p>
                                ) : (
                                  <ul className="max-h-32 space-y-1.5 overflow-y-auto">
                                    {riwayatCatatan.map((r) => (
                                      <li key={r.id} className="border-b border-border/50 pb-1 last:border-0 last:pb-0">
                                        <p className="text-foreground">{r.isi}</p>
                                        <p className="text-muted-foreground">
                                          {tanggalWaktu(r.created_at)}
                                          {r.profil?.nama ? ` -- ${r.profil.nama}` : ''}
                                        </p>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </Td>
                      <Td>
                        {p.pelanggan_id ? (
                          <Link to={`/pelanggan/${p.pelanggan_id}`} className="flex items-center gap-1 whitespace-nowrap text-sm text-primary hover:underline">
                            <CheckCircle2 className="h-4 w-4" />
                            {tt('Sudah jadi Pelanggan')}
                          </Link>
                        ) : editing ? (
                          <div className="flex gap-1.5 whitespace-nowrap">
                            <Button onClick={() => simpanEdit(p.id)} disabled={menyimpan}>
                              {menyimpan ? <Spinner className="h-3.5 w-3.5" /> : null}
                              {tt('Simpan')}
                            </Button>
                            <Button variant="outline" onClick={() => setSedangEdit(null)} disabled={menyimpan}>
                              {tt('Batal')}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1.5 whitespace-nowrap">
                            {tautan ? (
                              <Button variant="outline" size="sm" asChild>
                                <a href={tautan} target="_blank" rel="noreferrer">
                                  <MessageCircle className="h-4 w-4" />
                                  {tt('Chat')}
                                </a>
                              </Button>
                            ) : null}
                            <Button variant="outline" size="sm" onClick={() => mulaiEdit(p)}>
                              {tt('Edit')}
                            </Button>
                            <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => hapus(p)}>
                              {tt('Hapus')}
                            </Button>
                            {siapDijadikanPelanggan(p) ? (
                              <Button size="sm" onClick={() => jadikanPelanggan(p)}>
                                <UserPlus className="h-4 w-4" />
                                {tt('Jadikan Pelanggan')}
                              </Button>
                            ) : null}
                          </div>
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
