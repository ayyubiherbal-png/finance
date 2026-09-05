-- =====================================================================
-- 0017  Sales Order -- kolom telepon penerima (pasangan nama_penerima)
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  User: pilih Pelanggan di Sales Order, alamat & nomor HP tidak
--  terisi otomatis. Alamat kirim sudah punya kolomnya (`alamat_kirim`),
--  dibiarkan seperti itu, cuma diisi otomatis di frontend saat pilih
--  pelanggan. Nomor HP belum punya kolom sama sekali -- ditambah
--  `telepon_penerima`, pasangan `nama_penerima` (kolom yang sudah ada,
--  dipakai kalau penerima beda dari nama akun pelanggan, mis. pesanan
--  marketplace) -- alasan yang sama berlaku untuk nomor HP.
-- =====================================================================

alter table sales_order add column if not exists telepon_penerima text;
