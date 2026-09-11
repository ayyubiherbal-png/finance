import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { I18nProvider } from '@/lib/i18n'
import { Layout } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { Toaster } from '@/components/Toast'
import { PenyediaKonfirmasi } from '@/components/Konfirmasi'
import { PelindungRuteForm } from '@/components/PelindungRuteForm'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { Produk } from '@/pages/Produk'
import { ProdukForm } from '@/pages/ProdukForm'
import { KategoriProduk } from '@/pages/KategoriProduk'
import { KategoriProdukForm } from '@/pages/KategoriProdukForm'
import { KategoriBiaya } from '@/pages/KategoriBiaya'
import { KategoriBiayaForm } from '@/pages/KategoriBiayaForm'
import { NamaPengeluaranForm } from '@/pages/NamaPengeluaranForm'
import { Pelanggan } from '@/pages/Pelanggan'
import { PelangganForm } from '@/pages/PelangganForm'
import { PembeliMarketplace } from '@/pages/PembeliMarketplace'
import { Supplier } from '@/pages/Supplier'
import { SupplierForm } from '@/pages/SupplierForm'
import { Gudang } from '@/pages/Gudang'
import { GudangForm } from '@/pages/GudangForm'
import { CrmPelanggan } from '@/pages/CrmPelanggan'
import { CrmPelangganProfil } from '@/pages/CrmPelangganProfil'
import { TugasFollowUp } from '@/pages/TugasFollowUp'
import { TahapanTreatmentFu } from '@/pages/TahapanTreatmentFu'
import { UmpanBalikPublik } from '@/pages/UmpanBalikPublik'
import { UmpanBalik } from '@/pages/UmpanBalik'
import { RiwayatFollowUp } from '@/pages/RiwayatFollowUp'
import { Tiket } from '@/pages/Tiket'
import { TiketForm } from '@/pages/TiketForm'
import { Stok } from '@/pages/Stok'
import { KartuStok } from '@/pages/KartuStok'
import { AkunKasBank } from '@/pages/AkunKasBank'
import { AkunKasBankForm } from '@/pages/AkunKasBankForm'
import { KartuKasBank } from '@/pages/KartuKasBank'
import { LaporanPiutang } from '@/pages/LaporanPiutang'
import { LaporanLaba } from '@/pages/LaporanLaba'
import { LaporanLabaRugi } from '@/pages/LaporanLabaRugi'
import { LaporanOmzet } from '@/pages/LaporanOmzet'
import { SalesOrder } from '@/pages/SalesOrder'
import { SalesOrderForm } from '@/pages/SalesOrderForm'
import { PenjualanCepat } from '@/pages/PenjualanCepat'
import { ImporPesanan } from '@/pages/ImporPesanan'
import { SuratJalan } from '@/pages/SuratJalan'
import { SuratJalanForm } from '@/pages/SuratJalanForm'
import { SuratJalanCetak } from '@/pages/SuratJalanCetak'
import { SuratJalanCetakMassal } from '@/pages/SuratJalanCetakMassal'
import { FakturPenjualan } from '@/pages/FakturPenjualan'
import { FakturPenjualanForm } from '@/pages/FakturPenjualanForm'
import { FakturPenjualanCetak } from '@/pages/FakturPenjualanCetak'
import { PenerimaanKas } from '@/pages/PenerimaanKas'
import { PenerimaanKasForm } from '@/pages/PenerimaanKasForm'
import { PengeluaranKas } from '@/pages/PengeluaranKas'
import { PengeluaranKasForm } from '@/pages/PengeluaranKasForm'
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
import { RiwayatPerubahan } from '@/pages/RiwayatPerubahan'
import { SettlementMarketplace } from '@/pages/SettlementMarketplace'

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
      <Route path="surat-jalan/:id/cetak" element={<SuratJalanCetak />} />
      <Route path="surat-jalan/cetak-massal" element={<SuratJalanCetakMassal />} />
      <Route path="faktur-penjualan/:id/cetak" element={<FakturPenjualanCetak />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="produk" element={<Produk />} />
        <Route path="produk/:id" element={<ProdukForm />} />
        <Route path="kategori-produk" element={<KategoriProduk />} />
        <Route path="kategori-produk/:id" element={<KategoriProdukForm />} />
        <Route path="kategori-biaya" element={<KategoriBiaya />} />
        <Route path="kategori-biaya/:id" element={<KategoriBiayaForm />} />
        <Route path="nama-pengeluaran/:id" element={<NamaPengeluaranForm />} />
        <Route path="pelanggan" element={<Pelanggan />} />
        <Route path="pelanggan/:id" element={<PelangganForm />} />
        <Route path="pembeli-marketplace" element={<PembeliMarketplace />} />
        <Route path="supplier" element={<Supplier />} />
        <Route path="supplier/:id" element={<SupplierForm />} />
        <Route path="gudang" element={<Gudang />} />
        <Route path="gudang/:id" element={<GudangForm />} />
        <Route path="riwayat-perubahan" element={<RiwayatPerubahan />} />
        <Route path="crm" element={<CrmPelanggan />} />
        <Route path="crm/pelanggan/:id" element={<CrmPelangganProfil />} />
        <Route path="tugas-follow-up" element={<TugasFollowUp />} />
        <Route path="tahapan-treatment" element={<TahapanTreatmentFu />} />
        <Route path="riwayat-follow-up" element={<RiwayatFollowUp />} />
        <Route path="tiket" element={<Tiket />} />
        <Route path="tiket/:id" element={<TiketForm />} />
        <Route path="umpan-balik" element={<UmpanBalik />} />
        <Route path="stok" element={<Stok />} />
        <Route path="kartu-stok" element={<KartuStok />} />
        <Route path="kas-bank" element={<AkunKasBank />} />
        <Route path="kas-bank/:id" element={<AkunKasBankForm />} />
        <Route path="kartu-kas-bank" element={<KartuKasBank />} />
        <Route path="penyesuaian-stok" element={<PenyesuaianStok />} />
        <Route path="penyesuaian-stok/:id" element={<PenyesuaianStokForm />} />
        <Route path="laporan/piutang" element={<LaporanPiutang />} />
        <Route path="laporan/laba" element={<LaporanLaba />} />
        <Route path="laporan/laba-rugi" element={<LaporanLabaRugi />} />
        <Route path="laporan/omzet" element={<LaporanOmzet />} />

        <Route path="penjualan-cepat" element={<PenjualanCepat />} />
        <Route path="impor-pesanan" element={<ImporPesanan />} />
        <Route path="sales-order" element={<SalesOrder />} />
        <Route path="sales-order/:id" element={<SalesOrderForm />} />
        <Route path="surat-jalan" element={<SuratJalan />} />
        <Route path="surat-jalan/:id" element={<SuratJalanForm />} />
        <Route path="faktur-penjualan" element={<FakturPenjualan />} />
        <Route path="faktur-penjualan/:id" element={<FakturPenjualanForm />} />
        <Route path="penerimaan-kas" element={<PenerimaanKas />} />
        <Route path="penerimaan-kas/:id" element={<PenerimaanKasForm />} />
        <Route path="pengeluaran-kas" element={<PengeluaranKas />} />
        <Route path="pengeluaran-kas/:id" element={<PengeluaranKasForm />} />
        <Route path="settlement-marketplace" element={<SettlementMarketplace />} />
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

/**
 * `/u/:token` (Umpan Balik Pelanggan, 0042) SENGAJA di luar AuthProvider
 * -- pelanggan tidak punya akun/login di aplikasi ini sama sekali,
 * jadi halaman itu tidak boleh ikut kena gerbang sesi seperti semua
 * rute lain (yang dicek di dalam `Rute()` lewat `if (!session) return
 * <Login/>`). Rute publik lain di masa depan taruh di sini juga, bukan
 * di dalam `Rute()`.
 */
function AutentikasiDanRute() {
  return (
    <AuthProvider>
      <Rute />
    </AuthProvider>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <I18nProvider>
          <PenyediaKonfirmasi>
            <PelindungRuteForm>
              <Routes>
                <Route path="/u/:token" element={<UmpanBalikPublik />} />
                <Route path="/*" element={<AutentikasiDanRute />} />
              </Routes>
            </PelindungRuteForm>
            <Toaster />
          </PenyediaKonfirmasi>
        </I18nProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
