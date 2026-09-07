import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Package,
  Users,
  Truck,
  ShoppingCart,
  Receipt,
  Wallet,
  Warehouse,
  BarChart3,
  Building2,
  Undo2,
  ClipboardEdit,
  Landmark,
  HeartHandshake,
  Zap,
  LogOut,
  Search,
  Bell,
  Boxes,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useI18n, type KunciTerjemahan } from '@/lib/i18n'
import { cariProduk, cariPelanggan, cariSupplier } from '@/lib/queries'
import type { OpsiCombobox } from '@/components/Combobox'
import { cn } from '@/lib/utils'
import type { PeranPengguna } from '@/types/db'

interface MenuItem {
  ke: string
  label: KunciTerjemahan
  ikon: typeof Package
  peran?: PeranPengguna[]
}

interface Grup {
  judul: KunciTerjemahan
  item: MenuItem[]
}

const MENU: Grup[] = [
  {
    judul: 'grup.ringkasan',
    item: [{ ke: '/', label: 'menu.dasbor', ikon: LayoutDashboard }],
  },
  {
    judul: 'grup.penjualan',
    item: [
      { ke: '/penjualan-cepat', label: 'menu.penjualanCepat', ikon: Zap },
      { ke: '/sales-order', label: 'menu.salesOrder', ikon: ShoppingCart },
      { ke: '/surat-jalan', label: 'menu.suratJalan', ikon: Truck },
      { ke: '/faktur-penjualan', label: 'menu.fakturPenjualan', ikon: Receipt },
      { ke: '/penerimaan-kas', label: 'menu.penerimaanKas', ikon: Wallet },
      { ke: '/retur-penjualan', label: 'menu.returPenjualan', ikon: Undo2 },
    ],
  },
  {
    judul: 'grup.pembelian',
    item: [
      { ke: '/purchase-order', label: 'menu.purchaseOrder', ikon: ShoppingCart },
      { ke: '/penerimaan-barang', label: 'menu.penerimaanBarang', ikon: Warehouse },
      { ke: '/faktur-pembelian', label: 'menu.fakturPembelian', ikon: Receipt },
      { ke: '/pembayaran-supplier', label: 'menu.pembayaranSupplier', ikon: Wallet },
      { ke: '/retur-pembelian', label: 'menu.returPembelian', ikon: Undo2 },
    ],
  },
  {
    judul: 'grup.kasBank',
    item: [
      { ke: '/kas-bank', label: 'menu.akunKasBank', ikon: Landmark },
      { ke: '/kartu-kas-bank', label: 'menu.kartuKasBank', ikon: BarChart3 },
    ],
  },
  {
    judul: 'grup.inventori',
    item: [
      { ke: '/stok', label: 'menu.stok', ikon: Warehouse },
      { ke: '/kartu-stok', label: 'menu.kartuStok', ikon: BarChart3 },
      { ke: '/penyesuaian-stok', label: 'menu.penyesuaianStok', ikon: ClipboardEdit },
    ],
  },
  {
    judul: 'grup.crm',
    item: [{ ke: '/crm', label: 'menu.segmenPelanggan', ikon: HeartHandshake }],
  },
  {
    judul: 'grup.master',
    item: [
      { ke: '/produk', label: 'menu.produk', ikon: Package },
      { ke: '/pelanggan', label: 'menu.pelanggan', ikon: Users },
      { ke: '/supplier', label: 'menu.supplier', ikon: Building2, peran: ['owner', 'admin'] },
      { ke: '/gudang', label: 'menu.gudang', ikon: Warehouse, peran: ['owner', 'admin'] },
    ],
  },
  {
    judul: 'grup.laporan',
    item: [
      { ke: '/laporan/omzet', label: 'menu.omzet', ikon: BarChart3, peran: ['owner', 'admin'] },
      { ke: '/laporan/piutang', label: 'menu.piutang', ikon: BarChart3 },
      { ke: '/laporan/laba', label: 'menu.labaKotor', ikon: BarChart3, peran: ['owner', 'admin'] },
    ],
  },
]

export function Layout() {
  const { profil, keluar } = useAuth()
  const { t } = useI18n()

  const bolehLihat = (item: MenuItem) =>
    !item.peran || (profil?.peran ? item.peran.includes(profil.peran) : false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <img src="/ayyubi-logo.jpeg" alt="Ayyubi Food" className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-border" />
          <span className="font-semibold">Ayyubi Finance</span>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-3">
          {MENU.map((grup) => {
            const item = grup.item.filter(bolehLihat)
            if (item.length === 0) return null

            return (
              <div key={grup.judul}>
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(grup.judul)}
                </p>
                <ul className="space-y-0.5">
                  {item.map((m) => (
                    <li key={m.ke}>
                      <NavLink
                        to={m.ke}
                        end={m.ke === '/'}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors',
                            isActive
                              ? 'bg-primary font-medium text-primary-foreground shadow-sm'
                              : 'text-foreground/70 hover:bg-accent',
                          )
                        }
                      >
                        <m.ikon className="h-4 w-4 shrink-0" />
                        {t(m.label)}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar nama={profil?.nama ?? '...'} peran={profil?.peran ?? ''} keluar={keluar} />

        <main className="min-w-0 flex-1 overflow-y-auto bg-background">
          <div className="mx-auto max-w-7xl p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- TopBar */

function TopBar({ nama, peran, keluar }: { nama: string; peran: string; keluar: () => void }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 px-4 md:px-6">
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
            'rounded-full px-2.5 py-1 uppercase transition-colors',
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
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-accent"
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
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-muted/70 text-foreground/70 transition-colors hover:bg-accent"
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
        className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1.5 transition-colors hover:bg-accent sm:pr-3"
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
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            {t('topbar.keluar')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
