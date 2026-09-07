import { createContext, useContext, useState, type ReactNode } from 'react'

export type Bahasa = 'id' | 'en'

/**
 * Kamus dwibahasa -- TAHAP 1 (2026-09-07): baru mencakup "chrome" aplikasi
 * (sidebar, topbar, halaman login), BUKAN seluruh isi halaman. Kolom tabel,
 * judul form, dan pesan di ~50 halaman transaksi masih Bahasa Indonesia
 * saja -- itu keputusan yang diambil sadar (bukan lupa), supaya tahap ini
 * bisa selesai sekali jalan tanpa menyentuh setiap halaman.
 *
 * Dokumen cetak (Invoice, Label pengiriman) SENGAJA TIDAK memakai kamus
 * ini -- diserahkan ke pembeli/kurir yang orang Indonesia, jadi tetap
 * Bahasa Indonesia berapa pun toggle-nya di sini.
 */
const KAMUS = {
  // ---------- Sidebar: grup menu ----------
  'grup.ringkasan': { id: 'Ringkasan', en: 'Overview' },
  'grup.penjualan': { id: 'Penjualan', en: 'Sales' },
  'grup.pembelian': { id: 'Pembelian', en: 'Purchasing' },
  'grup.kasBank': { id: 'Kas & Bank', en: 'Cash & Bank' },
  'grup.inventori': { id: 'Inventori', en: 'Inventory' },
  'grup.crm': { id: 'CRM', en: 'CRM' },
  'grup.master': { id: 'Master', en: 'Master Data' },
  'grup.laporan': { id: 'Laporan', en: 'Reports' },

  // ---------- Sidebar: item menu ----------
  'menu.dasbor': { id: 'Dasbor', en: 'Dashboard' },
  'menu.penjualanCepat': { id: 'Penjualan Cepat', en: 'Quick Sale' },
  'menu.salesOrder': { id: 'Sales Order', en: 'Sales Order' },
  'menu.suratJalan': { id: 'Surat Jalan', en: 'Delivery Note' },
  'menu.fakturPenjualan': { id: 'Faktur Penjualan', en: 'Sales Invoice' },
  'menu.penerimaanKas': { id: 'Penerimaan Kas', en: 'Cash Receipt' },
  'menu.returPenjualan': { id: 'Retur Penjualan', en: 'Sales Return' },
  'menu.purchaseOrder': { id: 'Purchase Order', en: 'Purchase Order' },
  'menu.penerimaanBarang': { id: 'Penerimaan Barang', en: 'Goods Receipt' },
  'menu.fakturPembelian': { id: 'Faktur Pembelian', en: 'Purchase Invoice' },
  'menu.pembayaranSupplier': { id: 'Pembayaran Supplier', en: 'Supplier Payment' },
  'menu.returPembelian': { id: 'Retur Pembelian', en: 'Purchase Return' },
  'menu.akunKasBank': { id: 'Akun Kas & Bank', en: 'Cash & Bank Accounts' },
  'menu.kartuKasBank': { id: 'Kartu Kas & Bank', en: 'Cash & Bank Ledger' },
  'menu.stok': { id: 'Stok', en: 'Stock' },
  'menu.kartuStok': { id: 'Kartu Stok', en: 'Stock Card' },
  'menu.penyesuaianStok': { id: 'Penyesuaian Stok', en: 'Stock Adjustment' },
  'menu.segmenPelanggan': { id: 'Segmen Pelanggan', en: 'Customer Segments' },
  'menu.produk': { id: 'Produk', en: 'Products' },
  'menu.pelanggan': { id: 'Pelanggan', en: 'Customers' },
  'menu.supplier': { id: 'Supplier', en: 'Suppliers' },
  'menu.gudang': { id: 'Gudang', en: 'Warehouse' },
  'menu.omzet': { id: 'Omzet', en: 'Revenue' },
  'menu.piutang': { id: 'Piutang', en: 'Receivables' },
  'menu.labaKotor': { id: 'Laba Kotor', en: 'Gross Profit' },

  // ---------- Topbar ----------
  'topbar.cari': { id: 'Cari produk, pelanggan, supplier...', en: 'Search products, customers, suppliers...' },
  'topbar.mencari': { id: 'Mencari...', en: 'Searching...' },
  'topbar.tidakAdaHasil': { id: 'Tidak ada hasil.', en: 'No results.' },
  'topbar.notifikasi': { id: 'Notifikasi', en: 'Notifications' },
  'topbar.perluPerhatian': { id: 'Perlu perhatian', en: 'Needs attention' },
  'topbar.semuaAman': { id: 'Semua aman, tidak ada yang perlu ditindaklanjuti.', en: 'All clear, nothing needs action.' },
  'topbar.produkPerluRestock': { id: 'produk perlu restock', en: 'products need restocking' },
  'topbar.piutangLewat': { id: 'pelanggan piutang lewat jatuh tempo', en: 'customers overdue on payment' },
  'topbar.keluar': { id: 'Keluar', en: 'Sign out' },
  'topbar.produk': { id: 'Produk', en: 'Product' },
  'topbar.pelanggan': { id: 'Pelanggan', en: 'Customer' },
  'topbar.supplier': { id: 'Supplier', en: 'Supplier' },

  // ---------- Login ----------
  'login.subjudul': { id: 'Masuk untuk melanjutkan', en: 'Sign in to continue' },
  'login.email': { id: 'Email', en: 'Email' },
  'login.kataSandi': { id: 'Kata sandi', en: 'Password' },
  'login.masuk': { id: 'Masuk', en: 'Sign in' },
  'login.memproses': { id: 'Memproses...', en: 'Signing in...' },
} as const

export type KunciTerjemahan = keyof typeof KAMUS

interface I18nCtx {
  bahasa: Bahasa
  setBahasa: (b: Bahasa) => void
  t: (kunci: KunciTerjemahan) => string
}

const Ctx = createContext<I18nCtx | null>(null)

const KUNCI_STORAGE = 'ayyubi-bahasa'

function bahasaTersimpan(): Bahasa {
  try {
    return localStorage.getItem(KUNCI_STORAGE) === 'en' ? 'en' : 'id'
  } catch {
    // localStorage tidak tersedia (mode privat, dsb.) -- default ke Indonesia.
    return 'id'
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [bahasa, setBahasaState] = useState<Bahasa>(bahasaTersimpan)

  function setBahasa(b: Bahasa) {
    setBahasaState(b)
    try {
      localStorage.setItem(KUNCI_STORAGE, b)
    } catch {
      // Pilihan bahasa tidak akan diingat lintas sesi -- tidak fatal.
    }
  }

  const t = (kunci: KunciTerjemahan) => KAMUS[kunci][bahasa]

  return <Ctx.Provider value={{ bahasa, setBahasa, t }}>{children}</Ctx.Provider>
}

export function useI18n() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useI18n dipakai di luar <I18nProvider>')
  return ctx
}
