import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  Coins,
  Landmark,
  PackageSearch,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, angka, tanggal as fmtTanggal, tanggalISO } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { GrafikDonut, GrafikKapsul } from '@/components/Charts'
import { cn } from '@/lib/utils'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, KondisiKosong, PesanError, Spinner } from '@/components/ui'
import { INFO_SEGMEN } from '@/pages/CrmPelanggan'
import type { VPenjualanHarian, VStokProduk, VPiutangAging, VPelangganCrm, VSaldoKasBank } from '@/types/db'

/**
 * Aksen warna per kartu -- hijau diambil dari logo Ayyubi Food, tiga lainnya
 * dari palet kategorikal skill dataviz. Kombinasi ini sudah divalidasi lolos
 * CVD-safe & normal-vision (lihat riwayat kerja) sebelum dipakai di sini.
 */
const AKSEN = {
  hijau: '#3F7D20',
  biru: '#2a78d6',
  ungu: '#4a3aa7',
  kuning: '#eda100',
  merah: '#d03b3b',
} as const

/** Kartu bulat + shadow lembut -- treatment lokal Dasbor (tema baru 2026-09-07),
 * belum diterapkan ke komponen Card bersama supaya halaman lain tidak ikut
 * berubah sebelum di-review. */
const GAYA_KARTU = 'rounded-2xl border-none shadow-[0_2px_24px_-8px_rgba(0,0,0,0.12)]'

function useRingkasan() {
  return useQuery({
    queryKey: ['dasbor', 'ringkasan'],
    queryFn: async () => {
      const hariIni = new Date()
      const batas30 = new Date(hariIni)
      batas30.setDate(batas30.getDate() - 29)
      const batas60 = new Date(hariIni)
      batas60.setDate(batas60.getDate() - 59)

      const [penjualan, stok, piutang, jatuhTempo, pelangganTeratas, saldoKas] = await Promise.all([
        supabase
          .from('v_penjualan_harian')
          .select('tanggal, jumlah_faktur, omzet, laba_kotor')
          .gte('tanggal', tanggalISO(batas60))
          .returns<VPenjualanHarian[]>(),
        supabase
          .from('v_stok_produk')
          .select('produk_id, kode, nama, qty, stok_min, nilai_persediaan, perlu_restock')
          .returns<Pick<VStokProduk, 'produk_id' | 'kode' | 'nama' | 'qty' | 'stok_min' | 'nilai_persediaan' | 'perlu_restock'>[]>(),
        supabase
          .from('v_piutang_aging')
          .select('pelanggan_id, nama_pelanggan, total_piutang, umur_90_plus')
          .returns<Pick<VPiutangAging, 'pelanggan_id' | 'nama_pelanggan' | 'total_piutang' | 'umur_90_plus'>[]>(),
        // 5 faktur belum lunas dengan jatuh tempo paling dekat -- pengingat "siapa
        // yang perlu ditagih duluan", pelengkap notifikasi lonceng yang cuma hitung
        // yang SUDAH lewat.
        supabase
          .from('faktur_penjualan')
          .select('id, nomor, jatuh_tempo, sisa, pelanggan:pelanggan_id(nama)')
          .neq('status_bayar', 'lunas')
          .neq('status', 'dibatalkan')
          .order('jatuh_tempo', { ascending: true })
          .limit(5)
          .returns<{ id: string; nomor: string; jatuh_tempo: string; sisa: number; pelanggan: { nama: string } | null }[]>(),
        supabase
          .from('v_pelanggan_crm')
          .select('pelanggan_id, kode, nama, total_belanja, jumlah_transaksi, segmen')
          .eq('aktif', true)
          .eq('akun_agregat', false)
          .order('total_belanja', { ascending: false })
          .limit(5)
          .returns<Pick<VPelangganCrm, 'pelanggan_id' | 'kode' | 'nama' | 'total_belanja' | 'jumlah_transaksi' | 'segmen'>[]>(),
        supabase
          .from('v_saldo_kas_bank')
          .select('akun_id, kode, nama, jenis, saldo')
          .eq('aktif', true)
          .order('saldo', { ascending: false })
          .returns<Pick<VSaldoKasBank, 'akun_id' | 'kode' | 'nama' | 'jenis' | 'saldo'>[]>(),
      ])

      if (penjualan.error) throw penjualan.error
      if (stok.error) throw stok.error
      if (piutang.error) throw piutang.error
      if (jatuhTempo.error) throw jatuhTempo.error
      if (pelangganTeratas.error) throw pelangganTeratas.error
      if (saldoKas.error) throw saldoKas.error

      const semuaHari = penjualan.data ?? []
      const barisStok = stok.data ?? []
      const barisPiutang = piutang.data ?? []

      const petaHari = new Map(semuaHari.map((h) => [h.tanggal, h]))
      const isoBatas30 = tanggalISO(batas30)

      // 30 titik harian berurutan, hari tanpa penjualan diisi 0 -- supaya
      // grafiknya benar-benar merepresentasikan waktu, bukan cuma hari yang ada transaksi.
      const trenHarian: { tanggal: string; nilai: number }[] = []
      for (let i = 29; i >= 0; i--) {
        const d = new Date(hariIni)
        d.setDate(d.getDate() - i)
        const iso = tanggalISO(d)
        trenHarian.push({ tanggal: iso, nilai: Number(petaHari.get(iso)?.omzet ?? 0) })
      }

      const periodeIni = semuaHari.filter((h) => h.tanggal >= isoBatas30)
      const periodeSebelum = semuaHari.filter((h) => h.tanggal < isoBatas30)

      const omzet30Hari = periodeIni.reduce((t, h) => t + Number(h.omzet ?? 0), 0)
      const laba30Hari = periodeIni.reduce((t, h) => t + Number(h.laba_kotor ?? 0), 0)
      const omzetSebelum = periodeSebelum.reduce((t, h) => t + Number(h.omzet ?? 0), 0)
      const deltaOmzetPersen = omzetSebelum > 0 ? ((omzet30Hari - omzetSebelum) / omzetSebelum) * 100 : null

      return {
        trenHarian,
        omzet30Hari,
        laba30Hari,
        deltaOmzetPersen,
        nilaiPersediaan: barisStok.reduce((t, b) => t + Number(b.nilai_persediaan ?? 0), 0),
        totalPiutang: barisPiutang.reduce((t, b) => t + Number(b.total_piutang ?? 0), 0),
        piutangMacet: barisPiutang.reduce((t, b) => t + Number(b.umur_90_plus ?? 0), 0),
        perluRestock: barisStok.filter((b) => b.perlu_restock),
        jatuhTempo: jatuhTempo.data ?? [],
        pelangganTeratas: pelangganTeratas.data ?? [],
        saldoKas: saldoKas.data ?? [],
        totalSaldoKas: (saldoKas.data ?? []).reduce((t, a) => t + Number(a.saldo), 0),
      }
    },
  })
}

export function Dashboard() {
  const { t, bahasa } = useI18n()
  const { data, isLoading, error } = useRingkasan()

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (error) return <PesanError error={error} />
  if (!data) return null

  const margin = data.omzet30Hari > 0 ? (data.laba30Hari / data.omzet30Hari) * 100 : 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('dasbor.judul')}</h1>
          <p className="text-sm text-muted-foreground">{t('dasbor.subjudul')}</p>
        </div>
        <Button variant="pill" size="sm" asChild>
          <Link to="/laporan/omzet">
            <TrendingUp className="h-4 w-4" />
            {t('dasbor.lihatLaporanOmzet')}
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KartuHero
          judul={t('dasbor.omzet30Hari')}
          nilai={rupiah(data.omzet30Hari)}
          ikon={<TrendingUp className="h-4 w-4" />}
          delta={data.deltaOmzetPersen}
          tautan="/laporan/omzet"
        />
        <KartuStat
          judul={t('dasbor.labaKotor')}
          nilai={rupiah(data.laba30Hari)}
          warna={AKSEN.biru}
          ikon={<Coins className="h-4 w-4" />}
          catatan={`${t('dasbor.margin')} ${margin.toFixed(1)}%`}
          tautan="/laporan/laba"
        />
        <KartuStat
          judul={t('dasbor.nilaiPersediaan')}
          nilai={rupiah(data.nilaiPersediaan)}
          warna={AKSEN.ungu}
          ikon={<Boxes className="h-4 w-4" />}
          tautan="/stok"
        />
        <KartuStat
          judul={t('dasbor.piutangBerjalan')}
          nilai={rupiah(data.totalPiutang)}
          warna={data.piutangMacet > 0 ? AKSEN.merah : AKSEN.kuning}
          ikon={<Wallet className="h-4 w-4" />}
          catatan={data.piutangMacet > 0 ? `${rupiah(data.piutangMacet)} ${t('dasbor.lewat90Hari')}` : undefined}
          bahaya={data.piutangMacet > 0}
          tautan="/laporan/piutang"
        />
      </div>

      {/*
        Komposisi mengikuti referensi: chart+"pengingat" sejajar di baris
        atas, "daftar orang"+donut sejajar di baris bawah -- keduanya di
        area kiri (3/4 lebar) -- sementara Perlu Restock jadi kartu TINGGI
        di kolom kanan (sejajar dengan kedua baris kiri sekaligus, seperti
        kartu "Project" di referensi), dengan Saldo Kas & Bank di
        bawahnya (padanan "Time Tracker"). `items-stretch` (default grid)
        yang membuat kolom kanan otomatis setinggi kolom kiri.
      */}
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="grid gap-4 sm:grid-cols-3 lg:col-span-3">
          <Card className={cn(GAYA_KARTU, 'sm:col-span-2')}>
            <CardHeader>
              <CardTitle className="text-base">{t('dasbor.trenOmzetHarian')}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <GrafikKapsul data={data.trenHarian} />
            </CardContent>
          </Card>

          <Card className={GAYA_KARTU}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                {t('dasbor.jatuhTempoTerdekat')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              {data.jatuhTempo.length === 0 ? (
                <KondisiKosong pesan={t('dasbor.tidakAdaFakturBelumLunas')} />
              ) : (
                <div className="divide-y divide-border">
                  {data.jatuhTempo.map((f) => {
                    const lewat = f.jatuh_tempo < tanggalISO()
                    return (
                      <Link
                        key={f.id}
                        to={`/faktur-penjualan/${f.id}`}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{f.pelanggan?.nama ?? '-'}</p>
                          <p className="font-mono text-xs text-muted-foreground">{f.nomor}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="tabular text-sm font-medium">{rupiah(f.sisa)}</p>
                          <p className={cn('text-xs', lewat ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                            {lewat ? `${t('dasbor.lewat')} ` : ''}
                            {fmtTanggal(f.jatuh_tempo)}
                          </p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={cn(GAYA_KARTU, 'sm:col-span-2')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-muted-foreground" />
                {t('dasbor.pelangganTeratas')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              {data.pelangganTeratas.length === 0 ? (
                <KondisiKosong pesan={t('dasbor.belumAdaTransaksi')} />
              ) : (
                <div className="divide-y divide-border">
                  {data.pelangganTeratas.map((p) => (
                    <Link
                      key={p.pelanggan_id}
                      to={`/crm/pelanggan/${p.pelanggan_id}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {p.nama.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.nama}</p>
                        <p className="text-xs text-muted-foreground">
                          {bahasa === 'id' ? `${p.jumlah_transaksi}x transaksi` : `${p.jumlah_transaksi} transactions`}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <p className="tabular text-sm font-medium">{rupiah(p.total_belanja)}</p>
                        <Badge variant={INFO_SEGMEN[p.segmen].varian}>{INFO_SEGMEN[p.segmen].label}</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={GAYA_KARTU}>
            <CardHeader>
              <CardTitle className="text-base">{t('dasbor.marginLaba30Hari')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3 pt-0">
              <GrafikDonut persen={margin} warna="hsl(var(--primary))" />
              <div className="flex w-full justify-around text-center text-xs">
                <div>
                  <p className="tabular font-semibold">{rupiah(data.laba30Hari)}</p>
                  <p className="text-muted-foreground">{t('dasbor.labaKotor')}</p>
                </div>
                <div>
                  <p className="tabular font-semibold">{rupiah(data.omzet30Hari)}</p>
                  <p className="text-muted-foreground">{t('dasbor.omzet')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className={cn(GAYA_KARTU, 'flex flex-1 flex-col')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                {t('dasbor.perluRestock')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              {data.perluRestock.length === 0 ? (
                <KondisiKosong pesan={t('dasbor.semuaProdukAmanStok')} />
              ) : (
                <div className="divide-y divide-border">
                  {data.perluRestock.map((p) => {
                    const habis = Number(p.qty) <= 0
                    return (
                      <Link
                        key={p.produk_id}
                        to={`/produk/${p.produk_id}`}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent"
                      >
                        <div
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                            habis ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-600',
                          )}
                        >
                          <PackageSearch className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{p.nama}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {angka(p.qty)} / min. {angka(p.stok_min)}
                          </p>
                        </div>
                        <Badge variant={habis ? 'bahaya' : 'peringatan'} className="shrink-0">
                          {habis ? t('dasbor.habis') : t('dasbor.menipis')}
                        </Badge>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={cn(GAYA_KARTU, 'border-none bg-gradient-to-br from-primary-dark to-[hsl(24_20%_9%)] text-primary-dark-foreground')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-primary-dark-foreground">
                <Landmark className="h-4 w-4" />
                {t('dasbor.saldoKasBank')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="tabular text-2xl font-bold">{rupiah(data.totalSaldoKas)}</p>
              <p className="text-xs text-primary-dark-foreground/60">
                {bahasa === 'id'
                  ? `Total ${data.saldoKas.length} akun aktif`
                  : `Total of ${data.saldoKas.length} active accounts`}
              </p>
              <div className="mt-3 space-y-1.5">
                {data.saldoKas.slice(0, 4).map((a) => (
                  <div key={a.akun_id} className="flex items-center justify-between text-xs">
                    <span className="truncate text-primary-dark-foreground/80">{a.nama}</span>
                    <span className="tabular shrink-0 pl-2 font-medium">{rupiah(a.saldo)}</span>
                  </div>
                ))}
              </div>
              <Link
                to="/kas-bank"
                className="mt-3 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-medium transition-colors hover:bg-white/25"
              >
                {t('dasbor.lihatSemuaAkun')}
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

/** Kartu hero -- gradasi hijau tua, dipakai untuk SATU metrik utama (Omzet). */
function KartuHero({
  judul,
  nilai,
  ikon,
  delta,
  tautan,
}: {
  judul: string
  nilai: string
  ikon: ReactNode
  delta?: number | null
  tautan: string
}) {
  const { t } = useI18n()
  return (
    <Card className={cn(GAYA_KARTU, 'relative overflow-hidden border-none bg-gradient-to-br from-primary to-primary-dark text-primary-dark-foreground')}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-primary-dark-foreground/70">{judul}</p>
          <Link
            to={tautan}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-primary-dark-foreground transition-colors hover:bg-white/25"
          >
            {ikon}
          </Link>
        </div>
        <p className="tabular mt-2 text-2xl font-bold">{nilai}</p>
        {delta !== undefined && delta !== null ? (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium">
            {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}% {t('dasbor.vs30HariSebelumnya')}
          </span>
        ) : null}
      </CardContent>
    </Card>
  )
}

function KartuStat({
  judul,
  nilai,
  warna,
  ikon,
  catatan,
  bahaya,
  tautan,
}: {
  judul: string
  nilai: string
  warna: string
  ikon: ReactNode
  catatan?: string
  bahaya?: boolean
  tautan: string
}) {
  return (
    <Card className={cn(GAYA_KARTU, 'overflow-hidden')}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{judul}</p>
          <Link
            to={tautan}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80"
            style={{ backgroundColor: `${warna}1f`, color: warna }}
          >
            {ikon}
          </Link>
        </div>
        <p className="tabular mt-2 text-2xl font-semibold">{nilai}</p>
        {catatan ? (
          <span className={cn('mt-2 inline-block text-xs', bahaya ? 'text-destructive' : 'text-muted-foreground')}>{catatan}</span>
        ) : null}
      </CardContent>
    </Card>
  )
}
