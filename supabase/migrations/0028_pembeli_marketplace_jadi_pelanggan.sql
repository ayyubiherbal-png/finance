-- =====================================================================
-- 0028  Pembeli Marketplace -- tautan ke Pelanggan setelah "dipromosikan"
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  User: "saya ingin agar bisa memindahkan marketplace buyer yang
--  sekiranya sudah lengkap nomor HP dan alamat ke Master Data. agar
--  kedepannya transaksi bisa dipindahkan melalui WA."
--
--  Desain yang disepakati (dibahas dulu sebelum dibuat):
--  1. TIDAK membuat jalur insert baru ke `pelanggan` -- form "Pelanggan
--     Baru" yang sudah ada dipakai ulang (sudah teruji, sudah menangani
--     kode unik/wilayah/dst.), cuma dipre-isi dari data Pembeli
--     Marketplace lewat `location.state` react-router (murni frontend,
--     tidak ada RPC baru untuk pembuatan pelanggannya sendiri).
--  2. Riwayat transaksi LAMA (Sales Order/Faktur di bawah akun agregat
--     marketplace) SENGAJA TIDAK dipindah/diketik ulang ke pelanggan_id
--     baru -- itu data keuangan yang sudah final, mengubahnya berisiko
--     dan tidak perlu (transaksi itu memang benar terjadi lewat
--     TikTok/Shopee). Pelanggan baru ini murni untuk transaksi ke
--     depan lewat WA.
--  3. Baris di `pembeli_marketplace` TIDAK dihapus setelah
--     "dipromosikan" -- ditautkan lewat kolom `pelanggan_id` di bawah,
--     supaya riwayat jumlah pesanan/total belanja era marketplace-nya
--     tetap kelihatan sebagai referensi. Begitu tertaut, baris itu jadi
--     read-only di halaman Pembeli Marketplace (tidak bisa diedit/
--     dihapus/di-chat dari situ lagi -- sudah "lulus" ke Master Data).
-- =====================================================================

alter table pembeli_marketplace
  add column if not exists pelanggan_id uuid references pelanggan(id) on delete set null;

create index if not exists idx_pembeli_mp_pelanggan on pembeli_marketplace(pelanggan_id) where pelanggan_id is not null;
