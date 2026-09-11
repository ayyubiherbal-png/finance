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
  Package,
  ShoppingCart,
  BadgeDollarSign,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah, angka, tanggalISO, tanggalWaktu } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/contexts/AuthContext'
import { GrafikKapsul } from '@/components/Charts'
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
} from '@/types/db'

/** Pengeluaran Kas cuma boleh dibaca peran ini (lihat RLS 0046) -- kartu
 * "Laba Bersih" HARUS ikut disembunyikan untuk peran lain, karena kalau
 * tidak, angkanya akan sama persis dengan "Laba Kotor" (baris pengeluaran
 * pulang kosong lewat RLS, BUKAN error) -- terlihat seolah tidak ada
 * biaya sama sekali, padahal cuma "tidak boleh lihat". Itu lebih
 * menyesatkan daripada sekadar menyembunyikan kartunya. */
const PERAN_BOLEH_LIHAT_BIAYA = ['owner', 'admin', 'finance']

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

      const [penjualan, pengeluaran, stok, piutang, hutang, jatuhTempo, pelangganTeratas, saldoKas, penjualanProduk, pesananMenunggu, pesananMarketplace, settlementItems] = await Promise.all([
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
        supabase
          .from('v_hutang_aging')
          .select('supplier_id, nama_supplier, total_hutang, umur_90_plus')
          .returns<{ supplier_id: string; nama_supplier: string; total_hutang: number; umur_90_plus: number | null }[]>(),
        // Hanya faktur yang sudah jatuh tempo. Faktur yang belum lunas tetapi
        // tanggal temponya masih di masa depan bukan tindakan untuk hari ini.
        supabase
          .from('faktur_penjualan')
          .select('id', { count: 'exact', head: true })
          .neq('status_bayar', 'lunas')
          .neq('status', 'dibatalkan')
          .lte('jatuh_tempo', tanggalISO()),
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
          .from('v_laba_baris')
          .select('produk_id, kode_produk, nama_produk, qty_dasar, omzet')
          .gte('tanggal', tanggalISO(batasPeriode))
          .returns<{ produk_id: string; kode_produk: string; nama_produk: string; qty_dasar: number; omzet: number }[]>(),
        supabase
          .from('sales_order')
          .select('id', { count: 'exact', head: true })
          .in('status', ['draf', 'menunggu']),
        supabase
          .from('pesanan_marketplace_impor')
          .select('id, faktur:faktur_id(id, status, sisa)')
          .limit(1000)
          .returns<{ id: string; faktur: { id: string; status: string; sisa: number } | null }[]>(),
        supabase
          .from('settlement_marketplace_item')
          .select('pesanan_id')
          .limit(1000)
          .returns<{ pesanan_id: string }[]>(),
      ])

      if (penjualan.error) throw penjualan.error
      if (pengeluaran.error) throw pengeluaran.error
      if (stok.error) throw stok.error
      if (piutang.error) throw piutang.error
      if (hutang.error) throw hutang.error
      if (jatuhTempo.error) throw jatuhTempo.error
      if (pelangganTeratas.error) throw pelangganTeratas.error
      if (saldoKas.error) throw saldoKas.error
      if (penjualanProduk.error) throw penjualanProduk.error
      if (pesananMenunggu.error) throw pesananMenunggu.error
      if (pesananMarketplace.error) throw pesananMarketplace.error

      const semuaHari = penjualan.data ?? []
      const barisStok = stok.data ?? []
      const barisPiutang = piutang.data ?? []
      const barisHutang = hutang.data ?? []

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

      const produkMap = new Map<string, { produk_id: string; kode: string; nama: string; qty: number; omzet: number }>()
      for (const baris of penjualanProduk.data ?? []) {
        const produk = produkMap.get(baris.produk_id) ?? { produk_id: baris.produk_id, kode: baris.kode_produk, nama: baris.nama_produk, qty: 0, omzet: 0 }
        produk.qty += Number(baris.qty_dasar ?? 0)
        produk.omzet += Number(baris.omzet ?? 0)
        produkMap.set(baris.produk_id, produk)
      }
      const produkTerlaris = [...produkMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 5)
      const settlementTersedia = !settlementItems.error
      const pesananSudahSettlement = new Set((settlementItems.data ?? []).map((x) => x.pesanan_id))
      const settlementMenunggu = (pesananMarketplace.data ?? []).filter((x) => x.faktur && x.faktur.status !== 'dibatalkan' && Number(x.faktur.sisa) > 0 && !pesananSudahSettlement.has(x.id)).length

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
        produkTerlaris,
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
        totalHutang: barisHutang.reduce((t, b) => t + Number(b.total_hutang ?? 0), 0),
        hutangMacet: barisHutang.reduce((t, b) => t + Number(b.umur_90_plus ?? 0), 0),
        perluRestock: barisStok.filter((b) => b.perlu_restock),
        jumlahJatuhTempo: jatuhTempo.count ?? 0,
        pesananMenunggu: pesananMenunggu.count ?? 0,
        settlementMenunggu,
        settlementTersedia,
        pelangganTeratas: pelangganTeratas.data ?? [],
        totalSaldoKas: (saldoKas.data ?? []).reduce((t, a) => t + Number(a.saldo), 0),
        diperbaruiPada: new Date().toISOString(),
      }
    },
  })
}

export function Dashboard() {
  const { t } = useI18n()
  const { profil } = useAuth()
  const [periode, setPeriode] = useState<PeriodeDasbor>('30')
  const { data, isLoading, error, isFetching, refetch } = useRingkasan(periode)
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
          <p className="text-sm text-muted-foreground">{t('dasbor.subjudulAksi')}</p>
          {data ? <p className="mt-1 text-xs text-muted-foreground">{t('dasbor.diperbaruiPada')} {tanggalWaktu(data.diperbaruiPada)}</p> : null}
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
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} aria-label={t('dasbor.perbaruiData')}>
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            <span className="hidden sm:inline">{t('dasbor.perbarui')}</span>
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
        <div className={cn('grid gap-3 sm:grid-cols-2', bolehLihatBiaya && data.settlementTersedia ? 'xl:grid-cols-4' : 'lg:grid-cols-3')}>
          <Link to="/produk" className={cn('flex min-h-12 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-accent', data.perluRestock.length > 0 && 'border-amber-500/30')}>
            <AlertTriangle className={cn('h-5 w-5', data.perluRestock.length > 0 ? 'text-amber-500' : 'text-success')} />
            <span className="flex-1 text-sm font-medium">{data.perluRestock.length > 0 ? `${data.perluRestock.length} ${t('dasbor.produkPerluRestock')}` : t('dasbor.semuaStokAman')}</span>
          </Link>
          <Link to="/faktur-penjualan" className={cn('flex min-h-12 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-accent', data.jumlahJatuhTempo > 0 && 'border-destructive/30')}>
            {data.jumlahJatuhTempo > 0 ? <CalendarClock className="h-5 w-5 text-destructive" /> : <CheckCircle2 className="h-5 w-5 text-success" />}
            <span className="flex-1 text-sm font-medium">{data.jumlahJatuhTempo > 0 ? t('dasbor.fakturJatuhTempo').replace('{n}', String(data.jumlahJatuhTempo)) : t('dasbor.tidakAdaJatuhTempo')}</span>
          </Link>
          <Link to="/sales-order" className={cn('flex min-h-12 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-accent', data.pesananMenunggu > 0 && 'border-amber-500/30')}>
            {data.pesananMenunggu > 0 ? <ShoppingCart className="h-5 w-5 text-amber-500" /> : <CheckCircle2 className="h-5 w-5 text-success" />}
            <span className="flex-1 text-sm font-medium">{data.pesananMenunggu > 0 ? t('dasbor.pesananMenunggu').replace('{n}', String(data.pesananMenunggu)) : t('dasbor.tidakAdaPesananMenunggu')}</span>
          </Link>
          {bolehLihatBiaya && data.settlementTersedia ? (
            <Link to="/settlement-marketplace" className={cn('flex min-h-12 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-accent', data.settlementMenunggu > 0 && 'border-amber-500/30')}>
              {data.settlementMenunggu > 0 ? <BadgeDollarSign className="h-5 w-5 text-amber-500" /> : <CheckCircle2 className="h-5 w-5 text-success" />}
              <span className="flex-1 text-sm font-medium">{data.settlementMenunggu > 0 ? t('dasbor.settlementMenunggu').replace('{n}', String(data.settlementMenunggu)) : t('dasbor.tidakAdaSettlementMenunggu')}</span>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">{t('dasbor.trenPenjualanBersih')}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0"><GrafikKapsul data={data.trenHarian} /></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-primary-dark to-[hsl(24_20%_9%)] text-primary-dark-foreground">
          <CardHeader><CardTitle className="text-base text-primary-dark-foreground">{t('dasbor.kesehatanBisnis')}</CardTitle></CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div><p className="text-xs text-primary-dark-foreground/60">{t('dasbor.marginKotor')}</p><p className="tabular text-2xl font-bold">{margin.toFixed(1)}%</p></div>
            {bolehLihatBiaya ? <div><p className="text-xs text-primary-dark-foreground/60">{t('dasbor.rasioBeban')}</p><p className="tabular text-xl font-semibold">{data.omzet30Hari > 0 ? `${((data.pengeluaran30Hari / data.omzet30Hari) * 100).toFixed(1)}%` : '—'}</p></div> : null}
            <Link to="/laporan/laba-rugi" className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25">{t('dasbor.lihatRincian')}</Link>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('dasbor.posisiSaatIni')}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KartuStat judul={t('dasbor.kasSaatIni')} nilai={rupiah(data.totalSaldoKas)} warna={AKSEN.hijau} ikon={<Landmark className="h-4 w-4" />} tautan="/kas-bank" />
          <KartuStat judul={t('dasbor.piutangSaatIni')} nilai={rupiah(data.totalPiutang)} warna={data.piutangMacet > 0 ? AKSEN.merah : AKSEN.kuning} ikon={<Wallet className="h-4 w-4" />} catatan={data.piutangMacet > 0 ? `${rupiah(data.piutangMacet)} ${t('dasbor.lewat90Hari')}` : undefined} bahaya={data.piutangMacet > 0} tautan="/laporan/piutang" />
          <KartuStat judul={t('dasbor.hutangSaatIni')} nilai={rupiah(data.totalHutang)} warna={data.hutangMacet > 0 ? AKSEN.merah : AKSEN.biru} ikon={<Coins className="h-4 w-4" />} catatan={data.hutangMacet > 0 ? `${rupiah(data.hutangMacet)} ${t('dasbor.lewat90Hari')}` : undefined} bahaya={data.hutangMacet > 0} tautan="/faktur-pembelian" />
          <KartuStat judul={t('dasbor.persediaanSaatIni')} nilai={rupiah(data.nilaiPersediaan)} warna={AKSEN.ungu} ikon={<Boxes className="h-4 w-4" />} tautan="/stok" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={KARTU_LIST}>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4 text-muted-foreground" />{t('dasbor.produkTerlaris')}</CardTitle></CardHeader>
          <CardContent className={data.produkTerlaris.length === 0 ? ISI_KOSONG : ISI_LIST}>
            {data.produkTerlaris.length === 0 ? <KondisiKosong pesan={t('dasbor.belumAdaTransaksi')} /> : <div className="divide-y divide-border">{data.produkTerlaris.map((p) => <Link key={p.produk_id} to={`/produk/${p.produk_id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary"><PackageSearch className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{p.nama}</p><p className="font-mono text-xs text-muted-foreground">{p.kode}</p></div><div className="text-right"><p className="tabular text-sm font-medium">{angka(p.qty)} {t('dasbor.terjual')}</p><p className="tabular text-xs text-muted-foreground">{rupiah(p.omzet)}</p></div></Link>)}</div>}
          </CardContent>
        </Card>
        <Card className={KARTU_LIST}>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-muted-foreground" />{t('dasbor.pelangganTeratas')}</CardTitle></CardHeader>
          <CardContent className={data.pelangganTeratas.length === 0 ? ISI_KOSONG : ISI_LIST}>
            {data.pelangganTeratas.length === 0 ? <KondisiKosong pesan={t('dasbor.belumAdaTransaksi')} /> : <div className="divide-y divide-border">{data.pelangganTeratas.map((p) => <Link key={p.pelanggan_id} to={`/crm/pelanggan/${p.pelanggan_id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{p.nama.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{p.nama}</p><p className="text-xs text-muted-foreground">{p.jumlah_transaksi}x {t('dasbor.transaksi')}</p></div><div className="flex flex-col items-end gap-1"><p className="tabular text-sm font-medium">{rupiah(p.total_belanja)}</p><Badge variant={INFO_SEGMEN[p.segmen].varian}>{INFO_SEGMEN[p.segmen].label}</Badge></div></Link>)}</div>}
          </CardContent>
        </Card>
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
