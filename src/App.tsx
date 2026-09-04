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

        {/* Fase 1 & 2 — skema siap, layar menyusul */}
        <Route path="purchase-order" element={<SegeraHadir judul="Purchase Order" />} />
        <Route path="penerimaan-barang" element={<SegeraHadir judul="Penerimaan Barang" />} />
        <Route path="faktur-pembelian" element={<SegeraHadir judul="Faktur Pembelian" />} />
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
