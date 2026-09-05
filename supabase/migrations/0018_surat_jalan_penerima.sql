-- =====================================================================
-- 0018  Surat Jalan -- ikutkan nama & telepon penerima dari SO
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  User: "semua data yang ada di master data itu, ketika di orderan...
--  mestinya kalau datanya diambil ikut semua dong, disesuaikan dengan
--  data apa yang perlu diambil." Surat Jalan sudah ikut alamat_kirim
--  dari SO (sejak awal), tapi TIDAK ikut nama_penerima/telepon_penerima
--  (baru ditambah ke Sales Order di 0017) -- padahal ini persis yang
--  dibutuhkan sopir/kurir saat mengantar barang (tahu harus serahkan ke
--  siapa & bisa hubungi siapa). Diaudit form transaksi lain (Purchase
--  Order, Faktur, Penerimaan Kas/Barang, Pembayaran Supplier, Retur) --
--  semuanya sudah mengambil SEMUA field master yang relevan untuk
--  konteksnya masing-masing (PO cuma perlu termin_hari supplier, Faktur/
--  pembayaran cuma perlu daftar dokumen outstanding, dst.), jadi cuma
--  Surat Jalan yang perlu ditambal.
-- =====================================================================

alter table surat_jalan
  add column if not exists nama_penerima text,
  add column if not exists telepon_penerima text;
