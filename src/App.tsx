import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { Layout } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { Produk } from '@/pages/Produk'
import { Pelanggan } from '@/pages/Pelanggan'
import { SalesOrder } from '@/pages/SalesOrder'
import { SalesOrderForm } from '@/pages/SalesOrderForm'
import { SuratJalan } from '@/pages/SuratJalan'
import { SuratJalanForm } from '@/pages/SuratJalanForm'
import { FakturPenjualan } from '@/pages/FakturPenjualan'
import { FakturPenjualanForm } from '@/pages/FakturPenjualanForm'
import { PenerimaanKas } from '@/pages/PenerimaanKas'
import { PenerimaanKasForm } from '@/pages/PenerimaanKasForm'
import { PurchaseOrder } from '@/pages/PurchaseOrder'
import { PurchaseOrderForm } from '@/pages/PurchaseOrderForm'
import { PenerimaanBarang } from '@/pages/PenerimaanBarang'
import { PenerimaanBarangForm } from '@/pages/PenerimaanBarangForm'
import { FakturPembelian } from '@/pages/FakturPembelian'
import { FakturPembelianForm } from '@/pages/FakturPembelianForm'
import { PembayaranSupplier } from '@/pages/PembayaranSupplier'
import { PembayaranSupplierForm } from '@/pages/PembayaranSupplierForm'
import { SegeraHadir } from '@/pages/SegeraHadir'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function Rute() {
  const { session, memuat } = useAuth()

  if (memuat) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (!session) return <Login />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="produk" element={<Produk />} />
        <Route path="pelanggan" element={<Pelanggan />} />

        <Route path="sales-order" element={<SalesOrder />} />
        <Route path="sales-order/:id" element={<SalesOrderForm />} />
        <Route path="surat-jalan" element={<SuratJalan />} />
        <Route path="surat-jalan/:id" element={<SuratJalanForm />} />
        <Route path="faktur-penjualan" element={<FakturPenjualan />} />
        <Route path="faktur-penjualan/:id" element={<FakturPenjualanForm />} />
        <Route path="penerimaan-kas" element={<PenerimaanKas />} />
        <Route path="penerimaan-kas/:id" element={<PenerimaanKasForm />} />
        <Route path="purchase-order" element={<PurchaseOrder />} />
        <Route path="purchase-order/:id" element={<PurchaseOrderForm />} />
        <Route path="penerimaan-barang" element={<PenerimaanBarang />} />
        <Route path="penerimaan-barang/:id" element={<PenerimaanBarangForm />} />
        <Route path="faktur-pembelian" element={<FakturPembelian />} />
        <Route path="faktur-pembelian/:id" element={<FakturPembelianForm />} />
        <Route path="pembayaran-supplier" element={<PembayaranSupplier />} />
        <Route path="pembayaran-supplier/:id" element={<PembayaranSupplierForm />} />

        {/* Fase 1 & 2 — skema siap, layar menyusul */}
        <Route path="supplier" element={<SegeraHadir judul="Supplier" />} />
        <Route path="stok" element={<SegeraHadir judul="Stok per Gudang" />} />
        <Route path="kartu-stok" element={<SegeraHadir judul="Kartu Stok" />} />
        <Route path="laporan/piutang" element={<SegeraHadir judul="Laporan Piutang" />} />
        <Route path="laporan/laba" element={<SegeraHadir judul="Laporan Laba Kotor" />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Rute />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
