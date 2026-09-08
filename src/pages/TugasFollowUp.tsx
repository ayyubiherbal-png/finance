import { useState } from 'react'
import { Link } from 'react-router-dom'
import { tt } from '@/lib/i18nText'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tanggal as fmtTanggal } from '@/lib/format'
import { tautanWa } from '@/lib/whatsapp'
import { cn } from '@/lib/utils'
import { toast } from '@/components/Toast'
import { Badge, Button, Card, CardContent, Input, KondisiKosong, PesanError, Spinner, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import type { PembeliMarketplace, VPelangganCrm } from '@/types/db'

/**
 * Fase 2 dari framework CRM (lihat PDF yang dikirim ke user 2026-09-08):
 * BUKAN mengirim otomatis, tapi MENGUMPULKAN otomatis -- setiap hari
 * sistem menyusun daftar "siapa perlu di-FU hari ini" lengkap dengan draf
 * pesan, supaya tinggal ditinjau sebentar lalu klik Chat untuk kirim.
 * Pengiriman sesungguhnya tetap manual (WhatsApp biasa, bukan Business
 * API) -- itu keputusan sadar, lihat Bagian 5-6 framework yang dikirim.
 *
 * Jendela hari SENGAJA sempit (3-5 hari) supaya tugas otomatis "hilang
 * sendiri" dari daftar setelah lewat waktunya. Kalau ditandai selesai
 * lebih awal (0029, fitur #1 dari 5 yang disepakati berurutan), dicatat
 * ke `riwayat_follow_up` supaya tidak muncul lagi walau masih di dalam
 * jendela harinya -- lihat `tugasId()` untuk cara id-nya dibentuk supaya
 * unik per KEJADIAN (bukan cuma per orang, karena satu pelanggan bisa
 * lewat lebih dari satu kategori sepanjang waktu).
 */
type Kategori = 'baru' | 'naik_setia' | 'naik_juara' | 'mulai_hilang' | 'tidur' | 'jadikan_pelanggan'
type EntitasTipe = 'pelanggan' | 'pembeli_marketplace'

const INFO_KATEGORI: Record<Kategori, { label: string; varian: 'sukses' | 'default' | 'peringatan' | 'bahaya' | 'netral'; jelas: string }> = {
  baru: { label: 'Sapa Pembeli Baru', varian: 'default', jelas: 'Baru 1x transaksi -- saatnya menyapa & edukasi pemakaian' },
  naik_setia: { label: 'Baru Jadi Setia', varian: 'default', jelas: 'Baru saja order ke-2 -- ucapkan terima kasih' },
  naik_juara: { label: 'Baru Jadi Juara', varian: 'sukses', jelas: 'Baru saja order ke-3 -- buka jalur referral' },
  mulai_hilang: { label: 'Mulai Hilang', varian: 'peringatan', jelas: 'Baru lewat 60 hari tanpa order -- check-in ringan' },
  tidur: { label: 'Berisiko Tidur', varian: 'bahaya', jelas: 'Baru lewat 120 hari tanpa order -- coba tarik balik' },
  jadikan_pelanggan: { label: 'Siap Dijadikan Pelanggan', varian: 'netral', jelas: 'Data marketplace sudah lengkap, siap dipindah ke Master Data' },
}
const URUTAN_KATEGORI: Kategori[] = ['jadikan_pelanggan', 'baru', 'naik_setia', 'naik_juara', 'mulai_hilang', 'tidur']

/** Jendela hari-sejak-transaksi-terakhir per kategori -- lihat catatan di atas kenapa sempit. */
const JENDELA_BARU: [number, number] = [1, 4]
const JENDELA_NAIK_KELAS: [number, number] = [0, 3]
const JENDELA_MULAI_HILANG: [number, number] = [61, 65]
const JENDELA_TIDUR: [number, number] = [121, 125]

function diJendela(hari: number | null, [min, max]: [number, number]): boolean {
  return hari !== null && hari >= min && hari <= max
}

/** Sama persis dengan segmenPembeli() di PembeliMarketplace.tsx -- pembeli_marketplace
 * tidak punya kolom "hari sejak order" siap pakai seperti v_pelanggan_crm, jadi dihitung di sini. */
function hariSejak(tanggalISO: string): number {
  const [y, m, d] = tanggalISO.split('-').map(Number)
  const tanggal = Date.UTC(y!, m! - 1, d!)
  const now = new Date()
  const hariIni = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((hariIni - tanggal) / 86_400_000)
}

/**
 * Id deterministik per KEJADIAN tugas -- dipakai sebagai key React DAN
 * sebagai `tugas_id` di `riwayat_follow_up` (unique constraint di 0029).
 * Untuk kategori berbasis FREKUENSI (baru/naik_setia/naik_juara), jumlah
 * transaksi 1/2/3 cuma terjadi SEKALI seumur hidup pelanggan -- entitas+
 * kategori sudah unik. Untuk kategori berbasis RECENCY (mulai_hilang/
 * tidur), satu pelanggan bisa lewat itu BERKALI-KALI (order, sepi,
 * order lagi, sepi lagi) -- makanya diikutkan tanggal transaksi
 * terakhir sebagai penanda kejadian yang mana.
 */
function tugasId(tipe: EntitasTipe, entitasId: string, kategori: Kategori, tanggalAcuan: string | null): string {
  const perluTanggal = kategori === 'mulai_hilang' || kategori === 'tidur'
  return [tipe, kategori, entitasId, perluTanggal ? tanggalAcuan : null].filter(Boolean).join('-')
}

interface Tugas {
  id: string
  kategori: Kategori
  entitasTipe: EntitasTipe
  entitasId: string
  nama: string
  sumber: string
  konteks: string
  telepon: string | null
  pesan: string
  tautanProfil: string | null
}

function pesanUntuk(kategori: Kategori, nama: string): string {
  const n = nama.trim() || 'Kak'
  switch (kategori) {
    case 'baru':
      return `Halo ${n}, produknya sudah sampai? Ini cara pakainya biar hasilnya maksimal -- kalau ada pertanyaan langsung chat saya ya.`
    case 'naik_setia':
      return `Terima kasih ${n} sudah order lagi! Kebetulan ada paket hemat kalau beli 2, mau saya infokan?`
    case 'naik_juara':
      return `${n} termasuk pelanggan setia kami nih. Kalau ada teman yang butuh, ada program referral -- dan produk baru kami akan info ${n} duluan.`
    case 'mulai_hilang':
      return `Halo ${n}, sudah lama nggak order nih. Stoknya habis atau ada kendala? Kabari saya ya kalau butuh bantuan.`
    case 'tidur':
      return `Halo ${n}, kangen order dari Kakak. Ada info promo terbaru dari kami, siapa tahu ada yang cocok.`
    case 'jadikan_pelanggan':
      return `Halo ${n}, ini dari Ayyubi Food yang kemarin order lewat marketplace. Boleh simpan kontak ini untuk order berikutnya langsung, lebih cepat & ada harga khusus.`
  }
}

function siapDijadikanPelanggan(p: PembeliMarketplace): boolean {
  return !!(p.nama?.trim() && p.telepon?.trim() && p.alamat?.trim())
}

function usePelangganUntukTugas() {
  return useQuery({
    queryKey: ['tugas-fu-pelanggan'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_pelanggan_crm')
        .select('*')
        .eq('aktif', true)
        .eq('akun_agregat', false)
        .not('hari_sejak_order', 'is', null)
        .returns<VPelangganCrm[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

function usePembeliUntukTugas() {
  return useQuery({
    queryKey: ['tugas-fu-pembeli'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pembeli_marketplace').select('*').limit(1000)
      if (error) throw error
      return (data ?? []) as PembeliMarketplace[]
    },
  })
}

/** Tugas yang SUDAH ditandai selesai -- disaring keluar walau masih di dalam jendela harinya. Lihat 0029. */
function useTugasSelesai() {
  return useQuery({
    queryKey: ['tugas-fu-selesai'],
    queryFn: async () => {
      const { data, error } = await supabase.from('riwayat_follow_up').select('tugas_id')
      if (error) throw error
      return new Set((data ?? []).map((r) => r.tugas_id))
    },
  })
}

function susunTugas(pelanggan: VPelangganCrm[], pembeli: PembeliMarketplace[]): Tugas[] {
  const hasil: Tugas[] = []

  for (const p of pelanggan) {
    const hari = p.hari_sejak_order
    let kategori: Kategori | null = null
    if (p.jumlah_transaksi === 1 && diJendela(hari, JENDELA_BARU)) kategori = 'baru'
    else if (p.jumlah_transaksi === 2 && diJendela(hari, JENDELA_NAIK_KELAS)) kategori = 'naik_setia'
    else if (p.jumlah_transaksi === 3 && diJendela(hari, JENDELA_NAIK_KELAS)) kategori = 'naik_juara'
    else if (diJendela(hari, JENDELA_MULAI_HILANG)) kategori = 'mulai_hilang'
    else if (diJendela(hari, JENDELA_TIDUR)) kategori = 'tidur'
    if (!kategori) continue

    hasil.push({
      id: tugasId('pelanggan', p.pelanggan_id, kategori, p.terakhir_order),
      kategori,
      entitasTipe: 'pelanggan',
      entitasId: p.pelanggan_id,
      nama: p.nama,
      sumber: p.kode,
      konteks: `${p.jumlah_transaksi}x transaksi -- terakhir ${p.terakhir_order ? fmtTanggal(p.terakhir_order) : '-'} (${hari} hari lalu)`,
      telepon: p.whatsapp || p.telepon,
      pesan: pesanUntuk(kategori, p.nama),
      tautanProfil: `/crm/pelanggan/${p.pelanggan_id}`,
    })
  }

  for (const p of pembeli) {
    if (!p.pelanggan_id && siapDijadikanPelanggan(p)) {
      hasil.push({
        id: tugasId('pembeli_marketplace', p.id, 'jadikan_pelanggan', null),
        kategori: 'jadikan_pelanggan',
        entitasTipe: 'pembeli_marketplace',
        entitasId: p.id,
        nama: p.nama || p.kunci,
        sumber: p.kanal === 'shopee' ? 'Shopee' : 'TikTok Shop',
        konteks: `${p.jumlah_pesanan}x pesanan -- data kontak sudah lengkap`,
        telepon: p.telepon,
        pesan: pesanUntuk('jadikan_pelanggan', p.nama || ''),
        tautanProfil: '/pembeli-marketplace',
      })
    }

    if (!p.pesanan_terakhir) continue
    const hari = hariSejak(p.pesanan_terakhir)
    let kategori: Kategori | null = null
    if (p.jumlah_pesanan === 1 && diJendela(hari, JENDELA_BARU)) kategori = 'baru'
    else if (p.jumlah_pesanan === 2 && diJendela(hari, JENDELA_NAIK_KELAS)) kategori = 'naik_setia'
    else if (p.jumlah_pesanan === 3 && diJendela(hari, JENDELA_NAIK_KELAS)) kategori = 'naik_juara'
    else if (diJendela(hari, JENDELA_MULAI_HILANG)) kategori = 'mulai_hilang'
    else if (diJendela(hari, JENDELA_TIDUR)) kategori = 'tidur'
    if (!kategori) continue
    // Belum punya telepon (mayoritas pembeli TikTok, lihat 0025) -- tidak ada cara menghubungi, lewati.
    if (!p.telepon) continue

    hasil.push({
      id: tugasId('pembeli_marketplace', p.id, kategori, p.pesanan_terakhir),
      kategori,
      entitasTipe: 'pembeli_marketplace',
      entitasId: p.id,
      nama: p.nama || p.kunci,
      sumber: p.kanal === 'shopee' ? 'Shopee' : 'TikTok Shop',
      konteks: `${p.jumlah_pesanan}x pesanan -- terakhir ${fmtTanggal(p.pesanan_terakhir)} (${hari} hari lalu)`,
      telepon: p.telepon,
      pesan: pesanUntuk(kategori, p.nama || ''),
      tautanProfil: '/pembeli-marketplace',
    })
  }

  return hasil
}

export function TugasFollowUp() {
  const { data: pelanggan, isLoading: loadingPelanggan, error: errorPelanggan } = usePelangganUntukTugas()
  const { data: pembeli, isLoading: loadingPembeli, error: errorPembeli } = usePembeliUntukTugas()
  const { data: sudahSelesai, isLoading: loadingSelesai } = useTugasSelesai()
  const queryClient = useQueryClient()
  const [kategoriAktif, setKategoriAktif] = useState<Kategori | null>(null)

  const [sedangTandai, setSedangTandai] = useState<string | null>(null)
  const [catatanTandai, setCatatanTandai] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)
  const [errorAksi, setErrorAksi] = useState<unknown>(null)

  const isLoading = loadingPelanggan || loadingPembeli || loadingSelesai
  const error = errorPelanggan || errorPembeli
  const semuaTugas = isLoading || error ? [] : susunTugas(pelanggan ?? [], pembeli ?? [])
  const semua = semuaTugas.filter((t) => !sudahSelesai?.has(t.id))
  const hitungan = URUTAN_KATEGORI.map((k) => ({ kunci: k, ...INFO_KATEGORI[k], jumlah: semua.filter((t) => t.kategori === k).length }))
  const tersaring = kategoriAktif ? semua.filter((t) => t.kategori === kategoriAktif) : semua

  async function simpanSelesai(t: Tugas) {
    setMenyimpan(true)
    setErrorAksi(null)
    try {
      const { error: err } = await supabase.from('riwayat_follow_up').insert({
        tugas_id: t.id,
        kategori: t.kategori,
        entitas_tipe: t.entitasTipe,
        entitas_id: t.entitasId,
        nama: t.nama,
        catatan: catatanTandai.trim() || null,
      })
      if (err) throw err
      setSedangTandai(null)
      setCatatanTandai('')
      queryClient.invalidateQueries({ queryKey: ['tugas-fu-selesai'] })
      toast('Ditandai selesai.')
    } catch (err) {
      setErrorAksi(err)
    } finally {
      setMenyimpan(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{tt('Tugas Follow-Up')}</h1>
        <p className="text-sm text-muted-foreground">
          {tt('Disusun otomatis tiap hari dari riwayat transaksi -- tinggal ditinjau, klik Chat untuk kirim manual. Bukan pengiriman otomatis (lihat catatan di framework CRM).')}
        </p>
      </div>

      {!isLoading && !error ? (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {hitungan.map((k) => {
            const aktif = kategoriAktif === k.kunci
            return (
              <button
                key={k.kunci}
                type="button"
                title={k.jelas}
                onClick={() => setKategoriAktif(aktif ? null : k.kunci)}
                className={cn(
                  'cursor-pointer rounded-lg border p-3 text-left transition-colors',
                  aktif ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
                )}
              >
                <p className="text-xs text-muted-foreground">{tt(k.label)}</p>
                <p className="text-xl font-semibold">{k.jumlah}</p>
              </button>
            )
          })}
        </div>
      ) : null}

      {kategoriAktif ? (
        <p className="text-sm text-muted-foreground">
          {tt('Menampilkan')} <span className="font-medium text-foreground">{tt(INFO_KATEGORI[kategoriAktif].label)}</span> -- {tt(INFO_KATEGORI[kategoriAktif].jelas)}.{' '}
          <button type="button" className="cursor-pointer text-primary underline" onClick={() => setKategoriAktif(null)}>
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
            <KondisiKosong pesan="Tidak ada tugas follow-up hari ini. Cek lagi besok." />
          ) : tersaring.length === 0 ? (
            <KondisiKosong pesan="Tidak ada tugas di kategori ini." />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>{tt('Sumber')}</Th>
                  <Th>{tt('Nama')}</Th>
                  <Th>{tt('Kategori')}</Th>
                  <Th>{tt('Konteks')}</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {tersaring.map((t) => {
                  const info = INFO_KATEGORI[t.kategori]
                  const tautan = tautanWa(t.telepon, t.pesan)
                  const menandai = sedangTandai === t.id
                  return (
                    <Tr key={t.id}>
                      <Td className="text-muted-foreground">
                        {t.tautanProfil ? (
                          <Link to={t.tautanProfil} className="text-primary hover:underline">
                            {t.sumber}
                          </Link>
                        ) : (
                          t.sumber
                        )}
                      </Td>
                      <Td className="font-medium">{t.nama}</Td>
                      <Td title={tt(info.jelas)}>
                        <Badge variant={info.varian}>{tt(info.label)}</Badge>
                      </Td>
                      <Td className={cn('text-xs text-muted-foreground', menandai && 'min-w-[12rem]')}>
                        {menandai ? (
                          <Input
                            autoFocus
                            placeholder="Catatan hasil FU (opsional)..."
                            value={catatanTandai}
                            onChange={(e) => setCatatanTandai(e.target.value)}
                          />
                        ) : (
                          t.konteks
                        )}
                      </Td>
                      <Td className="text-right">
                        {menandai ? (
                          <div className="flex justify-end gap-1.5 whitespace-nowrap">
                            <Button size="sm" onClick={() => simpanSelesai(t)} disabled={menyimpan}>
                              {menyimpan ? <Spinner className="h-3.5 w-3.5" /> : null}
                              {tt('Simpan')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSedangTandai(null)
                                setCatatanTandai('')
                              }}
                              disabled={menyimpan}
                            >
                              {tt('Batal')}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1.5 whitespace-nowrap">
                            {tautan ? (
                              <Button variant="outline" size="sm" asChild>
                                <a href={tautan} target="_blank" rel="noreferrer">
                                  <MessageCircle className="h-4 w-4" />
                                  {tt('Chat')}
                                </a>
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">{tt('Tanpa nomor')}</span>
                            )}
                            <Button variant="outline" size="sm" onClick={() => setSedangTandai(t.id)}>
                              <CheckCircle2 className="h-4 w-4" />
                              {tt('Tandai Selesai')}
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
