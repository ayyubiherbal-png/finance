import { useState } from 'react'
import { Link } from 'react-router-dom'
import { tt } from '@/lib/i18nText'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, MessageCircle, Plus, Settings2, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tanggal as fmtTanggal } from '@/lib/format'
import { tautanWa } from '@/lib/whatsapp'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
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
  Select,
  Spinner,
  Table,
  Tbody,
  Td,
  Textarea,
  Th,
  Thead,
  Tr,
} from '@/components/ui'
import type { KategoriTreatmentFu, PembeliMarketplace, TahapanTreatmentFu, VPelangganCrm } from '@/types/db'

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
type Kategori = 'baru' | 'naik_setia' | 'naik_juara' | 'mulai_hilang' | 'tidur' | 'jadikan_pelanggan' | 'ulang_tahun'
type EntitasTipe = 'pelanggan' | 'pembeli_marketplace'

const INFO_KATEGORI: Record<Kategori, { label: string; varian: 'sukses' | 'default' | 'peringatan' | 'bahaya' | 'netral'; jelas: string }> = {
  baru: { label: 'Sapa Pembeli Baru', varian: 'default', jelas: 'Baru 1x transaksi -- saatnya menyapa & edukasi pemakaian' },
  naik_setia: { label: 'Baru Jadi Setia', varian: 'default', jelas: 'Baru saja order ke-2 -- ucapkan terima kasih' },
  naik_juara: { label: 'Baru Jadi Juara', varian: 'sukses', jelas: 'Baru saja order ke-3 -- buka jalur referral' },
  mulai_hilang: { label: 'Mulai Hilang', varian: 'peringatan', jelas: 'Baru lewat 60 hari tanpa order -- check-in ringan' },
  tidur: { label: 'Berisiko Tidur', varian: 'bahaya', jelas: 'Baru lewat 120 hari tanpa order -- coba tarik balik' },
  jadikan_pelanggan: { label: 'Siap Dijadikan Pelanggan', varian: 'netral', jelas: 'Data marketplace sudah lengkap, siap dipindah ke Master Data' },
  ulang_tahun: { label: 'Ulang Tahun', varian: 'netral', jelas: 'Hari ulang tahun pelanggan -- ucapkan & tawarkan promo (0036)' },
}
const URUTAN_KATEGORI: Kategori[] = ['jadikan_pelanggan', 'baru', 'naik_setia', 'naik_juara', 'mulai_hilang', 'tidur', 'ulang_tahun']

/**
 * Tahapan treatment (0034) -- pengganti "Aturan Jendela FU" (0033).
 * Bukan lagi SATU jendela hari per kategori, tapi SERANGKAIAN tahap
 * (H+1, H+3, H+7, dst.) dengan pesan WA masing-masing, diatur admin/
 * owner lewat panel di bawah (`PanelTahapanTreatment`). `jadikan_pelanggan`
 * sengaja TIDAK termasuk di sini -- pemicunya kelengkapan data kontak,
 * bukan jendela hari (lihat `pesanUntuk`).
 */
function useTahapanTreatment() {
  return useQuery({
    queryKey: ['tahapan-treatment-fu'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tahapan_treatment_fu').select('*').order('kategori').order('urutan').returns<TahapanTreatmentFu[]>()
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })
}

/** Kelompokkan baris flat hasil query per kategori -- urutannya sudah dari query (order by urutan). */
function kelompokTahapan(rows: TahapanTreatmentFu[] | undefined): Record<KategoriTreatmentFu, TahapanTreatmentFu[]> {
  const hasil: Record<KategoriTreatmentFu, TahapanTreatmentFu[]> = { baru: [], naik_setia: [], naik_juara: [], mulai_hilang: [], tidur: [], ulang_tahun: [] }
  for (const r of rows ?? []) hasil[r.kategori].push(r)
  return hasil
}

function diJendela(hari: number | null, min: number, max: number): boolean {
  return hari !== null && hari >= min && hari <= max
}

/** Ganti placeholder {nama} di template pesan tahap dengan nama pembeli/pelanggan. */
function renderPesan(template: string, nama: string): string {
  return template.replaceAll('{nama}', nama.trim() || 'Kak')
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
 * Kategori "ulang_tahun" (0036) beda dari 5 kategori lain -- bukan
 * hari-sejak-transaksi, tapi hari-sejak-ULANG-TAHUN-TERAKHIR (0-364,
 * berulang tiap tahun). `tahunAcuan` dipakai di `tugasId()` sebagai
 * penanda "kejadian tahun yang mana" -- sama alasannya dengan
 * `terakhir_order` di kategori mulai_hilang/tidur: ulang tahun berulang
 * tiap tahun, jadi tanpa penanda tahun, tugas tahun ini & tahun depan
 * akan dianggap kejadian yang SAMA (padahal harus bisa ditandai selesai
 * masing-masing secara independen).
 */
function hariSejakUlangTahunTerakhir(tanggalLahirISO: string): { hari: number; tahunAcuan: number } {
  const [, bulan, tanggal] = tanggalLahirISO.split('-').map(Number)
  const now = new Date()
  const hariIni = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  let tahunAcuan = now.getFullYear()
  let ulangTahunTerakhir = Date.UTC(tahunAcuan, bulan! - 1, tanggal!)
  if (ulangTahunTerakhir > hariIni) {
    tahunAcuan -= 1
    ulangTahunTerakhir = Date.UTC(tahunAcuan, bulan! - 1, tanggal!)
  }
  return { hari: Math.round((hariIni - ulangTahunTerakhir) / 86_400_000), tahunAcuan }
}

/**
 * Id deterministik per KEJADIAN tugas -- dipakai sebagai key React DAN
 * sebagai `tugas_id` di `riwayat_follow_up` (unique constraint di 0029).
 * SEJAK 0034 diikat ke `tahapanId` (bukan cuma kategori) -- satu kategori
 * sekarang bisa punya banyak tahap (H+1, H+3, dst.), jadi tahap yang mana
 * yang dipakai untuk keunikan, bukan cuma nama kategorinya. Untuk kategori
 * berbasis FREKUENSI (baru/naik_setia/naik_juara), tahap+entitas sudah
 * unik (jumlah transaksi 1/2/3 cuma terjadi sekali seumur hidup
 * pelanggan). Untuk kategori berbasis RECENCY (mulai_hilang/tidur) DAN
 * "ulang_tahun" (0036, berulang tiap tahun), satu pelanggan bisa lewat
 * itu BERKALI-KALI (order-sepi-order lagi; atau ulang tahun tahun ini
 * vs tahun depan) -- makanya diikutkan penanda kejadian yang mana
 * (tanggal transaksi terakhir, atau tahun ulang tahun).
 */
function tugasId(tipe: EntitasTipe, entitasId: string, tahapanId: string, kategori: Kategori, tanggalAcuan: string | null): string {
  const perluTanggal = kategori === 'mulai_hilang' || kategori === 'tidur' || kategori === 'ulang_tahun'
  return [tipe, tahapanId, entitasId, perluTanggal ? tanggalAcuan : null].filter(Boolean).join('-')
}

interface Tugas {
  id: string
  kategori: Kategori
  tahapanLabel: string | null
  entitasTipe: EntitasTipe
  entitasId: string
  nama: string
  sumber: string
  konteks: string
  telepon: string | null
  pesan: string
  tautanProfil: string | null
}

/** `jadikan_pelanggan` sengaja tetap satu pesan tunggal di kode -- pemicunya kelengkapan data kontak, bukan jendela hari, jadi tidak punya tahap di `tahapan_treatment_fu`. */
function pesanJadikanPelanggan(nama: string): string {
  const n = nama.trim() || 'Kak'
  return `Halo ${n}, ini dari Ayyubi Food yang kemarin order lewat marketplace. Boleh simpan kontak ini untuk order berikutnya langsung, lebih cepat & ada harga khusus.`
}

/**
 * Kategori kandidat untuk sejumlah transaksi tertentu, URUT sesuai
 * prioritas pemeriksaan -- kategori berbasis frekuensi (kalau count-nya
 * cocok) diperiksa dulu, baru recency (mulai_hilang/tidur) yang berlaku
 * apa pun jumlah transaksinya (jaring pengaman kalau pelanggan mulai
 * sepi order, terlepas dari sudah pernah di kategori mana).
 */
function kategoriKandidat(jumlahTransaksi: number): KategoriTreatmentFu[] {
  const kandidat: KategoriTreatmentFu[] = []
  if (jumlahTransaksi === 1) kandidat.push('baru')
  else if (jumlahTransaksi === 2) kandidat.push('naik_setia')
  else if (jumlahTransaksi === 3) kandidat.push('naik_juara')
  kandidat.push('mulai_hilang', 'tidur')
  return kandidat
}

/**
 * Kategori pertama (sesuai urutan prioritas) yang punya minimal satu
 * tahap aktif cocok dengan `hari` -- begitu ketemu, SEMUA tahap aktif
 * kategori itu yang cocok dikembalikan sekaligus (biar H+1 dan H+3 yang
 * kebetulan tumpang tindih jendelanya bisa muncul bareng), tapi kategori
 * lain di bawahnya tidak lagi diperiksa -- meniru perilaku `else if`
 * lama supaya satu pelanggan tidak sekaligus dianggap "Baru" DAN
 * "Mulai Hilang" di saat yang sama.
 */
function tahapanCocok(
  kandidat: KategoriTreatmentFu[],
  tahapanPerKategori: Record<KategoriTreatmentFu, TahapanTreatmentFu[]>,
  hari: number | null,
): { kategori: Kategori; tahap: TahapanTreatmentFu }[] {
  for (const kategori of kandidat) {
    const cocok = (tahapanPerKategori[kategori] ?? []).filter((t) => t.aktif && diJendela(hari, t.hari_min, t.hari_max))
    if (cocok.length > 0) return cocok.map((tahap) => ({ kategori, tahap }))
  }
  return []
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

interface PelangganUlangTahun {
  id: string
  kode: string
  nama: string
  whatsapp: string | null
  telepon: string | null
  tanggal_lahir: string
}

/**
 * Pelanggan dengan tanggal lahir terisi -- terpisah dari `usePelangganUntukTugas()`
 * (yang mensyaratkan minimal 1 transaksi) karena ulang tahun berlaku
 * apa pun riwayat transaksinya (bahkan pelanggan yang belum pernah
 * order sama sekali tetap punya ulang tahun). `pembeli_marketplace`
 * tidak punya kolom ini sama sekali (cuma `pelanggan`/Master Data),
 * jadi kategori "ulang_tahun" cuma berlaku untuk entitas tipe pelanggan.
 */
function usePelangganUlangTahun() {
  return useQuery({
    queryKey: ['tugas-fu-ulang-tahun'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pelanggan')
        .select('id, kode, nama, whatsapp, telepon, tanggal_lahir')
        .eq('aktif', true)
        .eq('akun_agregat', false)
        .not('tanggal_lahir', 'is', null)
      if (error) throw error
      return (data ?? []) as PelangganUlangTahun[]
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

function susunTugas(
  pelanggan: VPelangganCrm[],
  pembeli: PembeliMarketplace[],
  tahapanPerKategori: Record<KategoriTreatmentFu, TahapanTreatmentFu[]>,
  ulangTahun: PelangganUlangTahun[],
): Tugas[] {
  const hasil: Tugas[] = []

  for (const p of pelanggan) {
    const hari = p.hari_sejak_order
    const cocok = tahapanCocok(kategoriKandidat(p.jumlah_transaksi), tahapanPerKategori, hari)
    for (const { kategori, tahap } of cocok) {
      hasil.push({
        id: tugasId('pelanggan', p.pelanggan_id, tahap.id, kategori, p.terakhir_order),
        kategori,
        tahapanLabel: tahap.label,
        entitasTipe: 'pelanggan',
        entitasId: p.pelanggan_id,
        nama: p.nama,
        sumber: p.kode,
        konteks: `${p.jumlah_transaksi}x transaksi -- terakhir ${p.terakhir_order ? fmtTanggal(p.terakhir_order) : '-'} (${hari} hari lalu)`,
        telepon: p.whatsapp || p.telepon,
        pesan: renderPesan(tahap.pesan_template, p.nama),
        tautanProfil: `/crm/pelanggan/${p.pelanggan_id}`,
      })
    }

  }

  // "ulang_tahun" independen dari kategori RFM di atas (berlaku apa pun
  // status transaksinya, termasuk pelanggan yang belum pernah order) --
  // loop terpisah dari `pelanggan` (VPelangganCrm) di atas yang
  // mensyaratkan minimal 1 transaksi, supaya semua pelanggan aktif
  // dengan tanggal lahir terisi tetap kecek.
  for (const p of ulangTahun) {
    const { hari: hariUlangTahun, tahunAcuan } = hariSejakUlangTahunTerakhir(p.tanggal_lahir)
    const tahapUlangTahun = (tahapanPerKategori.ulang_tahun ?? []).filter((t) => t.aktif && diJendela(hariUlangTahun, t.hari_min, t.hari_max))
    for (const tahap of tahapUlangTahun) {
      hasil.push({
        id: tugasId('pelanggan', p.id, tahap.id, 'ulang_tahun', String(tahunAcuan)),
        kategori: 'ulang_tahun',
        tahapanLabel: tahap.label,
        entitasTipe: 'pelanggan',
        entitasId: p.id,
        nama: p.nama,
        sumber: p.kode,
        konteks: hariUlangTahun === 0 ? 'Ulang tahun hari ini' : `Ulang tahun ${hariUlangTahun} hari lalu`,
        telepon: p.whatsapp || p.telepon,
        pesan: renderPesan(tahap.pesan_template, p.nama),
        tautanProfil: `/crm/pelanggan/${p.id}`,
      })
    }
  }

  for (const p of pembeli) {
    if (!p.pelanggan_id && siapDijadikanPelanggan(p)) {
      hasil.push({
        id: tugasId('pembeli_marketplace', p.id, 'jadikan_pelanggan', 'jadikan_pelanggan', null),
        kategori: 'jadikan_pelanggan',
        tahapanLabel: null,
        entitasTipe: 'pembeli_marketplace',
        entitasId: p.id,
        nama: p.nama || p.kunci,
        sumber: p.kanal === 'shopee' ? 'Shopee' : 'TikTok Shop',
        konteks: `${p.jumlah_pesanan}x pesanan -- data kontak sudah lengkap`,
        telepon: p.telepon,
        pesan: pesanJadikanPelanggan(p.nama || ''),
        tautanProfil: '/pembeli-marketplace',
      })
    }

    if (!p.pesanan_terakhir) continue
    const hari = hariSejak(p.pesanan_terakhir)
    // Belum punya telepon (mayoritas pembeli TikTok, lihat 0025) -- tidak ada cara menghubungi, lewati.
    if (!p.telepon) continue

    const cocok = tahapanCocok(kategoriKandidat(p.jumlah_pesanan), tahapanPerKategori, hari)
    for (const { kategori, tahap } of cocok) {
      hasil.push({
        id: tugasId('pembeli_marketplace', p.id, tahap.id, kategori, p.pesanan_terakhir),
        kategori,
        tahapanLabel: tahap.label,
        entitasTipe: 'pembeli_marketplace',
        entitasId: p.id,
        nama: p.nama || p.kunci,
        sumber: p.kanal === 'shopee' ? 'Shopee' : 'TikTok Shop',
        konteks: `${p.jumlah_pesanan}x pesanan -- terakhir ${fmtTanggal(p.pesanan_terakhir)} (${hari} hari lalu)`,
        telepon: p.telepon,
        pesan: renderPesan(tahap.pesan_template, p.nama || ''),
        tautanProfil: '/pembeli-marketplace',
      })
    }
  }

  return hasil
}

export function TugasFollowUp() {
  const { profil } = useAuth()
  const bolehAturTreatment = profil?.peran === 'owner' || profil?.peran === 'admin'

  const { data: pelanggan, isLoading: loadingPelanggan, error: errorPelanggan } = usePelangganUntukTugas()
  const { data: pembeli, isLoading: loadingPembeli, error: errorPembeli } = usePembeliUntukTugas()
  const { data: ulangTahun } = usePelangganUlangTahun()
  const { data: sudahSelesai, isLoading: loadingSelesai } = useTugasSelesai()
  const { data: tahapan } = useTahapanTreatment()
  const queryClient = useQueryClient()
  const [kategoriAktif, setKategoriAktif] = useState<Kategori | null>(null)

  const [sedangTandai, setSedangTandai] = useState<string | null>(null)
  const [catatanTandai, setCatatanTandai] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)
  const [errorAksi, setErrorAksi] = useState<unknown>(null)
  const [pengaturanTerbuka, setPengaturanTerbuka] = useState(false)

  const tahapanPerKategori = kelompokTahapan(tahapan)
  const isLoading = loadingPelanggan || loadingPembeli || loadingSelesai
  const error = errorPelanggan || errorPembeli
  const semuaTugas = isLoading || error ? [] : susunTugas(pelanggan ?? [], pembeli ?? [], tahapanPerKategori, ulangTahun ?? [])
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Tugas Follow-Up')}</h1>
          <p className="text-sm text-muted-foreground">
            {tt('Disusun otomatis tiap hari dari riwayat transaksi -- tinggal ditinjau, klik Chat untuk kirim manual. Bukan pengiriman otomatis (lihat catatan di framework CRM).')}
          </p>
        </div>
        {bolehAturTreatment ? (
          <Button variant="outline" size="sm" onClick={() => setPengaturanTerbuka((v) => !v)}>
            <Settings2 className="h-4 w-4" />
            {tt('Tahapan Treatment')}
          </Button>
        ) : null}
      </div>

      {bolehAturTreatment && pengaturanTerbuka ? <PanelTahapanTreatment tahapan={tahapan} queryClient={queryClient} /> : null}

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
                  <Th>{tt('Tahap')}</Th>
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
                      <Td className="text-xs text-muted-foreground">{t.tahapanLabel ?? '-'}</Td>
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

const URUTAN_KATEGORI_TREATMENT: KategoriTreatmentFu[] = ['baru', 'naik_setia', 'naik_juara', 'mulai_hilang', 'tidur', 'ulang_tahun']

interface FormTahap {
  kategori: KategoriTreatmentFu
  label: string
  hari_min: number
  hari_max: number
  pesan_template: string
  urutan: number
  aktif: boolean
}

const TAHAP_KOSONG: FormTahap = { kategori: 'baru', label: '', hari_min: 0, hari_max: 0, pesan_template: '', urutan: 0, aktif: true }

/** Kelola tahapan treatment (0034) -- tambah/edit/hapus tahap H+N & pesan per kategori, admin/owner saja. */
function PanelTahapanTreatment({ tahapan, queryClient }: { tahapan: TahapanTreatmentFu[] | undefined; queryClient: ReturnType<typeof useQueryClient> }) {
  const [sedangEdit, setSedangEdit] = useState<string | null>(null)
  const [form, setForm] = useState<FormTahap>(TAHAP_KOSONG)
  const [menyimpan, setMenyimpan] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const semua = tahapan ?? []

  function ubah<K extends keyof FormTahap>(kunci: K, nilai: FormTahap[K]) {
    setForm((f) => ({ ...f, [kunci]: nilai }))
  }

  function mulaiTambah() {
    setForm(TAHAP_KOSONG)
    setError(null)
    setSedangEdit('baru')
  }

  function mulaiEdit(t: TahapanTreatmentFu) {
    setForm({ kategori: t.kategori, label: t.label, hari_min: t.hari_min, hari_max: t.hari_max, pesan_template: t.pesan_template, urutan: t.urutan, aktif: t.aktif })
    setError(null)
    setSedangEdit(t.id)
  }

  function batal() {
    setSedangEdit(null)
    setError(null)
  }

  async function simpan() {
    setError(null)
    if (!form.label.trim()) {
      setError(new Error('Label tahap wajib diisi.'))
      return
    }
    if (!form.pesan_template.trim()) {
      setError(new Error('Pesan tahap wajib diisi.'))
      return
    }
    if (form.hari_max < form.hari_min) {
      setError(new Error('Hari maksimum tidak boleh kurang dari hari minimum.'))
      return
    }
    const payload = {
      kategori: form.kategori,
      label: form.label.trim(),
      hari_min: form.hari_min,
      hari_max: form.hari_max,
      pesan_template: form.pesan_template.trim(),
      urutan: form.urutan,
      aktif: form.aktif,
    }
    setMenyimpan(true)
    try {
      if (sedangEdit === 'baru') {
        const { error: err } = await supabase.from('tahapan_treatment_fu').insert(payload)
        if (err) throw err
        toast('Tahap ditambahkan.')
      } else {
        const { error: err } = await supabase.from('tahapan_treatment_fu').update(payload).eq('id', sedangEdit)
        if (err) throw err
        toast('Tahap tersimpan.')
      }
      setSedangEdit(null)
      queryClient.invalidateQueries({ queryKey: ['tahapan-treatment-fu'] })
    } catch (err) {
      setError(err)
    } finally {
      setMenyimpan(false)
    }
  }

  async function hapus(t: TahapanTreatmentFu) {
    if (!window.confirm(`Hapus tahap "${t.label}"?`)) return
    const { error: err } = await supabase.from('tahapan_treatment_fu').delete().eq('id', t.id)
    if (err) {
      setError(err)
    } else {
      toast('Tahap dihapus.')
      queryClient.invalidateQueries({ queryKey: ['tahapan-treatment-fu'] })
    }
  }

  async function toggleAktif(t: TahapanTreatmentFu) {
    const { error: err } = await supabase.from('tahapan_treatment_fu').update({ aktif: !t.aktif }).eq('id', t.id)
    if (err) setError(err)
    else queryClient.invalidateQueries({ queryKey: ['tahapan-treatment-fu'] })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{tt('Tahapan Treatment')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {tt('Titik sentuh (H+N) dan pesan WA per kategori -- satu kategori bisa punya beberapa tahap. Cuma admin/owner yang boleh mengubah.')}
            </p>
          </div>
          {sedangEdit === null ? (
            <Button size="sm" onClick={mulaiTambah}>
              <Plus className="h-4 w-4" />
              {tt('Tambah Tahap')}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {sedangEdit === 'baru' ? (
          <FormTahapKartu form={form} ubah={ubah} onSimpan={simpan} onBatal={batal} menyimpan={menyimpan} />
        ) : null}

        {error ? <PesanError error={error} /> : null}

        {semua.length === 0 && sedangEdit !== 'baru' ? (
          <KondisiKosong pesan="Belum ada tahap treatment." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>{tt('Kategori')}</Th>
                <Th>{tt('Label')}</Th>
                <Th>{tt('Hari')}</Th>
                <Th>{tt('Pesan')}</Th>
                <Th>{tt('Aktif')}</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {semua.map((t) =>
                sedangEdit === t.id ? (
                  <FormTahapBaris key={t.id} form={form} ubah={ubah} onSimpan={simpan} onBatal={batal} menyimpan={menyimpan} />
                ) : (
                  <Tr key={t.id}>
                    <Td>
                      <Badge variant={INFO_KATEGORI[t.kategori].varian}>{tt(INFO_KATEGORI[t.kategori].label)}</Badge>
                    </Td>
                    <Td className="font-medium">{t.label}</Td>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground">
                      H+{t.hari_min}
                      {t.hari_min !== t.hari_max ? `..${t.hari_max}` : ''}
                    </Td>
                    <Td className="max-w-sm truncate text-xs text-muted-foreground" title={t.pesan_template}>
                      {t.pesan_template}
                    </Td>
                    <Td>
                      <button type="button" className="cursor-pointer" onClick={() => toggleAktif(t)}>
                        <Badge variant={t.aktif ? 'sukses' : 'netral'}>{t.aktif ? tt('Aktif') : tt('Nonaktif')}</Badge>
                      </button>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1.5 whitespace-nowrap">
                        <Button variant="outline" size="sm" onClick={() => mulaiEdit(t)}>
                          {tt('Edit')}
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => hapus(t)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ),
              )}
            </Tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

interface FormTahapProps {
  form: FormTahap
  ubah: <K extends keyof FormTahap>(kunci: K, nilai: FormTahap[K]) => void
  onSimpan: () => void
  onBatal: () => void
  menyimpan: boolean
}

/** Form "tambah tahap baru" -- kartu berdiri sendiri di atas tabel (bukan baris, karena belum ada baris tabelnya). */
function FormTahapKartu({ form, ubah, onSimpan, onBatal, menyimpan }: FormTahapProps) {
  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <IsiFormTahap form={form} ubah={ubah} />
      <div className="flex justify-end gap-1.5">
        <Button variant="outline" size="sm" onClick={onBatal} disabled={menyimpan}>
          {tt('Batal')}
        </Button>
        <Button size="sm" onClick={onSimpan} disabled={menyimpan}>
          {menyimpan ? <Spinner className="h-3.5 w-3.5" /> : null}
          {tt('Simpan')}
        </Button>
      </div>
    </div>
  )
}

/** Form edit tahap yang sudah ada -- menggantikan satu baris tabel di tempat. */
function FormTahapBaris({ form, ubah, onSimpan, onBatal, menyimpan }: FormTahapProps) {
  return (
    <Tr>
      <Td colSpan={6}>
        <div className="space-y-3 py-2">
          <IsiFormTahap form={form} ubah={ubah} />
          <div className="flex justify-end gap-1.5">
            <Button variant="outline" size="sm" onClick={onBatal} disabled={menyimpan}>
              {tt('Batal')}
            </Button>
            <Button size="sm" onClick={onSimpan} disabled={menyimpan}>
              {menyimpan ? <Spinner className="h-3.5 w-3.5" /> : null}
              {tt('Simpan')}
            </Button>
          </div>
        </div>
      </Td>
    </Tr>
  )
}

function IsiFormTahap({ form, ubah }: { form: FormTahap; ubah: FormTahapProps['ubah'] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1">
        <Label className="text-xs">{tt('Kategori')}</Label>
        <Select value={form.kategori} onChange={(e) => ubah('kategori', e.target.value as KategoriTreatmentFu)}>
          {URUTAN_KATEGORI_TREATMENT.map((k) => (
            <option key={k} value={k}>
              {INFO_KATEGORI[k].label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{tt('Label')}</Label>
        <Input placeholder="mis. Sapa H+1" value={form.label} onChange={(e) => ubah('label', e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{tt('Hari minimum')}</Label>
        <Input type="number" min={0} value={form.hari_min} onChange={(e) => ubah('hari_min', Number(e.target.value))} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{tt('Hari maksimum')}</Label>
        <Input type="number" min={0} value={form.hari_max} onChange={(e) => ubah('hari_max', Number(e.target.value))} />
      </div>
      <div className="space-y-1 sm:col-span-2 lg:col-span-3">
        <Label className="text-xs">{tt('Pesan WA')}</Label>
        <Textarea
          rows={3}
          placeholder="Gunakan {nama} untuk menyisipkan nama pembeli/pelanggan"
          value={form.pesan_template}
          onChange={(e) => ubah('pesan_template', e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
        <input type="checkbox" checked={form.aktif} onChange={(e) => ubah('aktif', e.target.checked)} className="h-4 w-4 rounded border-input" />
        {tt('Aktif')}
      </label>
    </div>
  )
}
