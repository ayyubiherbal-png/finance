-- =====================================================================
-- 0048  Kategori Biaya: tandai operasional vs non-operasional
--
--  Gap yang ditemukan user dari audit laporan keuangan: Pengeluaran Kas
--  sekarang tidak bisa membedakan beban operasional sungguhan (sewa,
--  listrik, iklan, dll) dari pengeluaran non-operasional (setoran
--  modal, ambil pribadi pemilik, dst). Kalau seseorang buat kategori
--  "Modal & Pribadi", pengeluarannya tetap ikut terhitung ke Total
--  Biaya Operasional & Laba Bersih -- padahal secara akuntansi itu
--  BUKAN beban yang mengurangi laba, cuma perpindahan uang.
--
--  Fix: kolom `operasional` di kategori_biaya (default true, supaya
--  kategori yang sudah ada -- termasuk seed 'OPS' -- tetap terhitung
--  seperti sekarang). v_pengeluaran_harian & v_ringkasan_laba_biaya
--  di-filter supaya cuma kategori operasional yang masuk ke Biaya
--  Operasional/Laba Bersih. Saldo kas/bank (v_saldo_kas_bank,
--  v_kartu_kas_bank) SENGAJA TIDAK diubah -- uangnya tetap benar-benar
--  keluar dari kas terlepas dari klasifikasi ini.
-- =====================================================================

alter table kategori_biaya add column operasional boolean not null default true;

-- ---------- v_pengeluaran_harian: cuma kategori operasional ----------
-- Kolom output SAMA PERSIS (tanggal, jumlah_pengeluaran, total_keluar) --
-- cuma filter baris yang berubah, jadi CREATE OR REPLACE VIEW aman.
create or replace view v_pengeluaran_harian with (security_invoker = true) as
select
  p.tanggal,
  count(*)      as jumlah_pengeluaran,
  sum(p.jumlah) as total_keluar
from pengeluaran_kas p
join nama_pengeluaran np on np.id = p.nama_pengeluaran_id
join kategori_biaya kb   on kb.id = np.kategori_biaya_id
where p.status not in ('dibatalkan', 'ditolak') and kb.operasional
group by p.tanggal;

-- ---------- v_ringkasan_laba_biaya: pisah operasional vs non-operasional ----------
-- total_biaya_non_operasional ditambah di AKHIR (kolom baru boleh, asal
-- di ujung -- lihat catatan CREATE OR REPLACE VIEW di migrasi 0046).
create or replace view v_ringkasan_laba_biaya with (security_invoker = true) as
select
  (select coalesce(sum(laba_kotor), 0) from v_laba_baris) as total_laba_kotor,
  (select coalesce(sum(p.jumlah), 0)
     from pengeluaran_kas p
     join nama_pengeluaran np on np.id = p.nama_pengeluaran_id
     join kategori_biaya kb   on kb.id = np.kategori_biaya_id
    where p.status not in ('dibatalkan', 'ditolak') and kb.operasional)     as total_biaya_operasional,
  (select coalesce(sum(laba_kotor), 0) from v_laba_baris)
    - (select coalesce(sum(p.jumlah), 0)
         from pengeluaran_kas p
         join nama_pengeluaran np on np.id = p.nama_pengeluaran_id
         join kategori_biaya kb   on kb.id = np.kategori_biaya_id
        where p.status not in ('dibatalkan', 'ditolak') and kb.operasional) as laba_bersih,
  (select coalesce(sum(p.jumlah), 0)
     from pengeluaran_kas p
     join nama_pengeluaran np on np.id = p.nama_pengeluaran_id
     join kategori_biaya kb   on kb.id = np.kategori_biaya_id
    where p.status not in ('dibatalkan', 'ditolak') and not kb.operasional) as total_biaya_non_operasional;

grant select on v_pengeluaran_harian, v_ringkasan_laba_biaya to authenticated;
