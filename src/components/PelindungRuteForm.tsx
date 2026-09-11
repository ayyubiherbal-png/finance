import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { usePelindungForm } from '@/hooks/usePelindungForm'

const RUTE_FORM = /^\/(produk|pelanggan|supplier|gudang|kategori-produk|kategori-biaya|nama-pengeluaran|sales-order|surat-jalan|faktur-penjualan|penerimaan-kas|pengeluaran-kas|purchase-order|penerimaan-barang|faktur-pembelian|pembayaran-supplier|retur-penjualan|retur-pembelian|penyesuaian-stok|tiket)\/[^/]+$/

/** Perlindungan terpusat untuk semua halaman entri/edit, termasuk form dinamis. */
export function PelindungRuteForm({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const aktif = RUTE_FORM.test(pathname) || pathname === '/penjualan-cepat' || pathname === '/impor-pesanan'
  const { ref } = usePelindungForm(aktif)
  return <div ref={ref} className="contents">{children}</div>
}
