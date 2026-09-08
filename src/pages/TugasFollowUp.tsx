import { useState } from 'react'
import { Link } from 'react-router-dom'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tanggal as fmtTanggal } from '@/lib/format'
import { tautanWa } from '@/lib/whatsapp'
import { cn } from '@/lib/utils'
import { Badge, Button, Card, CardContent, KondisiKosong, PesanError, Spinner, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
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
 * sendiri" dari daftar setelah lewat waktunya -- tidak ada pencatatan
 * "sudah di-FU atau belum" di database (itu akan menambah tabel/skema
 * baru untuk MVP tahap ini). Kalau nanti dirasa perlu tombol "Tandai
 * Selesai" yang tersimpan permanen, itu langkah lanjutan, bukan bagian
 * dari cakupan sekarang.
 */
type Kategori = 'baru' | 'naik_setia' | 'naik_juara' | 'mulai_hilang' | 'tidur' | 'jadikan_pelanggan'

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

interface Tugas {
  id: string
  kategori: Kategori
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
      id: `pelanggan-${p.pelanggan_id}`,
      kategori,
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
        id: `pembeli-jadikan-${p.id}`,
        kategori: 'jadikan_pelanggan',
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
      id: `pembeli-${kategori}-${p.id}`,
      kategori,
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
  const [kategoriAktif, setKategoriAktif] = useState<Kategori | null>(null)

  const isLoading = loadingPelanggan || loadingPembeli
  const error = errorPelanggan || errorPembeli
  const semua = isLoading || error ? [] : susunTugas(pelanggan ?? [], pembeli ?? [])
  const hitungan = URUTAN_KATEGORI.map((k) => ({ kunci: k, ...INFO_KATEGORI[k], jumlah: semua.filter((t) => t.kategori === k).length }))
  const tersaring = kategoriAktif ? semua.filter((t) => t.kategori === kategoriAktif) : semua

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
                      <Td className="text-xs text-muted-foreground">{t.konteks}</Td>
                      <Td className="text-right">
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
