import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { Layout } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { Toaster } from '@/components/Toast'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { Produk } from '@/pages/Produk'
import { ProdukForm } from '@/pages/ProdukForm'
import { Pelanggan } from '@/pages/Pelanggan'
import { PelangganForm } from '@/pages/PelangganForm'
import { Supplier } from '@/pages/Supplier'
import { SupplierForm } from '@/pages/SupplierForm'
import { Stok } from '@/pages/Stok'
import { KartuStok } from '@/pages/KartuStok'
import { AkunKasBank } from '@/pages/AkunKasBank'
import { AkunKasBankForm } from '@/pages/AkunKasBankForm'
import { KartuKasBank } from '@/pages/KartuKasBank'
import { LaporanPiutang } from '@/pages/LaporanPiutang'
import { LaporanLaba } from '@/pages/LaporanLaba'
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
import { ReturPenjualan } from '@/pages/ReturPenjualan'
import { ReturPenjualanForm } from '@/pages/ReturPenjualanForm'
import { ReturPembelian } from '@/pages/ReturPembelian'
import { ReturPembelianForm } from '@/pages/ReturPembelianForm'
import { PenyesuaianStok } from '@/pages/PenyesuaianStok'
import { PenyesuaianStokForm } from '@/pages/PenyesuaianStokForm'

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
        <Route path="produk/:id" element={<ProdukForm />} />
        <Route path="pelanggan" element={<Pelanggan />} />
        <Route path="pelanggan/:id" element={<PelangganForm />} />
        <Route path="supplier" element={<Supplier />} />
        <Route path="supplier/:id" element={<SupplierForm />} />
        <Route path="stok" element={<Stok />} />
        <Route path="kartu-stok" element={<KartuStok />} />
        <Route path="kas-bank" element={<AkunKasBank />} />
        <Route path="kas-bank/:id" element={<AkunKasBankForm />} />
        <Route path="kartu-kas-bank" element={<KartuKasBank />} />
        <Route path="penyesuaian-stok" element={<PenyesuaianStok />} />
        <Route path="penyesuaian-stok/:id" element={<PenyesuaianStokForm />} />
        <Route path="laporan/piutang" element={<LaporanPiutang />} />
        <Route path="laporan/laba" element={<LaporanLaba />} />

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
        <Route path="retur-penjualan" element={<ReturPenjualan />} />
        <Route path="retur-penjualan/:id" element={<ReturPenjualanForm />} />
        <Route path="retur-pembelian" element={<ReturPembelian />} />
        <Route path="retur-pembelian/:id" element={<ReturPembelianForm />} />

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
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
