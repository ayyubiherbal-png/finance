-- =====================================================================
-- RESET SEBELUM LIVE -- BUKAN migrasi, JANGAN taruh di folder migrations/
-- dan JANGAN dijalankan sebagai bagian dari urutan migrasi biasa.
--
--  Jalankan file ini SATU KALI SAJA, tepat sebelum aplikasi mulai
--  dipakai sungguhan (setelah semua uji coba selesai) -- BUKAN
--  sekarang, BUKAN berulang.
--
--  INI OPERASI PERMANEN & TIDAK BISA DIBATALKAN. Kalau Anda ingin
--  menyimpan catatan data uji coba (misal untuk referensi), export
--  dulu tabel-tabel di bawah lewat Table Editor -> Export ke CSV
--  SEBELUM menjalankan ini.
--
--  Yang DIHAPUS (semua transaksi & angka hasil transaksi):
--   - Seluruh dokumen transaksi: Sales Order, Surat Jalan, Faktur
--     Penjualan, Penerimaan Kas, Retur Penjualan, Purchase Order,
--     Penerimaan Barang, Faktur Pembelian, Pembayaran Supplier,
--     Retur Pembelian, Penyesuaian Stok, Transfer Gudang -- beserta
--     semua baris item & alokasinya.
--   - Kartu stok (stok_mutasi) dan saldo stok berjalan (stok) --
--     otomatis balik ke kosong untuk semua produk/gudang.
--   - Nomor urut dokumen (dokumen_counter) -- penomoran dokumen baru
--     mulai dari 00001 lagi.
--
--  Yang DIRESET ke 0 (bukan dihapus barisnya, cuma angkanya):
--   - produk.hpp_rata2 (HPP rata-rata bergerak, dihitung ulang
--     otomatis begitu ada transaksi baru).
--   - akun_kas_bank.saldo_awal (diisi ulang manual sesuai saldo kas/
--     bank riil saat mulai pakai sungguhan).
--
--  Yang TETAP UTUH (master data, tidak disentuh sama sekali):
--   - Produk, Kategori Produk, Satuan, Tier Harga, harga jual per
--     produk (produk_harga), satuan berjenjang (produk_satuan).
--   - Pelanggan, Supplier (termasuk 4 akun agregat marketplace).
--   - Gudang, Akun Kas & Bank (cuma saldo_awal-nya yang di-reset).
--   - Wilayah (Provinsi/Kab-Kota/Kecamatan/Kelurahan).
--   - Akun login (profil) -- user & peran tidak berubah.
-- =====================================================================

begin;

truncate table
  stok,
  stok_mutasi,
  penyesuaian_stok_item,
  penyesuaian_stok,
  transfer_gudang_item,
  transfer_gudang,
  sales_order_item,
  surat_jalan_item,
  faktur_penjualan_sj,
  faktur_penjualan_item,
  faktur_penjualan,
  penerimaan_kas_alokasi,
  penerimaan_kas,
  surat_jalan,
  retur_penjualan_item,
  retur_penjualan,
  sales_order,
  purchase_order_item,
  penerimaan_barang_item,
  faktur_pembelian_pb,
  faktur_pembelian_item,
  faktur_pembelian,
  pembayaran_supplier_alokasi,
  pembayaran_supplier,
  penerimaan_barang,
  retur_pembelian_item,
  retur_pembelian,
  purchase_order,
  dokumen_counter
cascade;

update produk set hpp_rata2 = 0;
update akun_kas_bank set saldo_awal = 0;

commit;
