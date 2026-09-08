/**
 * Kamus & fungsi tt() -- SENGAJA dipisah dari i18n.tsx (yang isinya
 * I18nProvider/useI18n, komponen React) ke file .ts murni data ini.
 *
 * Alasan: react-refresh (Fast Refresh Vite) MENOLAK hot-reload file yang
 * mengekspor campuran komponen React DAN fungsi/konstanta biasa dalam satu
 * file yang sama ("tt" export is incompatible). Selama sesi ini, i18n.tsx
 * masih menyatukan keduanya -- akibatnya SETIAP kali kamus TEKS diedit
 * (sering, karena rollout dwibahasa berjalan sepanjang sesi), Vite gagal
 * Fast Refresh dan terpaksa memuat ulang HAMPIR SELURUH modul aplikasi
 * secara paksa ("hmr invalidate" -> "hmr update" untuk puluhan file
 * sekaligus) -- BUKAN reload halaman browser yang bersih. Setelah puluhan
 * kali ini terjadi berturut-turut, user melaporkan fitur lain (drag-scroll
 * tabel) jadi tidak berfungsi di browser mereka -- kode-nya sendiri sudah
 * diverifikasi benar (diuji ulang lewat React.createRoot + simulasi mouse
 * event sungguhan), jadi kemungkinan besar itu state JS yang basi akibat
 * cascade reload berulang ini, bukan bug baru.
 *
 * Dengan `tt`/`TEKS`/`KAMUS` dipindah ke file .ts murni (tanpa satu pun
 * komponen React), mengedit kamus tidak lagi menyentuh file yang
 * mengekspor komponen -- react-refresh bisa hot-reload `i18n.tsx` (dan
 * semua pemakainya) dengan normal, tanpa cascade ke seluruh aplikasi.
 */

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
export const KAMUS = {
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
  'menu.tugasFollowUp': { id: 'Tugas Follow-Up', en: 'Follow-Up Tasks' },
  'menu.riwayatFollowUp': { id: 'Riwayat Follow-Up', en: 'Follow-Up History' },
  'menu.tiket': { id: 'Tiket', en: 'Tickets' },
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
  'dasbor.pelangganAktifPerBulan': { id: 'Pelanggan aktif per bulan', en: 'Active customers per month' },

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
export const TEKS: Record<string, string> = {
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

  // ---------- Impor Pesanan & Pembeli Marketplace lanjutan (2026-09-08) ----------
  // Ditambahkan belakangan karena fitur-fitur ini dibangun di sesi ini --
  // tt() sempat dipasang tanpa entri kamusnya, jadi tampil Indonesia
  // apa adanya walau toggle bahasa di-set EN. Lihat catatan user:
  // "untu bahasan sebagian halaman masih belum bener-benar di terapkan".
  'Ada produk belum cocok, dilewati': 'Has unmatched products, skipped',
  'Alamat -- isi kolom "Alamat Lengkap" SAJA kalau file sudah satu kolom utuh, ATAU isi bagian-bagian di bawah ini kalau file memisahnya (mis. export TikTok Shop). Kosong yang tidak dipakai tidak apa-apa.':
    'Address -- fill in the "Full Address" column ONLY if the file already has one combined column, OR fill in the parts below if the file splits it (e.g. TikTok Shop export). It\'s fine to leave unused ones blank.',
  'Catatan FU': 'Follow-up notes',
  'Diimpor & langsung Lunas': 'Imported & marked Paid right away',
  'Diimpor, jadi piutang': 'Imported, becomes a receivable',
  Edit: 'Edit',
  'Faktur Penjualan': 'Sales Invoice',
  Hapus: 'Delete',
  'Jadikan Pelanggan': 'Make Customer',
  'Jml. Pesanan': 'Orders',
  'Kolom ini kebanyakan berisi angka, bukan nama/username -- kemungkinan salah pilih kolom.':
    "This column is mostly numbers, not a name/username -- you may have picked the wrong column.",
  'Menampilkan segmen': 'Showing segment',
  'Nomor-nomor ini SUDAH pernah diimpor sebelumnya, tapi statusnya di file ini berbeda dari yang tersimpan -- kemungkinan sudah berubah di marketplace (mis. "Dikirim" jadi "Selesai"). Ini TIDAK membuat Faktur baru, cuma memperbarui status yang tersimpan (dan menandai Lunas kalau status barunya jadi Selesai/Completed).':
    'These numbers have ALREADY been imported before, but their status in this file differs from what\'s stored -- it may have changed on the marketplace (e.g. "Dikirim" became "Selesai"). This does NOT create a new Invoice, it only updates the stored status (and marks it Paid if the new status becomes Selesai/Completed).',
  'Pembeli Marketplace': 'Marketplace Buyers',
  Perbarui: 'Update',
  'Perbarui Status Pesanan yang Sudah Diimpor': 'Update Status of Already-Imported Orders',
  'Pesanan Terakhir': 'Last Order',
  'Sales Order': 'Sales Order',
  'Segmentasi otomatis dari riwayat pesanan -- klik segmen untuk menyaring. Bisa diedit & dihapus bebas, tidak memengaruhi Faktur/Surat Jalan yang sudah ada.':
    'Automatic segmentation from order history -- click a segment to filter. Freely editable & deletable, doesn\'t affect existing Invoices/Delivery Notes.',
  'Sinkronkan dari Pesanan': 'Sync from Orders',
  'Status Baru di File': 'New Status in File',
  'Status Marketplace': 'Marketplace Status',
  'Status Tersimpan': 'Stored Status',
  'Status di kolom "Status" adalah status ASLI dari marketplace, apa adanya -- bukan istilah aplikasi ini. Otomatis tercentang kalau statusnya sama persis dengan:':
    'The status in the "Status" column is the marketplace\'s ACTUAL status, as-is -- not this app\'s own terminology. Auto-checked when the status exactly matches:',
  'Status diperbarui & ditandai Lunas': 'Status updated & marked Paid',
  'Status diperbarui, tetap piutang': 'Status updated, still a receivable',
  'Status ini tidak diimpor otomatis -- centang manual kalau yakin': "This status isn't imported automatically -- check it manually if you're sure",
  'Sudah jadi Pelanggan': 'Already a Customer',
  'Sudah pernah diimpor, dilewati': 'Already imported, skipped',
  'Sudah pernah diimpor, statusnya berubah -- lihat bagian "Perbarui Status" di bawah': 'Already imported, status changed -- see the "Update Status" section below',
  'Surat Jalan': 'Delivery Note',
  'Total Belanja': 'Total Spend',
  'Yang statusnya persis "Selesai"/"Completed" (sudah lewat masa retur) otomatis ditandai Lunas. Selain itu tetap jadi piutang, dilunaskan manual lewat Penerimaan Kas saat dana marketplace cair. Status ini ikut tersimpan dan bisa dilihat lagi nanti di Faktur-nya.':
    'Orders with status exactly "Selesai"/"Completed" (past the return window) are auto-marked as Paid. Everything else stays as receivables, settled manually via Cash Receipt once the marketplace payout lands. This status is also saved and can be viewed later on the Invoice.',
  'pesanan yang statusnya diperbarui jadi Selesai/Completed juga akan ditandai Lunas ke akun ini.':
    'orders whose status is updated to Selesai/Completed will also be marked Paid into this account.',
  'status berhasil diperbarui': 'statuses updated successfully',
  'CRM Pelanggan': 'Customer Segments',
  'Segmentasi otomatis dari riwayat belanja -- klik segmen untuk menyaring':
    'Automatic segmentation from purchase history -- click a segment to filter',
  '3+ transaksi, masih aktif belanja': '3+ orders, still actively buying',
  '2 transaksi, masih aktif belanja': '2 orders, still actively buying',
  'Baru 1x belanja': 'Bought once so far',
  '2-4 bulan tidak belanja -- perlu dihubungi': "2-4 months without an order -- needs a follow-up",
  'Lebih dari 4 bulan tidak belanja': 'More than 4 months without an order',
  'Terdaftar tapi belum pernah belanja': 'Registered but never ordered',
  'Dibuat dari Sales Order yang sudah disetujui. Untuk membuat baru, buka SO-nya dan klik "Buat Surat Jalan". Centang beberapa baris untuk mencetak banyak label pengiriman sekaligus.':
    'Created from an approved Sales Order. To create a new one, open the SO and click "Create Delivery Note". Check several rows to print multiple shipping labels at once.',

  // ---------- Sapuan menyeluruh SEMUA halaman (2026-09-08) ----------
  // User: "cek juga semua halaman. semuanya yang belum bisa". Disisir lewat
  // script: judul halaman, teks bantuan, pesan konfirmasi/error/toast, dan
  // placeholder di 49 halaman. Halaman CETAK (Invoice/Label) sengaja TIDAK
  // ikut -- itu untuk pembeli/kurir Indonesia, lihat catatan di atas.

  // Judul halaman & form
  'Kas & Bank': 'Cash & Bank',
  'Kartu Kas & Bank': 'Cash & Bank Ledger',
  'Kartu Stok': 'Stock Card',
  'Stok per Gudang': 'Stock by Warehouse',
  'Penjualan Cepat': 'Quick Sale',
  'Penerimaan Kas': 'Cash Receipt',
  'Penerimaan Barang': 'Goods Receipt',
  'Penerimaan Barang Baru': 'New Goods Receipt',
  'Purchase Order': 'Purchase Order',
  'Purchase Order Baru': 'New Purchase Order',
  'Pembayaran Supplier': 'Supplier Payment',
  'Faktur Pembelian': 'Purchase Invoice',
  'Faktur Pembelian Baru': 'New Purchase Invoice',
  'Faktur Penjualan Baru': 'New Sales Invoice',
  'Sales Order Baru': 'New Sales Order',
  'Surat Jalan Baru': 'New Delivery Note',
  'Retur Penjualan': 'Sales Return',
  'Retur Penjualan Baru': 'New Sales Return',
  'Retur Pembelian': 'Purchase Return',
  'Retur Pembelian Baru': 'New Purchase Return',
  'Penyesuaian Stok': 'Stock Adjustment',
  'Penyesuaian Stok Baru': 'New Stock Adjustment',
  'Laporan Omzet': 'Revenue Report',
  'Laporan Piutang': 'Receivables Report',
  'Laporan Laba Kotor': 'Gross Profit Report',

  // Label & potongan teks pendek
  'Saldo berjalan': 'Running balance',
  Terbayar: 'Paid',
  'HPP rata-rata': 'Average COGS',
  '(satuan dasar)': '(base unit)',
  Nonaktif: 'Inactive',
  Utama: 'Main',
  Wilayah: 'Region',
  QRIS: 'QRIS',
  'Faktur lewat jatuh tempo': 'Overdue invoices',
  'Total saldo (akun aktif):': 'Total balance (active accounts):',
  'Total nilai persediaan:': 'Total inventory value:',
  'Dari PO': 'From PO',
  'Dari SO': 'From SO',
  'Layar ini belum dibangun': "This screen isn't built yet",
  'Tidak ada pembeli yang cocok.': 'No matching buyers.',
  'Belum ada data. Klik': 'No data yet. Click',
  'belum ditekan Tambah': 'Add not pressed yet',
  'Baris di atas belum ditekan': "The row above hasn't been added with",
  'tapi tetap akan ikut diproses. Klik': 'yet, but it will still be processed. Click',

  // Teks bantuan / penjelasan di halaman
  'Setiap Penerimaan Kas dan Pembayaran Supplier tertaut ke salah satu akun ini':
    'Every Cash Receipt and Supplier Payment is linked to one of these accounts',
  'Saldo dihitung ulang otomatis (saldo awal + semua transaksi), jadi mengubah ini langsung mengubah saldo berjalan di kanan atas -- pakai kalau ada salah input di awal, bukan buat "menambah" saldo.':
    'The balance is recalculated automatically (opening balance + all transactions), so changing this directly changes the running balance shown top-right -- use it to fix a wrong initial entry, not to "top up" the balance.',
  'Dipakai di kop dokumen cetak (Invoice, dll.) untuk gudang utama.': 'Used in the letterhead of printed documents (Invoice, etc.) for the main warehouse.',
  'Stok lintas gudang dan nilai persediaan berdasarkan HPP rata-rata': 'Stock across warehouses and inventory value based on average COGS',
  'Omzet & laba kotor dari seluruh Faktur Penjualan (di luar yang dibatalkan), dikelompokkan per periode':
    'Revenue & gross profit from all Sales Invoices (excluding cancelled ones), grouped by period',
  'Barang langsung diserahkan & dibayar. Sistem otomatis membuat Sales Order, Surat Jalan, Faktur, dan Penerimaan Kas sekaligus.':
    'Goods handed over & paid on the spot. The system automatically creates the Sales Order, Delivery Note, Invoice, and Cash Receipt all at once.',
  'Fakturnya akan tercatat sebagai piutang. Pembayarannya dicatat nanti lewat menu Penerimaan Kas.':
    'The invoice will be recorded as a receivable. Payment is recorded later via the Cash Receipt menu.',
  'Item produk ditambahkan setelah draf tersimpan.': 'Product items are added after the draft is saved.',
  'Belum ada akun kas/bank. Tambahkan dulu di menu Kas & Bank.': 'No cash/bank account yet. Add one from the Cash & Bank menu first.',
  'Penerimaan Barang dibuat dari Purchase Order': 'Goods Receipts are created from a Purchase Order',
  'Buka daftar Purchase Order, pilih yang berstatus "Disetujui", lalu klik "Buat Penerimaan Barang".':
    'Open the Purchase Order list, pick one with "Approved" status, then click "Create Goods Receipt".',
  'Dibuat dari Purchase Order yang sudah disetujui. Untuk membuat baru, buka PO-nya dan klik "Buat Penerimaan Barang".':
    'Created from an approved Purchase Order. To create a new one, open the PO and click "Create Goods Receipt".',
  'Dibagi proporsional ke tiap produk dan ikut masuk perhitungan HPP.': 'Split proportionally across products and included in the COGS calculation.',
  '"Terima Sekarang" langsung menambah stok gudang': '"Receive Now" immediately adds stock to warehouse',
  'dan menghitung ulang HPP.': 'and recalculates COGS.',
  'Surat Jalan dibuat dari Sales Order': 'Delivery Notes are created from a Sales Order',
  'Buka daftar Sales Order, pilih yang berstatus "Disetujui", lalu klik "Buat Surat Jalan".':
    'Open the Sales Order list, pick one with "Approved" status, then click "Create Delivery Note".',
  '"Kirim Sekarang" langsung mengurangi stok gudang': '"Ship Now" immediately reduces stock from warehouse',
  'Terisi otomatis ke akun agregat kanal ini. Ganti kalau pembeli sudah punya data pelanggan sendiri.':
    "Auto-filled to this channel's aggregate account. Change it if the buyer already has their own customer record.",
  'Kode awal dipakai sebagai awalan SKU produk di kategori ini, mis. "MKR" jadi MKR-001.':
    'The prefix is used as the SKU prefix for products in this category, e.g. "MKR" becomes MKR-001.',
  'Satuan terkecil untuk stok & HPP, mis. PCS. Satuan lain (LUSIN, DUS) ditambahkan setelah produk tersimpan.':
    'Smallest unit for stock & COGS, e.g. PCS. Other units (DOZEN, BOX) are added after the product is saved.',
  'Tidak bisa diubah setelah produk dibuat -- konversi transaksi lama bergantung pada satuan ini.':
    'Cannot be changed after the product is created -- conversions on past transactions depend on this unit.',
  'Isi min. qty lebih dari 1 untuk diskon bertingkat (mis. beli 12+ dapat harga lebih murah).':
    'Set min. qty above 1 for tiered discounts (e.g. buy 12+ for a lower price).',
  'Qty positif menambah stok (HPP ikut bergerak kalau diisi). Qty negatif mengurangi stok (mis. rusak/hilang), HPP tidak berlaku.':
    'Positive qty adds stock (COGS moves too if filled in). Negative qty reduces stock (e.g. damaged/lost); COGS does not apply.',
  'Diisi otomatis dari data Pembeli Marketplace -- periksa dulu, lengkapi wilayah/tier harga kalau perlu, lalu Simpan.':
    'Auto-filled from Marketplace Buyer data -- review it first, complete the region/price tier if needed, then Save.',

  // Konfirmasi (window.confirm) & pesan
  'Batalkan faktur ini? Hanya bisa kalau belum ada pembayaran tercatat.': 'Cancel this invoice? Only possible if no payment has been recorded yet.',
  'Batalkan pembayaran ini? Sisa tagihan di faktur terkait akan naik lagi.':
    'Cancel this payment? The outstanding balance on the related invoices will go back up.',
  'Batalkan penerimaan kas ini? Sisa tagihan di faktur terkait akan naik lagi.':
    'Cancel this cash receipt? The outstanding balance on the related invoices will go back up.',
  'Batalkan Penerimaan Barang ini? Stok yang sudah masuk akan dikurangi lagi.':
    'Cancel this goods receipt? The stock already added will be deducted again.',
  'Batalkan Surat Jalan ini? Stok yang sudah terkirim akan dikembalikan.': 'Cancel this delivery note? The stock already shipped will be returned.',
  'Batalkan penyesuaian ini? Efek stoknya akan dibalik.': 'Cancel this adjustment? Its stock effect will be reversed.',
  'Batalkan retur ini? Efek stoknya akan dibalik.': 'Cancel this return? Its stock effect will be reversed.',
  'Batalkan Purchase Order ini?': 'Cancel this purchase order?',
  'Batalkan Sales Order ini?': 'Cancel this sales order?',
  'Hapus baris ini?': 'Delete this row?',
  'Hapus baris ini dari Purchase Order?': 'Delete this row from the purchase order?',
  'Hapus baris ini dari Sales Order?': 'Delete this row from the sales order?',
  'Hapus satuan ini?': 'Delete this unit?',
  'Hapus aturan harga ini?': 'Delete this price rule?',
  'Hapus {nama} dari daftar ini? Data pesanan/Faktur asli TIDAK ikut terhapus, ini cuma daftar follow-up.':
    'Remove {nama} from this list? The original order/Invoice data is NOT deleted -- this is only a follow-up list.',
  'ID "{kode}" sudah dipakai pelanggan lain. Pakai ID yang berbeda.': 'ID "{kode}" is already used by another customer. Use a different ID.',
  'Kode "{kode}" sudah dipakai kategori lain.': 'Code "{kode}" is already used by another category.',
  'Pelanggan tersimpan, tapi gagal menandai baris Pembeli Marketplace: {pesan}':
    'Customer saved, but marking the Marketplace Buyer row failed: {pesan}',
  'Sinkronisasi selesai -- {n} baris ditambah/diperbarui.': 'Sync complete -- {n} rows added/updated.',
  '{n} pesanan berhasil diimpor.': '{n} orders imported successfully.',
  '{n} status pesanan berhasil diperbarui.': '{n} order statuses updated successfully.',

  // Placeholder
  'Pilih produk...': 'Select product...',
  'Nama asli...': 'Real name...',
  'Alamat...': 'Address...',
  'Cari nama, telepon, catatan...': 'Search name, phone, notes...',
  'mis. sudah dihubungi...': 'e.g. already contacted...',
  'untuk memastikan sebelum menambah barang lain.': 'to confirm it before adding another item.',
  'Draf retur tersimpan, {n} item dari faktur ikut dimuat. Hapus/sesuaikan yang tidak diretur.':
    'Return draft saved, {n} items loaded from the invoice. Delete/adjust the ones not being returned.',
  '{n} item dari faktur dimuat.': '{n} items loaded from the invoice.',
  'Semua item faktur sudah ada di retur ini.': 'All invoice items are already in this return.',

  // ---------- Pesan validasi (new Error -> tampil lewat <PesanError>) ----------
  // `PesanError` menerjemahkan pesannya saat render, jadi pesan buatan sendiri
  // di sini ikut berganti bahasa; error teknis dari Supabase (Inggris) lewat
  // apa adanya karena tidak ada entrinya.
  'Kode dan nama wajib diisi.': 'Code and name are required.',
  'Kode, nama, dan satuan dasar wajib diisi.': 'Code, name, and base unit are required.',
  'Nama dan kode awal kategori wajib diisi.': 'Category name and prefix code are required.',
  'Lengkapi tier, satuan, dan harga.': 'Fill in the tier, unit, and price.',
  'Satuan dasar tidak bisa dihapus.': 'The base unit cannot be deleted.',
  'Pilih satuan dan isi konversi lebih dari 0.': 'Pick a unit and enter a conversion greater than 0.',
  'Pilih pelanggan dulu.': 'Pick a customer first.',
  'Pilih supplier dulu.': 'Pick a supplier first.',
  'Pilih pelanggan dan gudang dulu.': 'Pick a customer and warehouse first.',
  'Pilih supplier dan gudang dulu.': 'Pick a supplier and warehouse first.',
  'Pilih pelanggan dan minimal satu Surat Jalan.': 'Pick a customer and at least one delivery note.',
  'Pilih supplier dan minimal satu Penerimaan Barang.': 'Pick a supplier and at least one goods receipt.',
  'Pilih pelanggan dan minimal satu faktur dengan jumlah bayar lebih dari 0.':
    'Pick a customer and at least one invoice with a payment amount greater than 0.',
  'Pilih supplier dan minimal satu faktur dengan jumlah bayar lebih dari 0.':
    'Pick a supplier and at least one invoice with a payment amount greater than 0.',
  'Pilih akun kas/bank sumber pembayaran ini.': 'Pick the cash/bank account this payment comes from.',
  'Pilih akun kas/bank tujuan pembayaran ini.': 'Pick the cash/bank account this payment goes into.',
  'Pilih akun kas/bank tujuan pembayaran.': 'Pick the destination cash/bank account for the payment.',
  'Pilih produk, satuan, dan isi qty lebih dari 0.': 'Pick a product and unit, and enter a qty greater than 0.',
  'Pilih produk, satuan, dan isi qty (tidak boleh 0).': 'Pick a product and unit, and enter a qty (cannot be 0).',
  'Saldo awal dengan qty positif wajib mengisi HPP per satuan dasar.': 'An opening balance with positive qty must include the COGS per base unit.',
  'Belum ada barang yang ditambahkan.': 'No items have been added yet.',
  'Belum ada gudang aktif.': 'No active warehouse yet.',
  'Belum ada gudang aktif. Tambahkan gudang di master data dulu.': 'No active warehouse yet. Add one in master data first.',
  'Isi jumlah kirim minimal satu produk.': 'Enter a shipping quantity for at least one product.',
  'Isi jumlah terima minimal satu produk.': 'Enter a receiving quantity for at least one product.',
  'Tidak ada Surat Jalan yang dipilih.': 'No delivery note selected.',
  'File kosong atau formatnya tidak terbaca.': 'The file is empty or its format could not be read.',
  'Akun agregat marketplace untuk kanal ini tidak ditemukan di master Pelanggan.':
    "This channel's marketplace aggregate account was not found in the Customer master data.",
  'Ada pesanan berstatus Selesai/Completed yang akan ditandai Lunas -- pilih akun kas/bank tujuannya dulu.':
    'Some orders with Selesai/Completed status will be marked Paid -- pick the destination cash/bank account first.',
  'Ada pesanan yang statusnya berubah jadi Selesai/Completed dan akan ditandai Lunas -- pilih akun kas/bank tujuannya dulu.':
    'Some orders changed to Selesai/Completed and will be marked Paid -- pick the destination cash/bank account first.',

  // ---------- Tugas Follow-Up -- Fase 2 framework CRM (2026-09-08) ----------
  'Tugas Follow-Up': 'Follow-Up Tasks',
  'Disusun otomatis tiap hari dari riwayat transaksi -- tinggal ditinjau, klik Chat untuk kirim manual. Bukan pengiriman otomatis (lihat catatan di framework CRM).':
    "Compiled automatically every day from transaction history -- just review it and click Chat to send manually. This doesn't send automatically (see the note in the CRM framework).",
  'Sapa Pembeli Baru': 'Greet New Buyer',
  'Baru Jadi Setia': 'Just Became Loyal',
  'Baru Jadi Juara': 'Just Became Champion',
  'Berisiko Tidur': 'At Risk of Dormant',
  'Siap Dijadikan Pelanggan': 'Ready to Become a Customer',
  'Baru 1x transaksi -- saatnya menyapa & edukasi pemakaian': 'Just 1 order so far -- time to say hi & explain how to use it',
  'Baru saja order ke-2 -- ucapkan terima kasih': 'Just placed their 2nd order -- say thank you',
  'Baru saja order ke-3 -- buka jalur referral': 'Just placed their 3rd order -- open a referral opportunity',
  'Baru lewat 60 hari tanpa order -- check-in ringan': "Just passed 60 days with no order -- a light check-in",
  'Baru lewat 120 hari tanpa order -- coba tarik balik': 'Just passed 120 days with no order -- try to win them back',
  'Data marketplace sudah lengkap, siap dipindah ke Master Data': 'Marketplace data is complete, ready to move to master data',
  Menampilkan: 'Showing',
  Konteks: 'Context',
  'Tandai Selesai': 'Mark Done',
  'Catatan hasil FU (opsional)...': 'Follow-up outcome notes (optional)...',
  'Ditandai selesai.': 'Marked as done.',
  'Riwayat Follow-Up': 'Follow-Up History',
  'Catatan tugas follow-up yang sudah ditandai selesai -- siapa, kapan, dan hasilnya apa.':
    'Log of follow-up tasks marked done -- who, when, and the outcome.',
  'Belum ada follow-up yang ditandai selesai.': 'No follow-ups marked done yet.',
  'Diselesaikan oleh': 'Completed by',

  // ---------- Tiket (0031, fitur #3 "Kerjakan berurut") ----------
  'Tiket': 'Tickets',
  'Lacak komplain, pertanyaan, dan retur pelanggan sampai tuntas': 'Track customer complaints, questions, and returns through to resolution',
  'Tiket Baru': 'New Ticket',
  'Cari nomor atau judul tiket...': 'Search ticket number or title...',
  'Belum ada tiket.': 'No tickets yet.',
  'Judul': 'Title',
  'Prioritas': 'Priority',
  'Ditugaskan ke': 'Assigned to',
  'Terbuka': 'Open',
  'Diproses': 'In Progress',
  'Rendah': 'Low',
  'Sedang': 'Medium',
  'Tinggi': 'High',
  'Judul tiket wajib diisi.': 'Ticket title is required.',
  'Tiket tersimpan.': 'Ticket saved.',
  'Faktur terkait (opsional)': 'Related invoice (optional)',
  'Pilih pelanggan dulu': 'Pick a customer first',
  'Ringkasan singkat keluhan/permintaan': 'Brief summary of the complaint/request',
  'Deskripsi': 'Description',
  'Belum ditugaskan': 'Unassigned',

  // ---------- Riwayat catatan (0032, fitur #4 "Kerjakan berurut") ----------
  'Riwayat catatan': 'Note history',
  'Belum ada riwayat.': 'No history yet.',

  // ---------- Tahapan Treatment FU (0034, ganti "Aturan Jendela FU" 0033) ----------
  'Tahapan Treatment': 'Follow-Up Treatment Stages',
  'Titik sentuh (H+N) dan pesan WA per kategori -- satu kategori bisa punya beberapa tahap. Cuma admin/owner yang boleh mengubah.':
    'Touchpoints (Day+N) and WA message per category -- one category can have several stages. Only admins/owners may change this.',
  'Tambah Tahap': 'Add Stage',
  'Belum ada tahap di kategori ini.': 'No stages in this category yet.',
  'Halaman ini cuma bisa diubah oleh admin/owner.': 'This page can only be changed by admins/owners.',
  Label: 'Label',
  Hari: 'Day',
  Pesan: 'Message',
  Tahap: 'Stage',
  'Hari minimum': 'Minimum day',
  'Hari maksimum': 'Maximum day',
  'Pesan WA': 'WA message',
  'Tahap tersimpan.': 'Stage saved.',
  'Tahap ditambahkan.': 'Stage added.',
  'Tahap dihapus.': 'Stage deleted.',

  // ---------- Kategori Ulang Tahun (0036) ----------
  'Ulang Tahun': 'Birthday',
  'Hari ulang tahun pelanggan -- ucapkan & tawarkan promo (0036)': "Customer's birthday -- greet them & offer a promo",
  'Tanpa nomor': 'No number',
  'Tidak ada tugas follow-up hari ini. Cek lagi besok.': 'No follow-up tasks today. Check again tomorrow.',
  'Tidak ada tugas di kategori ini.': 'No tasks in this category.',

  // ===================================================================
  // Sisir menyeluruh dwibahasa (2026-09-08) -- hasil audit AST seluruh
  // src/: setiap teks yang lewat jalur terjemahan tapi BELUM punya
  // padanan Inggris (diam-diam jatuh balik ke Indonesia saat mode EN).
  // Lihat catatan di supabase/README.md.
  // ===================================================================

  // ---------- Judul kartu & bagian form ----------
  Item: 'Items',
  Detail: 'Details',
  'Detail Order': 'Order Details',
  'Harga Jual': 'Selling Price',
  'Item dikirim': 'Items shipped',
  'Item diterima': 'Items received',
  'Barang yang dikirim': 'Goods to ship',
  'Barang yang diterima': 'Goods received',
  'Dialokasikan ke faktur': 'Allocated to invoices',
  'Produk favorit': 'Favourite products',
  'Riwayat transaksi': 'Transaction history',
  'Riwayat tahap Follow-Up': 'Follow-Up stage history',
  '1. Pembeli': '1. Buyer',
  '2. Barang': '2. Items',
  '3. Pembayaran': '3. Payment',
  'Akun Kas/Bank Baru': 'New Cash/Bank Account',

  // ---------- Label ringkas / info dokumen ----------
  'Jumlah transaksi': 'Transaction count',
  'Rata-rata belanja': 'Average spend',
  'Pelanggan sejak': 'Customer since',
  'Muncul pertama': 'First appeared',
  'Belum ditandai selesai': 'Not marked done',
  Ekspedisi: 'Courier',
  Sopir: 'Driver',
  'No. kendaraan': 'Vehicle no.',
  'No. referensi': 'Reference no.',
  'Biaya tambahan': 'Additional cost',
  'Perkiraan kirim': 'Estimated delivery',
  'Margin keseluruhan': 'Overall margin',
  'Konversi ke': 'Conversion to',
  dasar: 'base',
  '(wajib)': '(required)',
  '(opsional)': '(optional)',
  Menagih: 'Billing',
  Per: 'Per',
  's/d': 'to',
  'hari lalu': 'days ago',
  sisa: 'remaining',
  'dari faktur': 'from invoice',
  'barang tidak masuk stok': 'goods not returned to stock',

  // ---------- Kata satuan di footer daftar ----------
  faktur: 'invoices',
  tiket: 'tickets',
  retur: 'returns',
  penerimaan: 'receipts',
  SO: 'SOs',
  'Total 100 faktur teratas yang tampil': 'Showing top 100 invoices',
  'Total 100 tiket teratas yang tampil': 'Showing top 100 tickets',
  'Total 100 retur teratas yang tampil': 'Showing top 100 returns',
  'Total 100 penerimaan teratas yang tampil': 'Showing top 100 receipts',
  'Total 100 SO teratas yang tampil': 'Showing top 100 sales orders',

  // ---------- Tombol lanjutan antar-dokumen ----------
  'Ke Purchase Order': 'To Purchase Order',
  'Ke Sales Order': 'To Sales Order',
  'Buat Penerimaan Barang': 'Create Goods Receipt',
  'Buat Surat Jalan': 'Create Delivery Note',
  'Lanjut ke Faktur': 'Continue to Invoice',
  'Lanjut ke Faktur Pembelian': 'Continue to Purchase Invoice',
  'Muat Item dari Faktur': 'Load Items from Invoice',

  // ---------- Pesan toast perubahan status dokumen ----------
  'Sales Order disetujui.': 'Sales Order approved.',
  'Sales Order dibuka lagi.': 'Sales Order reopened.',
  'Sales Order dibatalkan.': 'Sales Order cancelled.',
  'Purchase Order disetujui.': 'Purchase Order approved.',
  'Purchase Order dibuka lagi.': 'Purchase Order reopened.',
  'Purchase Order dibatalkan.': 'Purchase Order cancelled.',
  'Surat Jalan terkirim.': 'Delivery Note shipped.',
  'Surat Jalan diselesaikan.': 'Delivery Note completed.',
  'Surat Jalan dibatalkan.': 'Delivery Note cancelled.',
  'Draf Surat Jalan tersimpan.': 'Delivery Note draft saved.',
  'Barang diterima.': 'Goods received.',
  'Draf Penerimaan Barang tersimpan.': 'Goods Receipt draft saved.',
  'Penerimaan Barang diselesaikan.': 'Goods Receipt completed.',
  'Penerimaan Barang dibatalkan.': 'Goods Receipt cancelled.',
  'Penyesuaian diposting.': 'Adjustment posted.',
  'Penyesuaian dibatalkan.': 'Adjustment cancelled.',
  'Retur diposting.': 'Return posted.',
  'Retur dibatalkan.': 'Return cancelled.',
  'Penjualan selesai. Surat Jalan, Faktur, dan pembayarannya sudah tercatat.':
    'Sale completed. Delivery Note, Invoice, and payment have all been recorded.',
  'Penjualan tercatat sebagai piutang. Faktur sudah dibuat.': 'Sale recorded as a receivable. Invoice has been created.',

  // ---------- Validasi & placeholder Tahapan Treatment ----------
  'Label tahap wajib diisi.': 'Stage label is required.',
  'Pesan tahap wajib diisi.': 'Stage message is required.',
  'Hari maksimum tidak boleh kurang dari hari minimum.': 'Maximum day cannot be less than minimum day.',
  'mis. Sapa H+1': 'e.g. Greet Day+1',
  'Gunakan {nama} untuk menyisipkan nama pembeli/pelanggan': 'Use {nama} to insert the buyer/customer name',

  // ---------- Kondisi kosong & keterangan panjang ----------
  'Belum ada data penjualan.': 'No sales data yet.',
  'Belum ada tahap FU yang tercatat untuk pelanggan ini.': 'No follow-up stages recorded for this customer yet.',
  'Belum ada aturan harga. Tanpa ini, produk tidak akan muncul harganya otomatis di Sales Order.':
    'No price rules yet. Without them, this product will not get an automatic price in Sales Orders.',
  'Belum ada data. Klik "Sinkronkan dari Pesanan" untuk menarik pembeli dari pesanan Shopee/TikTok yang sudah diimpor.':
    'No data yet. Click "Sync from Orders" to pull buyers from the Shopee/TikTok orders you have imported.',
  'Semua tahap treatment yang pernah muncul untuk pelanggan ini, terlepas apakah sempat ditandai selesai.':
    'Every treatment stage that has ever appeared for this customer, whether or not it was marked done.',
  'Tabel dan trigger di database sudah siap; tinggal antarmukanya.': 'The database tables and triggers are ready; only the interface is left.',
  'Kosongkan kalau sama dengan telepon': 'Leave blank if same as phone',
  'Barang kembali ke stok (matikan kalau barang rusak/dimusnahkan)': 'Return goods to stock (turn off if damaged/destroyed)',
  'Catatan: 97% pembeli TikTok cuma belanja sekali (wajar untuk trafik iklan). Kalau ada "pesanan" berdekatan cuma 1-2 hari dari pembeli yang sama, itu kemungkinan besar SATU checkout yang dipecah platform jadi beberapa nomor pesanan -- bukan bukti kunjungan ulang yang asli.':
    'Note: 97% of TikTok buyers order only once (normal for ad traffic). If one buyer has "orders" only 1-2 days apart, that is most likely ONE checkout split by the platform into several order numbers -- not a genuine repeat visit.',

  // ---------- Nilai konstanta label (LABEL_*/INFO_*) ----------
  // Nilainya tidak terlihat sebagai literal di JSX (dipakai lewat
  // LABEL_X[baris.kolom]), jadi sempat luput dari sisir sebelumnya.
  'Semua tanggal': 'All dates',
  'Hari ini': 'Today',
  Kemarin: 'Yesterday',
  'Minggu ini': 'This week',
  'Minggu lalu': 'Last week',
  'Bulan ini': 'This month',
  'Bulan lalu': 'Last month',
  'Tanggal custom...': 'Custom date...',
  'Per Bulan': 'Monthly',
  'Per Kuartal': 'Quarterly',
  'Per Tahun': 'Yearly',
  Kas: 'Cash',
  Sebagian: 'Partial',
  'Saldo Awal': 'Opening balance',
  Pembelian: 'Purchase',
  Penjualan: 'Sale',
  Penyesuaian: 'Adjustment',
  'Transfer Masuk': 'Transfer in',
  'Transfer Keluar': 'Transfer out',
  Mitra: 'Partner',
  Horeka: 'HoReCa',
  Perusahaan: 'Company',
  Relasi: 'Referral',
  Sosmed: 'Social media',
  Website: 'Website',
  Custom: 'Custom',
  'Custom...': 'Custom...',
  // Nama bulan singkat -- dipakai sebagai label sumbu grafik
  Mei: 'May',
  Agu: 'Aug',
  Okt: 'Oct',
  Des: 'Dec',
  // Sama persis di kedua bahasa (merek/istilah), didaftarkan eksplisit
  // supaya `npm run cek:bahasa` tidak terus melaporkannya sebagai celah.
  Jan: 'Jan',
  Feb: 'Feb',
  Mar: 'Mar',
  Apr: 'Apr',
  Jun: 'Jun',
  Jul: 'Jul',
  Sep: 'Sep',
  Nov: 'Nov',
  Customer: 'Customer',
  Tokopedia: 'Tokopedia',
  Shopee: 'Shopee',
  TikTok: 'TikTok',
  'TikTok Shop': 'TikTok Shop',

  // ---------- Nomor resi Surat Jalan (0038) ----------
  'No. resi (opsional, bisa diisi belakangan)': 'Tracking no. (optional, can be filled in later)',
  'Isi kalau sudah dapat dari kurir': 'Fill in once you get it from the courier',
  'No. resi tersimpan.': 'Tracking number saved.',
  'No. resi': 'Tracking no.',
  'Belum diisi': 'Not filled in yet',

  // ---------- Tingkat Follow-Up Selesai (0039) ----------
  'Tingkat Selesai Keseluruhan': 'Overall Completion Rate',
  tugas: 'tasks',

  // ---------- Konfirmasi order H+0 (celah customer journey #3) ----------
  'Kirim Konfirmasi': 'Send Confirmation',

  // ---------- Poin Loyalitas (0040, celah customer journey #4) ----------
  'Poin Loyalitas': 'Loyalty Points',
  '1 poin per Rp10.000 belanja, diberikan begitu faktur lunas.': '1 point per Rp10,000 spent, awarded once the invoice is paid in full.',
  'Tukar poin': 'Redeem points',
  'mis. Potongan pembelian, hadiah': 'e.g. Purchase discount, gift',
  Tukar: 'Redeem',
  'Belum ada riwayat poin.': 'No points history yet.',
  Perubahan: 'Change',
  'Jumlah poin harus lebih dari 0.': 'Point amount must be greater than 0.',
  'Poin berhasil ditukar.': 'Points redeemed successfully.',
}


export const KUNCI_STORAGE = 'ayyubi-bahasa'

export function bahasaTersimpan(): Bahasa {
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

export function setBahasaAktif(b: Bahasa): void {
  bahasaAktif = b
}

export function tt(teks: string): string {
  return bahasaAktif === 'en' ? (TEKS[teks] ?? teks) : teks
}
