-- =====================================================================
-- 0013  Pelanggan -- nomor HP (telepon) tidak boleh kembar
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  `kode` (ID pelanggan) sudah `unique` sejak skema awal (0002), jadi
--  tidak perlu perubahan untuk itu. Yang belum ada penjagaannya adalah
--  `telepon` -- ditambah constraint unik di sini. NULL tetap boleh
--  banyak (constraint unik Postgres tidak menganggap NULL sama dengan
--  NULL lain), jadi pelanggan tanpa nomor HP tidak masalah.
--
--  Kalau di data yang sudah ada ternyata sudah ada nomor HP kembar,
--  constraint SENGAJA tidak dipasang (migrasi tetap sukses, cuma kasih
--  NOTICE) -- supaya tidak menghentikan migrasi lain yang menyusul.
--  Perbaiki dulu data yang kembar pakai query ini, baru jalankan ulang
--  migrasi ini:
--
--    select telepon, array_agg(kode) from pelanggan
--    where telepon is not null group by telepon having count(*) > 1;
-- =====================================================================

do $
begin
  if exists (select 1 from pg_constraint where conname = 'uq_pelanggan_telepon') then
    return;
  end if;

  if exists (
    select 1 from pelanggan
    where telepon is not null
    group by telepon
    having count(*) > 1
  ) then
    raise notice 'Ada nomor HP pelanggan yang sama di data yang sudah ada -- constraint unik TIDAK dipasang. Perbaiki data dulu (lihat query di komentar migrasi ini), lalu jalankan ulang 0013.';
  else
    alter table pelanggan add constraint uq_pelanggan_telepon unique (telepon);
  end if;
end $;
