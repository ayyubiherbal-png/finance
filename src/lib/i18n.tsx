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
  // 'grup.*' dipakai dua peran sekaligus sejak menu digabung (2026-09-07):
  // sebagai judul grup di sidebar DAN sebagai nama menu gabungannya
  // (mis. "Penjualan" = menu yang berisi tab Sales Order, Surat Jalan, dst).
  'grup.menu': { id: 'Menu', en: 'Menu' },
  'grup.lainnya': { id: 'Lainnya', en: 'General' },
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
  'menu.imporPesanan': { id: 'Impor Pesanan', en: 'Import Orders' },
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
  'menu.pembeliMarketplace': { id: 'Pembeli Marketplace', en: 'Marketplace Buyers' },
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

  // ---------- Dasbor ----------
  'dasbor.judul': { id: 'Dasbor', en: 'Dashboard' },
  'dasbor.subjudul': { id: 'Ringkasan bisnis 30 hari terakhir', en: 'Business summary for the last 30 days' },
  'dasbor.lihatLaporanOmzet': { id: 'Lihat Laporan Omzet', en: 'View Revenue Report' },
  'dasbor.omzet30Hari': { id: 'Omzet 30 hari', en: 'Revenue (30 days)' },
  'dasbor.vs30HariSebelumnya': { id: 'vs 30 hari sebelumnya', en: 'vs previous 30 days' },
  'dasbor.labaKotor': { id: 'Laba kotor', en: 'Gross profit' },
  'dasbor.margin': { id: 'Margin', en: 'Margin' },
  'dasbor.nilaiPersediaan': { id: 'Nilai persediaan', en: 'Inventory value' },
  'dasbor.piutangBerjalan': { id: 'Piutang berjalan', en: 'Outstanding receivables' },
  'dasbor.lewat90Hari': { id: 'lewat 90 hari', en: 'overdue 90+ days' },
  'dasbor.trenOmzetHarian': { id: 'Tren omzet harian', en: 'Daily revenue trend' },
  'dasbor.marginLaba30Hari': { id: 'Margin laba 30 hari', en: 'Gross margin (30 days)' },
  'dasbor.omzet': { id: 'Omzet', en: 'Revenue' },
  'dasbor.jatuhTempoTerdekat': { id: 'Jatuh tempo terdekat', en: 'Upcoming due dates' },
  'dasbor.tidakAdaFakturBelumLunas': { id: 'Tidak ada faktur belum lunas.', en: 'No unpaid invoices.' },
  'dasbor.lewat': { id: 'Lewat', en: 'Overdue' },
  'dasbor.pelangganTeratas': { id: 'Pelanggan teratas', en: 'Top customers' },
  'dasbor.belumAdaTransaksi': { id: 'Belum ada transaksi.', en: 'No transactions yet.' },
  'dasbor.saldoKasBank': { id: 'Saldo Kas & Bank', en: 'Cash & bank balance' },
  'dasbor.lihatSemuaAkun': { id: 'Lihat semua akun', en: 'View all accounts' },
  'dasbor.perluRestock': { id: 'Perlu restock', en: 'Needs restocking' },
  'dasbor.semuaProdukAmanStok': { id: 'Semua produk di atas stok minimum.', en: 'All products are above minimum stock.' },
  'dasbor.habis': { id: 'Habis', en: 'Out of stock' },
  'dasbor.menipis': { id: 'Menipis', en: 'Low stock' },

  // ---------- Login ----------
  'login.subjudul': { id: 'Masuk untuk melanjutkan', en: 'Sign in to continue' },
  'login.email': { id: 'Email', en: 'Email' },
  'login.kataSandi': { id: 'Kata sandi', en: 'Password' },
  'login.masuk': { id: 'Masuk', en: 'Sign in' },
  'login.memproses': { id: 'Memproses...', en: 'Signing in...' },
} as const

export type KunciTerjemahan = keyof typeof KAMUS

/**
 * Kamus teks ISI HALAMAN -- judul kolom tabel, label form, placeholder,
 * pesan kosong, notifikasi.
 *
 * Beda dari KAMUS di atas: di sini KUNCINYA ADALAH KALIMAT BAHASA
 * INDONESIA-nya sendiri, bukan nama kunci seperti 'menu.dasbor'. Alasannya
 * diukur dulu sebelum diputuskan: teks halaman muncul ~700 kali tapi hanya
 * ~350 kalimat yang benar-benar unik -- kolom "Nama"/"Tanggal"/"Total"
 * berulang di belasan halaman. Dengan kalimat sebagai kunci:
 *
 * - satu entri di sini otomatis menutup SEMUA pengulangannya,
 * - JSX tetap terbaca (`tt('Jatuh tempo')`, bukan `t('faktur.kolom.jatuhTempo')`),
 * - konstanta yang sudah ada tetap dipakai apa adanya -- mis. label status
 *   cukup dibungkus di tempat pemakaian: `tt(LABEL_STATUS[x])`,
 * - kalimat yang BELUM diterjemahkan aman: `tt()` mengembalikan teks
 *   Indonesia aslinya, bukan kunci mentah atau string kosong.
 */
const TEKS: Record<string, string> = {
  // ---------- Judul kolom & label form ----------
  Nomor: 'Number',
  Tanggal: 'Date',
  Pelanggan: 'Customer',
  Supplier: 'Supplier',
  Kanal: 'Channel',
  'Kanal penjualan': 'Sales channel',
  Total: 'Total',
  Status: 'Status',
  'Status bayar': 'Payment status',
  Bayar: 'Payment',
  'Jatuh tempo': 'Due date',
  Sisa: 'Balance',
  'Sisa PO': 'PO remaining',
  Produk: 'Product',
  Satuan: 'Unit',
  'Satuan dasar': 'Base unit',
  Qty: 'Qty',
  'Qty terjual': 'Qty sold',
  'Qty (+ tambah, - kurangi)': 'Qty (+ add, - reduce)',
  Harga: 'Price',
  'Harga / satuan': 'Price / unit',
  'Harga beli': 'Purchase price',
  'Harga beli / satuan': 'Purchase price / unit',
  Subtotal: 'Subtotal',
  Diskon: 'Discount',
  'Diskon%': 'Discount%',
  'Diskon (Rp)': 'Discount (Rp)',
  Gudang: 'Warehouse',
  'Gudang tujuan': 'Destination warehouse',
  Kode: 'Code',
  'Kode (SKU)': 'Code (SKU)',
  'Kode awal': 'Prefix',
  Nama: 'Name',
  'Nama bank': 'Bank name',
  'Nama penerima': 'Recipient name',
  'Nama penerima paket': 'Package recipient name',
  Kategori: 'Category',
  Stok: 'Stock',
  'Stok minimum': 'Minimum stock',
  'Min. qty': 'Min. qty',
  HPP: 'COGS',
  'HPP/satuan dasar': 'COGS / base unit',
  'Laba Kotor': 'Gross profit',
  'Laba kotor': 'Gross profit',
  Omzet: 'Revenue',
  Margin: 'Margin',
  Nilai: 'Value',
  'Nilai persediaan': 'Inventory value',
  Saldo: 'Balance',
  'Saldo awal': 'Opening balance',
  Masuk: 'In',
  Keluar: 'Out',
  Akun: 'Account',
  'Masuk ke akun': 'Into account',
  'Uang masuk ke akun': 'Money into account',
  'Uang keluar dari akun': 'Money out of account',
  Jenis: 'Type',
  Tipe: 'Type',
  Alamat: 'Address',
  'Alamat kirim': 'Shipping address',
  'Alamat (nama jalan, nomor rumah, RT/RW)': 'Address (street, house number, RT/RW)',
  'Alamat (nama jalan, nomor, RT/RW)': 'Address (street, number, RT/RW)',
  Telepon: 'Phone',
  'Telepon/WA penerima': 'Recipient phone/WA',
  WhatsApp: 'WhatsApp',
  Email: 'Email',
  Kontak: 'Contact',
  Provinsi: 'Province',
  'Kabupaten/Kota': 'Regency/City',
  Kecamatan: 'District',
  'Kelurahan/Desa': 'Village',
  Catatan: 'Notes',
  Alasan: 'Reason',
  Periode: 'Period',
  Dari: 'From',
  Sampai: 'To',
  Transaksi: 'Transactions',
  Segmen: 'Segment',
  'Terakhir order': 'Last order',
  'Total belanja': 'Total spend',
  Sales: 'Sales',
  'Sales penanggung jawab': 'Assigned salesperson',
  Tier: 'Tier',
  'Tier harga': 'Price tier',
  Termin: 'Terms',
  'Tempo (hari)': 'Terms (days)',
  'Termin bayar (hari)': 'Payment terms (days)',
  Metode: 'Method',
  Jumlah: 'Amount',
  Sumber: 'Source',
  'Sumber (custom)': 'Source (custom)',
  Barcode: 'Barcode',
  'Berat (gram)': 'Weight (grams)',
  'Berlaku mulai': 'Effective from',
  Diterima: 'Received',
  'Ekspedisi / kurir': 'Courier',
  'Tanggal kirim': 'Delivery date',
  'Tanggal terima': 'Receipt date',
  'Tanggal PO': 'PO date',
  'Tanggal cair': 'Clearing date',
  'Tanggal lahir': 'Date of birth',
  'Perkiraan tanggal kirim': 'Estimated delivery date',
  'Jml Faktur': 'Invoices',
  'Jml faktur': 'Invoices',
  'No. dokumen': 'Document no.',
  'No. referensi (opsional)': 'Reference no. (optional)',
  'No. rekening': 'Account no.',
  'No. surat jalan supplier': 'Supplier delivery note no.',
  'Nomor faktur dari supplier': 'Supplier invoice number',
  'Atas nama': 'Account holder',
  NPWP: 'Tax ID',
  'Media sosial': 'Social media',
  ID: 'ID',
  'Faktur yang dibayar': 'Invoices paid',
  'Faktur asal (opsional)': 'Source invoice (optional)',
  'Penerimaan Barang asal (opsional)': 'Source goods receipt (optional)',
  'Penerimaan Barang yang ditagihkan': 'Goods receipts billed',
  'Surat Jalan yang ditagihkan': 'Delivery notes billed',
  'Kirim sekarang': 'Ship now',
  'Biaya tambahan (ongkos angkut/bongkar)': 'Additional cost (freight/unloading)',
  'Belum jatuh tempo': 'Not yet due',
  Terlambat: 'Overdue',
  'vs Periode Sebelumnya': 'vs previous period',

  // ---------- Placeholder ----------
  'Cari nama atau ID...': 'Search name or ID...',
  'Cari nama atau kode...': 'Search name or code...',
  'Cari nama atau kode pelanggan...': 'Search customer name or code...',
  'Cari nama atau kode supplier...': 'Search supplier name or code...',
  'Cari nomor...': 'Search number...',
  'Cari nomor PO...': 'Search PO number...',
  'Cari nomor SJ...': 'Search delivery note number...',
  'Cari nomor SO...': 'Search SO number...',
  'Cari nomor faktur...': 'Search invoice number...',
  'Cari produk...': 'Search product...',
  'Ketik untuk cari...': 'Type to search...',
  'Ketik untuk cari provinsi...': 'Type to search province...',
  'Ketik untuk cari kabupaten/kota...': 'Type to search regency/city...',
  'Ketik untuk cari kecamatan...': 'Type to search district...',
  'Ketik untuk cari kelurahan/desa...': 'Type to search village...',
  'Nama PIC/penanggung jawab': 'Contact person name',
  'Nama kategori baru': 'New category name',
  'Nama pembeli sesungguhnya (untuk label pengiriman)': 'Actual buyer name (for shipping label)',
  'No. transaksi / no. giro': 'Transaction no. / cheque no.',
  'Opsional, untuk pencocokan dokumen': 'Optional, for document matching',
  'BCA, Mandiri, ...': 'BCA, Mandiri, ...',
  'mis. Hasil stock opname September': 'e.g. September stock count result',
  'mis. IG: @nama, TikTok: @nama': 'e.g. IG: @name, TikTok: @name',
  'mis. JNE, sales sendiri': 'e.g. JNE, own courier',
  'mis. Kas Toko, BCA Ayyubi Food': 'e.g. Store Cash, BCA Ayyubi Food',
  'mis. Tokopedia, WhatsApp, pameran, ...': 'e.g. Tokopedia, WhatsApp, expo, ...',

  // ---------- Pesan saat data kosong ----------
  'Belum ada data.': 'No data yet.',
  'Belum ada Sales Order.': 'No sales orders yet.',
  'Belum ada Surat Jalan.': 'No delivery notes yet.',
  'Belum ada Faktur Penjualan.': 'No sales invoices yet.',
  'Belum ada Penerimaan Kas.': 'No cash receipts yet.',
  'Belum ada Retur Penjualan.': 'No sales returns yet.',
  'Belum ada Purchase Order.': 'No purchase orders yet.',
  'Belum ada Penerimaan Barang.': 'No goods receipts yet.',
  'Belum ada Faktur Pembelian.': 'No purchase invoices yet.',
  'Belum ada Pembayaran Supplier.': 'No supplier payments yet.',
  'Belum ada Retur Pembelian.': 'No purchase returns yet.',
  'Belum ada Penyesuaian Stok.': 'No stock adjustments yet.',
  'Belum ada faktur.': 'No invoices yet.',
  'Belum ada gudang.': 'No warehouses yet.',
  'Belum ada pelanggan.': 'No customers yet.',
  'Belum ada supplier.': 'No suppliers yet.',
  'Belum ada pembelian.': 'No purchases yet.',
  'Belum ada penjualan tercatat.': 'No sales recorded yet.',
  'Belum ada stok tercatat.': 'No stock recorded yet.',
  'Belum ada produk. Tambahkan lewat master produk.': 'No products yet. Add them from product master data.',
  'Belum ada akun kas/bank. Tambahkan minimal satu supaya Penerimaan Kas & Pembayaran Supplier bisa dicatat.':
    'No cash/bank accounts yet. Add at least one so cash receipts & supplier payments can be recorded.',
  'Belum ada item.': 'No items yet.',
  'Tidak ada hasil.': 'No results.',
  'Tidak ada pelanggan yang cocok.': 'No matching customers.',
  'Tidak ada piutang berjalan.': 'No outstanding receivables.',
  'Tidak ada mutasi pada rentang tanggal ini.': 'No movements in this date range.',
  'Tidak ada faktur dengan sisa tagihan untuk pelanggan ini.': 'No invoices with an outstanding balance for this customer.',
  'Tidak ada faktur dengan sisa tagihan untuk supplier ini.': 'No invoices with an outstanding balance for this supplier.',
  'Tidak ada Surat Jalan yang belum difakturkan untuk pelanggan ini.': 'No uninvoiced delivery notes for this customer.',
  'Tidak ada Penerimaan Barang yang belum difakturkan untuk supplier ini.': 'No uninvoiced goods receipts for this supplier.',

  // ---------- Notifikasi (toast) ----------
  'Akun tersimpan.': 'Account saved.',
  'Draf tersimpan.': 'Draft saved.',
  'Draf Sales Order tersimpan.': 'Sales order draft saved.',
  'Draf Purchase Order tersimpan.': 'Purchase order draft saved.',
  'Draf retur tersimpan.': 'Return draft saved.',
  'Draf retur tersimpan, tapi item dari faktur gagal dimuat otomatis. Muat manual di halaman berikutnya.':
    'Return draft saved, but items could not be loaded from the invoice automatically. Load them manually on the next page.',
  'Faktur tersimpan.': 'Invoice saved.',
  'Faktur dibatalkan.': 'Invoice cancelled.',
  'Gudang tersimpan.': 'Warehouse saved.',
  'Harga ditambahkan.': 'Price added.',
  'Harga dihapus.': 'Price removed.',
  'Item ditambahkan.': 'Item added.',
  'Item dihapus.': 'Item removed.',
  'Pelanggan tersimpan.': 'Customer saved.',
  'Pembayaran tersimpan.': 'Payment saved.',
  'Pembayaran dibatalkan.': 'Payment cancelled.',
  'Penerimaan kas tersimpan.': 'Cash receipt saved.',
  'Penerimaan kas dibatalkan.': 'Cash receipt cancelled.',
  'Produk tersimpan.': 'Product saved.',
  'Satuan ditambahkan.': 'Unit added.',
  'Satuan dihapus.': 'Unit removed.',
  'Supplier tersimpan.': 'Supplier saved.',

  // ---------- Label status & badge (dari LABEL_STATUS, LABEL_BAYAR, dll.) ----------
  Draf: 'Draft',
  Menunggu: 'Pending',
  Disetujui: 'Approved',
  'Terkirim Sebagian': 'Partially shipped',
  Selesai: 'Completed',
  Ditolak: 'Rejected',
  Dibatalkan: 'Cancelled',
  Canvassing: 'Canvassing',
  Lainnya: 'Other',
  'Belum Bayar': 'Unpaid',
  'Bayar Sebagian': 'Partially paid',
  Lunas: 'Paid',
  Tunai: 'Cash',
  Transfer: 'Transfer',
  Giro: 'Cheque',
  Kartu: 'Card',
  Juara: 'Champion',
  Setia: 'Loyal',
  Baru: 'New',
  'Mulai Hilang': 'Slipping away',
  Tidur: 'Dormant',
  'Belum Pernah': 'Never ordered',
  Habis: 'Out of stock',
  Menipis: 'Low stock',

  // ---------- Isi dropdown ----------
  'Semua status': 'All statuses',
  'Semua status bayar': 'All payment statuses',
  'Semua gudang': 'All warehouses',
  'Tanpa faktur': 'Without invoice',
  'Tanpa kategori': 'Without category',
  'Tanpa referensi': 'Without reference',
  '+ Tambah kategori baru...': '+ Add new category...',
  Bank: 'Bank',
  'Kas (tunai)': 'Cash',
  COD: 'COD',
  Tempo: 'Credit',
  'Saldo Awal (stok pertama kali masuk sistem)': 'Opening balance (stock first entered into the system)',
  'Penyesuaian (koreksi/hitung fisik/rusak/hilang)': 'Adjustment (correction/physical count/damaged/lost)',
  'Pilih...': 'Select...',
  'Pilih gudang...': 'Select warehouse...',
  'Pilih satuan...': 'Select unit...',
  'Pilih akun...': 'Select account...',
  'Pilih akun kas/bank...': 'Select cash/bank account...',
  'Satuan...': 'Unit...',
  'Tier...': 'Tier...',
  'Mencari...': 'Searching...',

  // ---------- Tombol & aksi ----------
  Simpan: 'Save',
  'Simpan Detail': 'Save details',
  'Simpan sebagai Draf': 'Save as draft',
  Batal: 'Cancel',
  Batalkan: 'Cancel',
  Tambah: 'Add',
  Buat: 'Create',
  Cetak: 'Print',
  'Cetak Semua': 'Print all',
  Posting: 'Post',
  Setujui: 'Approve',
  Kembali: 'Back',
  'Kembali ke daftar': 'Back to list',
  'Buka Lagi jadi Draf': 'Reopen as draft',
  'Buat Faktur': 'Create invoice',
  'Catat Pembayaran': 'Record payment',
  'Bayar Supplier': 'Pay supplier',
  'Bayar Sekarang': 'Pay now',
  'Terima Sekarang': 'Receive now',
  'Kirim Sekarang': 'Ship now',
  'Tandai Terkirim': 'Mark as shipped',
  'Tandai Diterima': 'Mark as received',
  'Proses Penjualan': 'Process sale',
  'Tampilkan semua': 'Show all',
  'Edit data': 'Edit',
  Chat: 'Chat',
  'Chat WA': 'WhatsApp',
  Kolom: 'Columns',
  Aktif: 'Active',
  'Jadikan gudang utama': 'Set as main warehouse',
  'Sudah dibayar sekarang': 'Paid now',
  'SO Baru': 'New SO',
  'PO Baru': 'New PO',
  'Faktur Baru': 'New invoice',
  'Retur Baru': 'New return',
  'Produk Baru': 'New product',
  'Pelanggan Baru': 'New customer',
  'Supplier Baru': 'New supplier',
  'Gudang Baru': 'New warehouse',
  'Akun Baru': 'New account',
  'Penyesuaian Baru': 'New adjustment',
  'Pilih produk dulu untuk melihat kartu stoknya.': 'Select a product first to see its stock card.',
  'Pilih akun dulu untuk melihat kartunya.': 'Select an account first to see its ledger.',
  'Belum ada barang.': 'No goods yet.',
  'Semua item pada SO ini sudah terkirim penuh.': 'All items on this SO have been fully shipped.',
  'Semua item pada PO ini sudah diterima penuh.': 'All items on this PO have been fully received.',

  // ---------- Impor Pesanan Marketplace ----------
  'Impor Pesanan Marketplace': 'Import Marketplace Orders',
  'Unggah file export dari Shopee/TikTok Seller Centre -- ratusan pesanan langsung jadi Sales Order, Surat Jalan, dan Faktur, tanpa input satu-satu.':
    'Upload the export file from Shopee/TikTok Seller Centre -- hundreds of orders become Sales Orders, Delivery Notes, and Invoices at once, no manual entry.',
  'Sumber File': 'File source',
  'File export (.xlsx, .xls, .csv)': 'Export file (.xlsx, .xls, .csv)',
  'Klik untuk pilih file...': 'Click to choose a file...',
  'Membaca file...': 'Reading file...',
  'Cocokkan Kolom': 'Match columns',
  'Ditebak otomatis dari nama kolom di file -- periksa dan ganti kalau ada yang salah/kosong.':
    'Auto-guessed from the file’s column names -- check and change anything wrong or empty.',
  '-- pilih kolom --': '-- select column --',
  '-- tidak dipakai --': '-- not used --',
  pesanan: 'orders',
  'baris item terbaca dari file.': 'item rows read from the file.',
  'Cocokkan Produk': 'Match products',
  'Pencocokan Produk': 'Product matching',
  'Dari File': 'From file',
  'Produk di Katalog': 'Product in catalog',
  'Belum cocok -- pilih manual': 'Not matched -- select manually',
  'Lanjut ke Pratinjau': 'Continue to preview',
  'Pratinjau & Proses': 'Preview & process',
  dipilih: 'selected',
  'Nomor Pesanan': 'Order number',
  Pembeli: 'Buyer',
  Keterangan: 'Note',
  'Sudah pernah diimpor': 'Already imported',
  'Ada produk belum cocok': 'Has unmatched products',
  'Status tidak dikenal': 'Unrecognised status',
  'Status tidak diizinkan': 'Status not allowed',
  'Status di File': 'Status in file',
  'Lolos cek': 'Checks passed',
  '-> Lunas': '-> Paid',
  'Yang statusnya persis "Selesai"/"Completed" (sudah lewat masa retur) otomatis ditandai Lunas. Selain itu tetap jadi piutang, dilunaskan manual lewat Penerimaan Kas saat dana marketplace cair.':
    'Orders with status exactly "Selesai"/"Completed" (past the return window) are auto-marked as Paid. Everything else stays as receivables, settled manually via Cash Receipt once the marketplace payout lands.',
  'Dana Selesai masuk ke akun': 'Completed-order funds go into account',
  'pesanan berstatus Selesai/Completed akan langsung ditandai Lunas ke akun ini.':
    'orders with Selesai/Completed status will be marked Paid into this account right away.',
  'Otomatis tercentang kalau kolom "Status di File" sama persis dengan:':
    'Auto-checked when the "Status in file" column exactly matches:',
  'Selain itu (mis. "Ready to Ship"/masih diproses/dikemas) sengaja TIDAK tercentang -- barangnya belum tentu keluar gudang. Centang manual kalau Anda yakin.':
    'Anything else (e.g. "Ready to Ship"/still processing/packing) is deliberately left unchecked -- the goods may not have left the warehouse yet. Check it manually if you\'re sure.',
  'pesanan berhasil diimpor': 'orders imported successfully',
  gagal: 'failed',
  'Lihat Daftar Faktur': 'View invoice list',
  Impor: 'Import',
  Pesanan: 'Orders',
  'Tidak ada pesanan yang bisa diproses.': 'No orders can be processed.',

  // ---------- Subjudul halaman ----------
  'Pesanan dari canvassing maupun kanal online': 'Orders from canvassing and online channels',
  'Ditagihkan dari satu atau beberapa Surat Jalan': 'Billed from one or more delivery notes',
  'Pembayaran dari pelanggan, dialokasikan ke faktur': 'Customer payments, allocated to invoices',
  'Barang kembali dari pelanggan': 'Goods returned by customers',
  'Pemesanan barang ke supplier': 'Ordering goods from suppliers',
  'Tagihan dari supplier, ditagihkan dari satu atau beberapa Penerimaan Barang':
    'Supplier bills, raised from one or more goods receipts',
  'Pembayaran ke supplier, dialokasikan ke faktur pembelian': 'Payments to suppliers, allocated to purchase invoices',
  'Barang dikembalikan ke supplier': 'Goods returned to suppliers',
  'Saldo persediaan berjalan, dari kartu stok': 'Running inventory balance, from the stock card',
  'Riwayat mutasi dan saldo berjalan per produk': 'Movement history and running balance per product',
  'Riwayat mutasi dan saldo berjalan per akun': 'Movement history and running balance per account',
  'Saldo awal, koreksi hitung fisik, barang rusak/hilang': 'Opening balance, physical count corrections, damaged/lost goods',
  'Lokasi penyimpanan stok': 'Stock storage locations',
  'Sumber barang untuk Purchase Order': 'Goods sources for purchase orders',
  'Data master -- piutang berjalan ada di Laporan Piutang': 'Master data -- outstanding receivables are in the Receivables report',
  'Sisa tagihan pelanggan berdasarkan umur jatuh tempo': 'Customer balances by age of due date',
  'Omzet dikurangi HPP, dari seluruh faktur penjualan': 'Revenue minus COGS, across all sales invoices',
}

interface I18nCtx {
  bahasa: Bahasa
  setBahasa: (b: Bahasa) => void
  t: (kunci: KunciTerjemahan) => string
  /** Terjemahkan teks isi halaman. Kuncinya kalimat Indonesia itu sendiri. */
  tt: (teks: string) => string
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

/**
 * Bahasa aktif juga disimpan di variabel modul supaya `tt()` di bawah bisa
 * dipanggil dari mana saja TANPA hook. Ini dipakai untuk teks yang ada di
 * elemen HTML biasa -- judul `<h1>` dan subjudul `<p>` di tiap halaman --
 * yang tidak lewat komponen bersama seperti Th/Label/Badge.
 *
 * Aman di aplikasi ini karena `I18nProvider` membungkus SELURUH aplikasi:
 * begitu bahasanya diganti, nilai context berubah dan seluruh subtree ikut
 * render ulang, sehingga pemanggilan `tt()` berikutnya langsung memakai
 * bahasa yang baru. Sudah dicek: tidak ada `React.memo` di codebase ini.
 * Kalau suatu saat ada komponen yang di-memo, komponen itu harus ikut
 * berlangganan `useI18n()` supaya teksnya tidak ketinggalan bahasa lama.
 */
let bahasaAktif: Bahasa = bahasaTersimpan()

export function tt(teks: string): string {
  return bahasaAktif === 'en' ? (TEKS[teks] ?? teks) : teks
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [bahasa, setBahasaState] = useState<Bahasa>(bahasaTersimpan)

  function setBahasa(b: Bahasa) {
    bahasaAktif = b // supaya `tt()` versi non-hook ikut berganti
    setBahasaState(b)
    try {
      localStorage.setItem(KUNCI_STORAGE, b)
    } catch {
      // Pilihan bahasa tidak akan diingat lintas sesi -- tidak fatal.
    }
  }

  const t = (kunci: KunciTerjemahan) => KAMUS[kunci][bahasa]
  // Belum ada terjemahannya -> kembalikan teks Indonesia apa adanya, supaya
  // kalimat yang terlewat tetap terbaca, bukan jadi kosong/kunci mentah.
  const terjemah = (teks: string) => (bahasa === 'en' ? (TEKS[teks] ?? teks) : teks)

  return <Ctx.Provider value={{ bahasa, setBahasa, t, tt: terjemah }}>{children}</Ctx.Provider>
}

export function useI18n() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useI18n dipakai di luar <I18nProvider>')
  return ctx
}
