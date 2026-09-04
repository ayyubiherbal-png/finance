-- =====================================================================
-- 0014  Ganti v_limit_kredit -> v_pelanggan_ringkas (dipakai daftar Pelanggan)
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Sejak 0012/perubahan form Pelanggan, Termin & Limit kredit sudah
--  tidak bisa diisi lewat form (selalu default COD/0) -- jadi daftar
--  Pelanggan yang menampilkan kolom Termin/Limit Kredit/Sisa Limit
--  cuma menampilkan "COD"/"-" di semua baris, tidak informatif lagi.
--  `v_limit_kredit` cuma dipakai satu tempat (daftar Pelanggan), jadi
--  aman diganti total: dibuang, diganti `v_pelanggan_ringkas` yang
--  kolomnya sesuai bentuk form sekarang (Tipe, kontak, Sumber) plus
--  Piutang berjalan (tetap dipertahankan -- ini data riil yang masih
--  berguna terlepas dari limit kredit).
-- =====================================================================

drop view if exists v_limit_kredit;

create or replace view v_pelanggan_ringkas with (security_invoker = true) as
select
  pl.id as pelanggan_id, pl.kode, pl.nama, pl.tipe,
  pl.telepon, pl.whatsapp, pl.sumber, pl.sumber_custom,
  coalesce(pi.total_piutang, 0) as piutang_berjalan
from pelanggan pl
left join v_piutang_aging pi on pi.pelanggan_id = pl.id
where pl.aktif;

grant select on v_pelanggan_ringkas to authenticated;
