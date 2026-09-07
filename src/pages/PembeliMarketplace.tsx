import { useState } from 'react'
import { tt } from '@/lib/i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, tanggal as fmtTanggal } from '@/lib/format'
import { tautanWa } from '@/lib/whatsapp'
import { toast } from '@/components/Toast'
import { cn } from '@/lib/utils'
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
import type { PembeliMarketplace as BarisPembeli, SegmenPelanggan } from '@/types/db'

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
        const pola = `%${cari.trim()}%`
        q = q.or(`nama.ilike.${pola},telepon.ilike.${pola},catatan.ilike.${pola}`)
      }
      const { data, error } = await q.order('pesanan_terakhir', { ascending: false }).limit(500)
      if (error) throw error
      return (data ?? []) as BarisPembeli[]
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

interface FormEdit {
  nama: string
  alamat: string
  catatan: string
}

export function PembeliMarketplace() {
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
  const [formEdit, setFormEdit] = useState<FormEdit>({ nama: '', alamat: '', catatan: '' })
  const [menyimpan, setMenyimpan] = useState(false)

  function muatUlang() {
    queryClient.invalidateQueries({ queryKey: ['pembeli-marketplace'] })
  }

  async function sinkronkan() {
    setMenyinkronkan(true)
    setErrorAksi(null)
    try {
      const { data: jumlah, error: err } = await supabase.rpc('sinkron_pembeli_marketplace')
      if (err) throw err
      toast(`Sinkronisasi selesai -- ${jumlah ?? 0} baris ditambah/diperbarui.`)
      muatUlang()
    } catch (err) {
      setErrorAksi(err)
    } finally {
      setMenyinkronkan(false)
    }
  }

  function mulaiEdit(p: BarisPembeli) {
    setSedangEdit(p.id)
    setFormEdit({ nama: p.nama ?? '', alamat: p.alamat ?? '', catatan: p.catatan ?? '' })
    setErrorAksi(null)
  }

  async function simpanEdit(id: string) {
    setMenyimpan(true)
    setErrorAksi(null)
    try {
      const { error: err } = await supabase
        .from('pembeli_marketplace')
        .update({ nama: formEdit.nama.trim() || null, alamat: formEdit.alamat.trim() || null, catatan: formEdit.catatan.trim() || null, diedit_manual: true })
        .eq('id', id)
      if (err) throw err
      setSedangEdit(null)
      muatUlang()
    } catch (err) {
      setErrorAksi(err)
    } finally {
      setMenyimpan(false)
    }
  }

  async function hapus(p: BarisPembeli) {
    if (!window.confirm(`Hapus ${p.nama || p.telepon || p.kunci} dari daftar ini? Data pesanan/Faktur asli TIDAK ikut terhapus, ini cuma daftar follow-up.`)) return
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
            {tt('Daftar kerja untuk follow-up manual -- bukan data transaksi. Bisa diedit & dihapus bebas, tidak memengaruhi Faktur/Surat Jalan yang sudah ada.')}
          </p>
        </div>

        <div className="flex flex-1 flex-wrap justify-end gap-2 sm:flex-none">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Cari nama, telepon, catatan..." value={cari} onChange={(e) => setCari(e.target.value)} />
          </div>
          <Button variant="outline" onClick={sinkronkan} disabled={menyinkronkan}>
            {menyinkronkan ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
            {tt('Sinkronkan dari Pesanan')}
          </Button>
        </div>
      </div>

      {semua.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {hitunganSegmen.map((s) => {
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
      ) : null}

      {segmenAktif ? (
        <p className="text-sm text-muted-foreground">
          {tt('Menampilkan segmen')} <span className="font-medium text-foreground">{INFO_SEGMEN[segmenAktif].label}</span> --{' '}
          {INFO_SEGMEN[segmenAktif].jelas}.{' '}
          <button type="button" className="cursor-pointer text-primary underline" onClick={() => setSegmenAktif(null)}>
            {tt('Tampilkan semua')}
          </button>
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
                      <Td className="font-mono text-xs">
                        {tautan ? (
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
                      <Td className={editing ? 'min-w-[10rem]' : 'max-w-[10rem] truncate text-muted-foreground'} title={editing ? undefined : (p.catatan ?? undefined)}>
                        {editing ? (
                          <Input value={formEdit.catatan} onChange={(e) => setFormEdit((f) => ({ ...f, catatan: e.target.value }))} placeholder="mis. sudah dihubungi..." />
                        ) : (
                          p.catatan || '-'
                        )}
                      </Td>
                      <Td>
                        {editing ? (
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
                            <Button variant="outline" onClick={() => mulaiEdit(p)}>
                              {tt('Edit')}
                            </Button>
                            <Button variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => hapus(p)}>
                              {tt('Hapus')}
                            </Button>
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
