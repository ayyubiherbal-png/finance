import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Coins,
  Landmark,
  PackageSearch,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, angka, tanggalISO } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { tt } from '@/lib/i18nText'
import { useAuth } from '@/contexts/AuthContext'
import { GrafikBatang, GrafikKapsul } from '@/components/Charts'
import { cn } from '@/lib/utils'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, KondisiKosong, PesanError, Spinner } from '@/components/ui'
import { INFO_SEGMEN } from '@/pages/CrmPelanggan'
import type {
  VPenjualanHarian,
  VPengeluaranHarian,
  VStokProduk,
  VPiutangAging,
  VPelangganCrm,
  VSaldoKasBank,
  VPelangganAktifBulanan,
} from '@/types/db'

/** Pengeluaran Kas cuma boleh dibaca peran ini (lihat RLS 0046) -- kartu
 * "Laba Bersih" HARUS ikut disembunyikan untuk peran lain, karena kalau
 * tidak, angkanya akan sama persis dengan "Laba Kotor" (baris pengeluaran
 * pulang kosong lewat RLS, BUKAN error) -- terlihat seolah tidak ada
 * biaya sama sekali, padahal cuma "tidak boleh lihat". Itu lebih
 * menyesatkan daripada sekadar menyembunyikan kartunya. */
const PERAN_BOLEH_LIHAT_BIAYA = ['owner', 'admin', 'finance']

const NAMA_BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/**
 * Aksen warna per kartu -- hijau diambil dari logo Ayyubi Food, tiga lainnya
 * dari palet kategorikal skill dataviz. Kombinasi ini sudah divalidasi lolos
 * CVD-safe & normal-vision (lihat riwayat kerja) sebelum dipakai di sini.
 */
const AKSEN = {
  hijau: 'hsl(var(--chart-1))',
  biru: 'hsl(var(--chart-2))',
  ungu: 'hsl(var(--chart-3))',
  kuning: 'hsl(var(--chart-4))',
  merah: 'hsl(var(--chart-5))',
} as const

/**
 * Kartu berisi daftar. Tingginya diratakan grid dengan kartu sebelahnya,
 * jadi kalau datanya kosong isinya dipusatkan (`ISI_KOSONG`) supaya ruang
 * sisanya terlihat disengaja -- bukan seperti kartu melar yang bolong.
 */
const KARTU_LIST = 'flex flex-col'
const ISI_KOSONG = 'flex flex-1 items-center justify-center p-0'
const ISI_LIST = 'p-0 pb-2'

type PeriodeDasbor = '7' | '30' | 'bulan'

function useRingkasan(periode: PeriodeDasbor) {
  return useQuery({
    queryKey: ['dasbor', 'ringkasan', periode],
    queryFn: async () => {
      const hariIni = new Date()
      const jumlahHari = periode === '7' ? 7 : periode === 'bulan' ? hariIni.getDate() : 30
      const batasPeriode = new Date(hariIni)
      batasPeriode.setDate(batasPeriode.getDate() - (jumlahHari - 1))
      const batasDuaPeriode = new Date(batasPeriode)
      batasDuaPeriode.setDate(batasDuaPeriode.getDate() - jumlahHari)

      const bulanAwal = new Date(hariIni.getFullYear(), hariIni.getMonth() - 5, 1)

      const [penjualan, pengeluaran, stok, piutang, jatuhTempo, pelangganTeratas, saldoKas, aktifBulanan] = await Promise.all([
        supabase
          .from('v_penjualan_harian')
          .select('tanggal, jumlah_faktur, omzet, laba_kotor, hpp, retur, penjualan_bersih')
          .gte('tanggal', tanggalISO(batasDuaPeriode))
          .returns<VPenjualanHarian[]>(),
        // Peran yang tidak boleh baca pengeluaran_kas (lihat RLS 0046) akan
        // dapat baris kosong di sini, BUKAN error -- lihat komponen Dashboard
        // untuk bagaimana ini dijaga supaya tidak menampilkan Laba Bersih
        // yang menyesatkan untuk peran tersebut.
        supabase
          .from('v_pengeluaran_harian')
          .select('tanggal, jumlah_pengeluaran, total_keluar')
          .gte('tanggal', tanggalISO(batasDuaPeriode))
          .returns<VPengeluaranHarian[]>(),
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
          .gt('jumlah_transaksi', 0)
          .order('total_belanja', { ascending: false })
          .limit(5)
          .returns<Pick<VPelangganCrm, 'pelanggan_id' | 'kode' | 'nama' | 'total_belanja' | 'jumlah_transaksi' | 'segmen'>[]>(),
        supabase
          .from('v_saldo_kas_bank')
          .select('akun_id, kode, nama, jenis, saldo')
          .eq('aktif', true)
          .order('saldo', { ascending: false })
          .returns<Pick<VSaldoKasBank, 'akun_id' | 'kode' | 'nama' | 'jenis' | 'saldo'>[]>(),
        supabase
          .from('v_pelanggan_aktif_bulanan')
          .select('bulan, jumlah_pelanggan_aktif')
          .gte('bulan', tanggalISO(bulanAwal))
          .returns<VPelangganAktifBulanan[]>(),
      ])

      if (penjualan.error) throw penjualan.error
      if (pengeluaran.error) throw pengeluaran.error
      if (stok.error) throw stok.error
      if (piutang.error) throw piutang.error
      if (jatuhTempo.error) throw jatuhTempo.error
      if (pelangganTeratas.error) throw pelangganTeratas.error
      if (saldoKas.error) throw saldoKas.error
      if (aktifBulanan.error) throw aktifBulanan.error

      const semuaHari = penjualan.data ?? []
      const barisStok = stok.data ?? []
      const barisPiutang = piutang.data ?? []

      const petaHari = new Map(semuaHari.map((h) => [h.tanggal, h]))
      const isoBatasPeriode = tanggalISO(batasPeriode)

      // 30 titik harian berurutan, hari tanpa penjualan diisi 0 -- supaya
      // grafiknya benar-benar merepresentasikan waktu, bukan cuma hari yang ada transaksi.
      const trenHarian: { tanggal: string; nilai: number }[] = []
      for (let i = jumlahHari - 1; i >= 0; i--) {
        const d = new Date(hariIni)
        d.setDate(d.getDate() - i)
        const iso = tanggalISO(d)
        trenHarian.push({ tanggal: iso, nilai: Number(petaHari.get(iso)?.penjualan_bersih ?? 0) })
      }

      // 6 titik bulanan berurutan, bulan tanpa pelanggan aktif diisi 0 --
      // sama seperti trenHarian, supaya bar kosong tetap kelihatan sebagai
      // "memang nol", bukan cuma hilang dari grafik.
      const petaBulan = new Map((aktifBulanan.data ?? []).map((b) => [b.bulan, b.jumlah_pelanggan_aktif]))
      const pelangganAktifPerBulan: { label: string; nilai: number }[] = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(hariIni.getFullYear(), hariIni.getMonth() - i, 1)
        const iso = tanggalISO(d)
        pelangganAktifPerBulan.push({
          label: `${tt(NAMA_BULAN_PENDEK[d.getMonth()]!)} ${String(d.getFullYear()).slice(2)}`,
          nilai: Number(petaBulan.get(iso) ?? 0),
        })
      }

      const periodeIni = semuaHari.filter((h) => h.tanggal >= isoBatasPeriode)
      const periodeSebelum = semuaHari.filter((h) => h.tanggal < isoBatasPeriode)

      const omzet30Hari = periodeIni.reduce((t, h) => t + Number(h.penjualan_bersih ?? 0), 0)
      const laba30Hari = periodeIni.reduce((t, h) => t + Number(h.laba_kotor ?? 0), 0)
      const omzetSebelum = periodeSebelum.reduce((t, h) => t + Number(h.penjualan_bersih ?? 0), 0)
      const labaSebelum = periodeSebelum.reduce((t, h) => t + Number(h.laba_kotor ?? 0), 0)
      const pengeluaranPeriodeIni = (pengeluaran.data ?? []).filter((h) => h.tanggal >= isoBatasPeriode)
      const pengeluaranPeriodeSebelum = (pengeluaran.data ?? []).filter((h) => h.tanggal < isoBatasPeriode)
      const pengeluaran30Hari = pengeluaranPeriodeIni.reduce((t, h) => t + Number(h.total_keluar ?? 0), 0)
      const pengeluaranSebelum = pengeluaranPeriodeSebelum.reduce((t, h) => t + Number(h.total_keluar ?? 0), 0)
      const labaOperasional = laba30Hari - pengeluaran30Hari
      const labaOperasionalSebelum = labaSebelum - pengeluaranSebelum
      const deltaPersen = (nilai: number, sebelumnya: number) => sebelumnya !== 0 ? ((nilai - sebelumnya) / Math.abs(sebelumnya)) * 100 : null

      return {
        trenHarian,
        pelangganAktifPerBulan,
        omzet30Hari,
        laba30Hari,
        pengeluaran30Hari,
        labaBersih30Hari: labaOperasional,
        deltaOmzetPersen: deltaPersen(omzet30Hari, omzetSebelum),
        deltaLabaPersen: deltaPersen(laba30Hari, labaSebelum),
        deltaPengeluaranPersen: deltaPersen(pengeluaran30Hari, pengeluaranSebelum),
        deltaLabaOperasionalPersen: deltaPersen(labaOperasional, labaOperasionalSebelum),
        jumlahHari,
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
  const { profil } = useAuth()
  const [periode, setPeriode] = useState<PeriodeDasbor>('30')
  const { data, isLoading, error } = useRingkasan(periode)
  const bolehLihatBiaya = PERAN_BOLEH_LIHAT_BIAYA.includes(profil?.peran ?? '')

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
          <p className="text-sm text-muted-foreground">
            {t('dasbor.subjudulAksi')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-border bg-card p-1 shadow-sm" aria-label={t('dasbor.pilihPeriode')}>
            {(['7', '30', 'bulan'] as const).map((opsi) => (
              <button
                key={opsi}
                type="button"
                onClick={() => setPeriode(opsi)}
                className={cn('rounded-full px-3 py-1.5 text-xs font-medium transition-colors', periode === opsi ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {opsi === 'bulan' ? t('dasbor.bulanIni') : `${opsi} ${t('dasbor.hari')}`}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/laporan/omzet">{t('dasbor.lihatLaporan')}</Link>
          </Button>
        </div>
      </div>

      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('dasbor.kinerjaHari').replace('{n}', String(data.jumlahHari))}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KartuHero
          judul={t('dasbor.penjualanBersih')}
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
          delta={data.deltaLabaPersen}
          tautan="/laporan/laba-rugi"
        />
        {bolehLihatBiaya ? (
          <>
            <KartuStat
              judul={t('dasbor.bebanOperasional')}
              nilai={rupiah(data.pengeluaran30Hari)}
              warna={AKSEN.merah}
              ikon={<Coins className="h-4 w-4" />}
              delta={data.deltaPengeluaranPersen}
              deltaTerbalik
              tautan="/pengeluaran-kas"
            />
            <KartuStat
              judul={t('dasbor.labaOperasional')}
              nilai={rupiah(data.labaBersih30Hari)}
              warna={data.labaBersih30Hari < 0 ? AKSEN.merah : AKSEN.hijau}
              ikon={data.labaBersih30Hari < 0 ? <ArrowDownRight className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              bahaya={data.labaBersih30Hari < 0}
              delta={data.deltaLabaOperasionalPersen}
              tautan="/laporan/laba-rugi"
            />
          </>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('dasbor.perluTindakanHariIni')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link to="/produk" className={cn('flex min-h-12 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-accent', data.perluRestock.length > 0 && 'border-amber-500/30')}>
            <AlertTriangle className={cn('h-5 w-5', data.perluRestock.length > 0 ? 'text-amber-500' : 'text-success')} />
            <span className="flex-1 text-sm font-medium">{data.perluRestock.length > 0 ? `${data.perluRestock.length} ${t('dasbor.produkPerluRestock')}` : t('dasbor.semuaStokAman')}</span>
          </Link>
          <Link to="/faktur-penjualan" className={cn('flex min-h-12 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-accent', data.jatuhTempo.length > 0 && 'border-amber-500/30')}>
            {data.jatuhTempo.length > 0 ? <CalendarClock className="h-5 w-5 text-amber-500" /> : <CheckCircle2 className="h-5 w-5 text-success" />}
            <span className="flex-1 text-sm font-medium">{data.jatuhTempo.length > 0 ? t('dasbor.fakturPerluDitagih') : t('dasbor.tidakAdaFaktur')}</span>
          </Link>
        </div>
      </div>

      {/*
        Komposisi mengikuti referensi: chart+"pengingat" sejajar di baris
        atas, "daftar orang"+donut sejajar di baris bawah -- keduanya di
        area kiri (3/4 lebar) -- sementara Perlu Restock jadi kartu TINGGI
        di kolom kanan (sejajar dengan kedua baris kiri sekaligus, seperti
        kartu "Project" di referensi), dengan Saldo Kas & Bank di
        bawahnya (padanan "Time Tracker").

        Semua grid SENGAJA pakai stretch (default) supaya kartu dalam satu
        baris tingginya sama rata -- itu yang bikin komposisinya terlihat
        rapi seperti referensi. Pernah dicoba `items-start` supaya kartu
        sepi konten tidak melar, tapi hasilnya malah bergerigi/tidak
        sejajar. Solusi yang benar: kartunya tetap sama tinggi, tapi
        pesan "belum ada data" ditaruh di TENGAH kartu (lihat `kosongkan`
        di bawah) supaya ruang kosongnya terlihat disengaja.
      */}
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3">
          <Card className="sm:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{t('dasbor.trenPenjualanBersih')}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <GrafikKapsul data={data.trenHarian} />
            </CardContent>
          </Card>

          <Card className={cn(KARTU_LIST, 'sm:col-span-2')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-muted-foreground" />
                {t('dasbor.pelangganTeratas')}
              </CardTitle>
            </CardHeader>
            <CardContent className={data.pelangganTeratas.length === 0 ? ISI_KOSONG : ISI_LIST}>
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

        </div>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-1 flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                {t('dasbor.perluRestock')}
              </CardTitle>
            </CardHeader>
            <CardContent className={data.perluRestock.length === 0 ? ISI_KOSONG : ISI_LIST}>
              {data.perluRestock.length === 0 ? (
                <KondisiKosong pesan={t('dasbor.semuaProdukAmanStok')} />
              ) : (
                <div className="divide-y divide-border">
                  {data.perluRestock.slice(0, 5).map((p) => {
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
                  {data.perluRestock.length > 5 ? (
                    <Link
                      to="/produk"
                      className="block px-4 py-2.5 text-center text-sm font-medium text-primary transition-colors hover:bg-accent"
                    >
                      {t('dasbor.lihatSemuaRestock').replace('{n}', String(data.perluRestock.length))}
                    </Link>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('dasbor.posisiSaatIni')}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KartuStat judul={t('dasbor.kasSaatIni')} nilai={rupiah(data.totalSaldoKas)} warna={AKSEN.hijau} ikon={<Landmark className="h-4 w-4" />} tautan="/kas-bank" />
          <KartuStat judul={t('dasbor.piutangSaatIni')} nilai={rupiah(data.totalPiutang)} warna={data.piutangMacet > 0 ? AKSEN.merah : AKSEN.kuning} ikon={<Wallet className="h-4 w-4" />} catatan={data.piutangMacet > 0 ? `${rupiah(data.piutangMacet)} ${t('dasbor.lewat90Hari')}` : undefined} bahaya={data.piutangMacet > 0} tautan="/laporan/piutang" />
          <KartuStat judul={t('dasbor.persediaanSaatIni')} nilai={rupiah(data.nilaiPersediaan)} warna={AKSEN.ungu} ikon={<Boxes className="h-4 w-4" />} tautan="/stok" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-muted-foreground" />
            {t('dasbor.pelangganAktifPerBulan')}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <GrafikBatang
            data={data.pelangganAktifPerBulan}
            warna={AKSEN.biru}
            formatNilai={(n) => (bahasa === 'id' ? `${angka(n)} pelanggan` : `${angka(n)} customers`)}
          />
        </CardContent>
      </Card>
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
    <Card className="relative overflow-hidden bg-gradient-to-br from-primary to-primary-dark text-primary-dark-foreground">
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
            {Math.abs(delta).toFixed(1)}% {t('dasbor.vsPeriodeSebelumnya')}
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
  delta,
  deltaTerbalik,
  tautan,
}: {
  judul: string
  nilai: string
  warna: string
  ikon: ReactNode
  catatan?: string
  bahaya?: boolean
  delta?: number | null
  deltaTerbalik?: boolean
  tautan: string
}) {
  const { t } = useI18n()
  const deltaPositif = deltaTerbalik ? Number(delta) <= 0 : Number(delta) >= 0
  return (
    <Card className="overflow-hidden">
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
        {delta !== undefined && delta !== null ? (
          <span className={cn('mt-2 flex items-center gap-1 text-[11px] font-medium', deltaPositif ? 'text-success' : 'text-destructive')}>
            {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}% {t('dasbor.vsPeriodeSebelumnya')}
          </span>
        ) : null}
      </CardContent>
    </Card>
  )
}
