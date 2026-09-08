import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  ShoppingCart,
  Warehouse,
  BarChart3,
  Building2,
  Landmark,
  HeartHandshake,
  Zap,
  FileSpreadsheet,
  LogOut,
  Search,
  Bell,
  Boxes,
  Wallet,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useI18n, type KunciTerjemahan } from '@/lib/i18n'
import { cariProduk, cariPelanggan, cariSupplier } from '@/lib/queries'
import type { OpsiCombobox } from '@/components/Combobox'
import { cn } from '@/lib/utils'
import type { PeranPengguna } from '@/types/db'

/** Satu halaman. Kalau satu menu punya >1 tab, tab-nya muncul di atas isi halaman. */
interface Tab {
  ke: string
  label: KunciTerjemahan
  peran?: PeranPengguna[]
}

interface MenuItem {
  label: KunciTerjemahan
  ikon: typeof Boxes
  /**
   * Halaman-halaman yang tergabung dalam menu ini. Yang PERTAMA (yang boleh
   * dilihat perannya) jadi tujuan saat menunya diklik.
   */
  tab: Tab[]
}

interface Grup {
  judul: KunciTerjemahan
  item: MenuItem[]
}

/**
 * Menu digabung dari 25 entri jadi 9 (2026-09-07). Sebelumnya tiap halaman
 * punya barisnya sendiri di sidebar -- total butuh ~1.100px tinggi, sementara
 * layar laptop cuma menyediakan ~750px, jadi harus discroll panjang.
 *
 * Sekarang halaman yang sealur digabung jadi TAB di dalam satu menu (mis.
 * Sales Order / Surat Jalan / Faktur / Penerimaan Kas / Retur ada di bawah
 * menu "Penjualan"). URL tiap halaman SENGAJA tidak diubah sama sekali --
 * semua tautan internal, tombol "Kembali", dan halaman cetak tetap jalan;
 * tab-nya dirender di Layout berdasarkan rute yang sedang aktif.
 */
const MENU: Grup[] = [
  {
    judul: 'grup.menu',
    item: [
      { label: 'menu.dasbor', ikon: LayoutDashboard, tab: [{ ke: '/', label: 'menu.dasbor' }] },
      { label: 'menu.penjualanCepat', ikon: Zap, tab: [{ ke: '/penjualan-cepat', label: 'menu.penjualanCepat' }] },
      { label: 'menu.imporPesanan', ikon: FileSpreadsheet, tab: [{ ke: '/impor-pesanan', label: 'menu.imporPesanan' }] },
      {
        label: 'grup.penjualan',
        ikon: ShoppingCart,
        tab: [
          { ke: '/sales-order', label: 'menu.salesOrder' },
          { ke: '/surat-jalan', label: 'menu.suratJalan' },
          { ke: '/faktur-penjualan', label: 'menu.fakturPenjualan' },
          { ke: '/penerimaan-kas', label: 'menu.penerimaanKas' },
          { ke: '/retur-penjualan', label: 'menu.returPenjualan' },
        ],
      },
      {
        label: 'grup.pembelian',
        ikon: Building2,
        tab: [
          { ke: '/purchase-order', label: 'menu.purchaseOrder' },
          { ke: '/penerimaan-barang', label: 'menu.penerimaanBarang' },
          { ke: '/faktur-pembelian', label: 'menu.fakturPembelian' },
          { ke: '/pembayaran-supplier', label: 'menu.pembayaranSupplier' },
          { ke: '/retur-pembelian', label: 'menu.returPembelian' },
        ],
      },
      {
        label: 'grup.inventori',
        ikon: Warehouse,
        tab: [
          { ke: '/stok', label: 'menu.stok' },
          { ke: '/kartu-stok', label: 'menu.kartuStok' },
          { ke: '/penyesuaian-stok', label: 'menu.penyesuaianStok' },
        ],
      },
      {
        label: 'grup.kasBank',
        ikon: Landmark,
        tab: [
          { ke: '/kas-bank', label: 'menu.akunKasBank' },
          { ke: '/kartu-kas-bank', label: 'menu.kartuKasBank' },
        ],
      },
    ],
  },
  {
    judul: 'grup.lainnya',
    item: [
      {
        label: 'grup.crm',
        ikon: HeartHandshake,
        tab: [
          { ke: '/crm', label: 'menu.segmenPelanggan' },
          { ke: '/pembeli-marketplace', label: 'menu.pembeliMarketplace' },
          { ke: '/tugas-follow-up', label: 'menu.tugasFollowUp' },
        ],
      },
      {
        label: 'grup.master',
        ikon: Boxes,
        tab: [
          { ke: '/produk', label: 'menu.produk' },
          { ke: '/pelanggan', label: 'menu.pelanggan' },
          { ke: '/supplier', label: 'menu.supplier', peran: ['owner', 'admin'] },
          { ke: '/gudang', label: 'menu.gudang', peran: ['owner', 'admin'] },
        ],
      },
      {
        label: 'grup.laporan',
        ikon: BarChart3,
        tab: [
          { ke: '/laporan/omzet', label: 'menu.omzet', peran: ['owner', 'admin'] },
          { ke: '/laporan/piutang', label: 'menu.piutang' },
          { ke: '/laporan/laba', label: 'menu.labaKotor', peran: ['owner', 'admin'] },
        ],
      },
    ],
  },
]

/** Rute ini termasuk menu tsb? Dicocokkan juga ke halaman detailnya (mis. /sales-order/123). */
function didalamTab(pathname: string, t: Tab) {
  return t.ke === '/' ? pathname === '/' : pathname === t.ke || pathname.startsWith(`${t.ke}/`)
}

export function Layout() {
  const { profil, keluar } = useAuth()
  const { t } = useI18n()
  const { pathname } = useLocation()

  const bolehLihat = (x: { peran?: PeranPengguna[] }) =>
    !x.peran || (profil?.peran ? x.peran.includes(profil.peran) : false)

  /** Tab yang boleh dilihat peran ini -- menu tanpa tab tersisa disembunyikan. */
  const tabTampil = (m: MenuItem) => m.tab.filter(bolehLihat)

  // Tab bar cuma muncul di halaman DAFTAR (rute persis sama), bukan di halaman
  // detail/form seperti /sales-order/123 -- di sana sudah ada tombol Kembali
  // dan judul dokumennya sendiri, tab malah bikin ramai.
  const seksiAktif = MENU.flatMap((g) => g.item).find((m) => m.tab.some((x) => x.ke === pathname))
  const tabAktif = seksiAktif ? tabTampil(seksiAktif) : []

  return (
    // Sidebar & topbar sengaja jadi PANEL MENGAMBANG (kartu putih membulat
    // dengan jarak di sekelilingnya), bukan menempel rata ke tepi layar --
    // ini yang membedakan tampilan referensi: tiap area punya "wadah"
    // sendiri di atas latar abu-abu, bukan bidang putih tanpa batas.
    <div className="flex h-screen gap-4 overflow-hidden bg-background p-4">
      <aside className="hidden w-64 shrink-0 flex-col overflow-hidden rounded-2xl bg-card shadow-[0_2px_24px_-8px_rgba(0,0,0,0.12)] md:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <img src="/ayyubi-logo.jpeg" alt="Ayyubi Food" className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-border" />
          <span className="font-semibold">Ayyubi Finance</span>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-3">
          {MENU.map((grup) => {
            const item = grup.item.filter((m) => tabTampil(m).length > 0)
            if (item.length === 0) return null

            return (
              <div key={grup.judul}>
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(grup.judul)}
                </p>
                <ul className="space-y-0.5">
                  {item.map((m) => {
                    const tab = tabTampil(m)
                    // Tujuan klik = tab pertama yang boleh dilihat perannya
                    // (mis. sales yang tidak boleh lihat Omzet langsung mendarat di Piutang).
                    const tujuan = tab[0]!.ke
                    const aktif = m.tab.some((x) => didalamTab(pathname, x))
                    return (
                      <li key={m.label}>
                        <NavLink
                          to={tujuan}
                          className={cn(
                            'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors',
                            aktif
                              ? 'bg-primary font-medium text-primary-foreground shadow-sm'
                              : 'text-foreground/70 hover:bg-accent',
                          )}
                        >
                          <m.ikon className="h-4 w-4 shrink-0" />
                          {t(m.label)}
                        </NavLink>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        <TopBar nama={profil?.nama ?? '...'} peran={profil?.peran ?? ''} keluar={keluar} />

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl space-y-4">
            {tabAktif.length > 1 ? <TabSeksi tab={tabAktif} pathname={pathname} /> : null}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Tab seksi */

/**
 * Tab penukar halaman dalam satu menu (mis. Sales Order <-> Surat Jalan <->
 * Faktur). Sengaja NavLink biasa ke URL yang sudah ada, bukan state internal,
 * supaya tiap halaman tetap punya alamatnya sendiri (bisa di-bookmark, tombol
 * back browser tetap wajar, dan tautan dari Dasbor/notifikasi tetap valid).
 */
function TabSeksi({ tab, pathname }: { tab: Tab[]; pathname: string }) {
  const { t } = useI18n()
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-0.5">
      <div className="inline-flex gap-1 rounded-full bg-card p-1 shadow-[0_2px_24px_-8px_rgba(0,0,0,0.12)]">
        {tab.map((x) => (
          <NavLink
            key={x.ke}
            to={x.ke}
            className={cn(
              'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors',
              pathname === x.ke
                ? 'bg-primary font-medium text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(x.label)}
          </NavLink>
        ))}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- TopBar */

function TopBar({ nama, peran, keluar }: { nama: string; peran: string; keluar: () => void }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 rounded-2xl bg-card px-4 shadow-[0_2px_24px_-8px_rgba(0,0,0,0.12)] md:px-5">
      <PencarianGlobal />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <ToggleBahasa />
        <Lonceng />
        <ProfilChip nama={nama} peran={peran} onKeluar={keluar} />
      </div>
    </header>
  )
}

/* ------------------------------------------------------- Toggle bahasa */

/**
 * TAHAP 1 dwibahasa (2026-09-07): baru mengganti teks "chrome" aplikasi
 * (menu, topbar, login) -- lihat catatan panjang di lib/i18n.tsx. Dokumen
 * cetak sengaja TIDAK terpengaruh toggle ini.
 */
function ToggleBahasa() {
  const { bahasa, setBahasa } = useI18n()
  return (
    <div className="flex items-center rounded-full bg-muted/70 p-0.5 text-xs font-semibold">
      {(['id', 'en'] as const).map((b) => (
        <button
          key={b}
          type="button"
          onClick={() => setBahasa(b)}
          className={cn(
            'cursor-pointer rounded-full px-2.5 py-1 uppercase transition-colors',
            bahasa === b ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/60 hover:text-foreground',
          )}
        >
          {b}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------ Pencarian global */

interface HasilCari extends OpsiCombobox {
  tipe: 'produk' | 'pelanggan' | 'supplier'
}

const KUNCI_TIPE: Record<HasilCari['tipe'], KunciTerjemahan> = {
  produk: 'topbar.produk',
  pelanggan: 'topbar.pelanggan',
  supplier: 'topbar.supplier',
}

const RUTE_TIPE: Record<HasilCari['tipe'], string> = {
  produk: '/produk',
  pelanggan: '/pelanggan',
  supplier: '/supplier',
}

/**
 * Search bar di topbar -- BUKAN dekorasi kosong seperti template
 * kebanyakan. Mencari produk/pelanggan/supplier sungguhan (pakai fungsi
 * cari* yang sudah dipakai di form transaksi) lalu langsung navigasi ke
 * halaman detailnya.
 */
function PencarianGlobal() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [terbuka, setTerbuka] = useState(false)
  const [kueri, setKueri] = useState('')
  const [hasil, setHasil] = useState<HasilCari[]>([])
  const [memuat, setMemuat] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKlikLuar(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setTerbuka(false)
    }
    document.addEventListener('mousedown', onKlikLuar)
    return () => document.removeEventListener('mousedown', onKlikLuar)
  }, [])

  useEffect(() => {
    if (!kueri.trim()) {
      setHasil([])
      return
    }
    let batal = false
    setMemuat(true)
    const timer = setTimeout(() => {
      Promise.all([cariProduk(kueri), cariPelanggan(kueri), cariSupplier(kueri)])
        .then(([produk, pelanggan, supplier]) => {
          if (batal) return
          setHasil([
            ...produk.slice(0, 5).map((o) => ({ ...o, tipe: 'produk' as const })),
            ...pelanggan.slice(0, 5).map((o) => ({ ...o, tipe: 'pelanggan' as const })),
            ...supplier.slice(0, 5).map((o) => ({ ...o, tipe: 'supplier' as const })),
          ])
        })
        .finally(() => {
          if (!batal) setMemuat(false)
        })
    }, 250)
    return () => {
      batal = true
      clearTimeout(timer)
    }
  }, [kueri])

  function pilih(h: HasilCari) {
    setTerbuka(false)
    setKueri('')
    navigate(`${RUTE_TIPE[h.tipe]}/${h.value}`)
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={kueri}
        onChange={(e) => {
          setKueri(e.target.value)
          setTerbuka(true)
        }}
        onFocus={() => setTerbuka(true)}
        placeholder={t('topbar.cari')}
        className="h-9 w-full rounded-full border border-transparent bg-muted/70 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-input focus:bg-card focus:ring-2 focus:ring-ring"
      />

      {terbuka && kueri.trim() ? (
        <div className="absolute z-30 mt-1.5 w-full min-w-[280px] rounded-xl border border-border bg-card p-1 shadow-lg">
          {memuat ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">{t('topbar.mencari')}</p>
          ) : hasil.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">{t('topbar.tidakAdaHasil')}</p>
          ) : (
            hasil.map((h) => (
              <button
                key={`${h.tipe}-${h.value}`}
                type="button"
                onClick={() => pilih(h)}
                className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span className="truncate">
                  {h.label}
                  {h.sublabel ? <span className="ml-1.5 font-mono text-xs text-muted-foreground">{h.sublabel}</span> : null}
                </span>
                <span className="shrink-0 text-[11px] uppercase text-muted-foreground">{t(KUNCI_TIPE[h.tipe])}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------- Notifikasi */

/**
 * Hitung "hal yang perlu perhatian" dari data yang sudah ada (bukan sistem
 * notifikasi baru) -- produk perlu restock (v_stok_produk) & pelanggan
 * dengan piutang lewat jatuh tempo (v_piutang_aging). Query ringan, aman
 * dijalankan di Layout yang membungkus semua halaman.
 */
function useNotifikasi() {
  return useQuery({
    queryKey: ['layout-notifikasi'],
    queryFn: async () => {
      const [stok, piutang] = await Promise.all([
        supabase.from('v_stok_produk').select('produk_id').eq('perlu_restock', true),
        supabase.from('v_piutang_aging').select('pelanggan_id, umur_1_30, umur_31_60, umur_61_90, umur_90_plus'),
      ])
      const jumlahRestock = stok.data?.length ?? 0
      const jumlahPiutangLewat = (piutang.data ?? []).filter(
        (p) =>
          Number(p.umur_1_30 ?? 0) + Number(p.umur_31_60 ?? 0) + Number(p.umur_61_90 ?? 0) + Number(p.umur_90_plus ?? 0) > 0,
      ).length
      return { jumlahRestock, jumlahPiutangLewat }
    },
    staleTime: 60_000,
  })
}

function Lonceng() {
  const { t } = useI18n()
  const [terbuka, setTerbuka] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const { data } = useNotifikasi()
  const jumlahRestock = data?.jumlahRestock ?? 0
  const jumlahPiutangLewat = data?.jumlahPiutangLewat ?? 0
  const total = jumlahRestock + jumlahPiutangLewat

  useEffect(() => {
    function onKlikLuar(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setTerbuka(false)
    }
    document.addEventListener('mousedown', onKlikLuar)
    return () => document.removeEventListener('mousedown', onKlikLuar)
  }, [])

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setTerbuka((v) => !v)}
        className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-muted/70 text-foreground/70 transition-colors hover:bg-accent"
        aria-label={t('topbar.notifikasi')}
      >
        <Bell className="h-4 w-4" />
        {total > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {total}
          </span>
        ) : null}
      </button>

      {terbuka ? (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-border bg-card p-1.5 shadow-lg">
          <p className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('topbar.perluPerhatian')}
          </p>
          {total === 0 ? (
            <p className="px-2.5 py-3 text-center text-sm text-muted-foreground">{t('topbar.semuaAman')}</p>
          ) : (
            <>
              {jumlahRestock > 0 ? (
                <NavLink
                  to="/stok"
                  onClick={() => setTerbuka(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-accent"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
                    <Boxes className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="font-medium">{jumlahRestock}</span> {t('topbar.produkPerluRestock')}
                  </span>
                </NavLink>
              ) : null}
              {jumlahPiutangLewat > 0 ? (
                <NavLink
                  to="/laporan/piutang"
                  onClick={() => setTerbuka(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-accent"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <Wallet className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="font-medium">{jumlahPiutangLewat}</span> {t('topbar.piutangLewat')}
                  </span>
                </NavLink>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------- Profil */

function ProfilChip({ nama, peran, onKeluar }: { nama: string; peran: string; onKeluar: () => void }) {
  const { t } = useI18n()
  const [terbuka, setTerbuka] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKlikLuar(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setTerbuka(false)
    }
    document.addEventListener('mousedown', onKlikLuar)
    return () => document.removeEventListener('mousedown', onKlikLuar)
  }, [])

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setTerbuka((v) => !v)}
        className="flex cursor-pointer items-center gap-2.5 rounded-full py-1 pl-1 pr-1.5 transition-colors hover:bg-accent sm:pr-3"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {(nama || '?').slice(0, 1).toUpperCase()}
        </div>
        <div className="hidden text-left sm:block">
          <p className="truncate text-sm font-medium leading-tight">{nama}</p>
          <p className="text-xs capitalize leading-tight text-muted-foreground">{peran}</p>
        </div>
      </button>

      {terbuka ? (
        <div className="absolute right-0 z-30 mt-2 w-44 rounded-xl border border-border bg-card p-1.5 shadow-lg">
          <div className="px-2.5 py-1.5 sm:hidden">
            <p className="truncate text-sm font-medium">{nama}</p>
            <p className="text-xs capitalize text-muted-foreground">{peran}</p>
          </div>
          <button
            type="button"
            onClick={onKeluar}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            {t('topbar.keluar')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
