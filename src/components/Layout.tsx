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
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Truck className="h-4 w-4" />
          </div>
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
                            'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                            isActive
                              ? 'bg-primary/10 font-medium text-primary'
                              : 'text-foreground/80 hover:bg-accent',
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

        <div className="border-t border-border p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium">{profil?.nama ?? '...'}</p>
            <p className="text-xs capitalize text-muted-foreground">{profil?.peran ?? ''}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={keluar}>
            <LogOut className="h-4 w-4" />
            Keluar
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
