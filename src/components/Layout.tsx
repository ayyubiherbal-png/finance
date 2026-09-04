import { NavLink, Outlet } from 'react-router-dom'
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
  LogOut,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { PeranPengguna } from '@/types/db'

interface MenuItem {
  ke: string
  label: string
  ikon: typeof Package
  peran?: PeranPengguna[]
}

interface Grup {
  judul: string
  item: MenuItem[]
}

const MENU: Grup[] = [
  {
    judul: 'Ringkasan',
    item: [{ ke: '/', label: 'Dasbor', ikon: LayoutDashboard }],
  },
  {
    judul: 'Penjualan',
    item: [
      { ke: '/sales-order', label: 'Sales Order', ikon: ShoppingCart },
      { ke: '/surat-jalan', label: 'Surat Jalan', ikon: Truck },
      { ke: '/faktur-penjualan', label: 'Faktur Penjualan', ikon: Receipt },
      { ke: '/penerimaan-kas', label: 'Penerimaan Kas', ikon: Wallet },
      { ke: '/retur-penjualan', label: 'Retur Penjualan', ikon: Undo2 },
    ],
  },
  {
    judul: 'Pembelian',
    item: [
      { ke: '/purchase-order', label: 'Purchase Order', ikon: ShoppingCart },
      { ke: '/penerimaan-barang', label: 'Penerimaan Barang', ikon: Warehouse },
      { ke: '/faktur-pembelian', label: 'Faktur Pembelian', ikon: Receipt },
      { ke: '/pembayaran-supplier', label: 'Pembayaran Supplier', ikon: Wallet },
      { ke: '/retur-pembelian', label: 'Retur Pembelian', ikon: Undo2 },
    ],
  },
  {
    judul: 'Kas & Bank',
    item: [
      { ke: '/kas-bank', label: 'Akun Kas & Bank', ikon: Landmark },
      { ke: '/kartu-kas-bank', label: 'Kartu Kas & Bank', ikon: BarChart3 },
    ],
  },
  {
    judul: 'Inventori',
    item: [
      { ke: '/stok', label: 'Stok', ikon: Warehouse },
      { ke: '/kartu-stok', label: 'Kartu Stok', ikon: BarChart3 },
      { ke: '/penyesuaian-stok', label: 'Penyesuaian Stok', ikon: ClipboardEdit },
    ],
  },
  {
    judul: 'Master',
    item: [
      { ke: '/produk', label: 'Produk', ikon: Package },
      { ke: '/pelanggan', label: 'Pelanggan', ikon: Users },
      { ke: '/supplier', label: 'Supplier', ikon: Building2, peran: ['owner', 'admin'] },
    ],
  },
  {
    judul: 'Laporan',
    item: [
      { ke: '/laporan/piutang', label: 'Piutang', ikon: BarChart3 },
      { ke: '/laporan/laba', label: 'Laba Kotor', ikon: BarChart3, peran: ['owner', 'admin'] },
    ],
  },
]

export function Layout() {
  const { profil, keluar } = useAuth()

  const bolehLihat = (item: MenuItem) =>
    !item.peran || (profil?.peran ? item.peran.includes(profil.peran) : false)

  return (
    <div className="flex h-screen overflow-hidden bg-brand-wash">
      <aside className="glass hidden w-60 shrink-0 flex-col md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border/70 px-4">
          <img src="/ayyubi-logo.jpeg" alt="Ayyubi Food" className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-border" />
          <span className="font-semibold">Ayyubi Finance</span>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {MENU.map((grup) => {
            const item = grup.item.filter(bolehLihat)
            if (item.length === 0) return null

            return (
              <div key={grup.judul}>
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {grup.judul}
                </p>
                <ul className="space-y-0.5">
                  {item.map((m) => (
                    <li key={m.ke}>
                      <NavLink
                        to={m.ke}
                        end={m.ke === '/'}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2 rounded-md border-l-2 px-2 py-1.5 text-sm transition-colors',
                            isActive
                              ? 'border-primary bg-primary/10 font-medium text-primary'
                              : 'border-transparent text-foreground/80 hover:bg-accent',
                          )
                        }
                      >
                        <m.ikon className="h-4 w-4 shrink-0" />
                        {m.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </nav>

        <div className="border-t border-border/70 p-3">
          <div className="mb-2 flex items-center gap-2.5 px-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {(profil?.nama ?? '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{profil?.nama ?? '...'}</p>
              <p className="text-xs capitalize text-muted-foreground">{profil?.peran ?? ''}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={keluar}>
            <LogOut className="h-4 w-4" />
            Keluar
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto bg-background">
        <div className="mx-auto max-w-7xl p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
