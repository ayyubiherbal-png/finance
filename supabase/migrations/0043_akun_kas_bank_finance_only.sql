-- =====================================================================
-- 0043  Kas & Bank: baca dibatasi ke finance/owner/admin
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Temuan audit keamanan pre-launch: policy `baca` di akun_kas_bank
--  (0010) tadinya `user_aktif()` -- semua peran (termasuk sales/gudang)
--  bisa lihat daftar akun kas/bank BESERTA saldonya. Sekarang dibatasi
--  ke `boleh_finance()` (owner/admin/finance saja).
--
--  Cukup ubah policy di tabel akun_kas_bank -- v_saldo_kas_bank dan
--  v_kartu_kas_bank (0010) dibuat dengan `security_invoker = true` dan
--  JOIN ke akun_kas_bank, jadi begitu peran non-finance kehilangan akses
--  baca ke akun_kas_bank, kedua view itu otomatis ikut kosong buat
--  mereka tanpa perlu diubah sendiri.
-- =====================================================================

drop policy if exists baca on akun_kas_bank;
create policy baca on akun_kas_bank
  for select to authenticated using (boleh_finance());
