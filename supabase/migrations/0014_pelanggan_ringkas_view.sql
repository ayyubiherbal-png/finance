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
--  aman diganti total: dibuang, diganti `v_pelanggan_ringkas` berisi
--  SEMUA field yang ada di form Pelanggan (kecuali piutang -- itu data
--  transaksi, bukan master data, sudah ada tempatnya sendiri di
--  Laporan Piutang / v_piutang_aging). Alamat berjenjang (Provinsi/
--  Kab-Kota/Kecamatan/Kelurahan/Alamat) digabung jadi satu kolom teks
--  supaya daftar tidak perlu 4 kolom wilayah terpisah.
-- =====================================================================

drop view if exists v_limit_kredit;
drop view if exists v_pelanggan_ringkas;

create view v_pelanggan_ringkas with (security_invoker = true) as
select
  pl.id as pelanggan_id, pl.kode, pl.nama, pl.tipe,
  pl.kontak_nama, sp.nama as sales_nama,
  pl.telepon, pl.whatsapp, pl.email,
  pl.sumber, pl.sumber_custom,
  pl.tanggal_lahir, pl.sosial_media,
  nullif(
    concat_ws(', ', nullif(pl.alamat, ''), kel.nama, kec.nama, kab.nama, prov.nama),
    ''
  ) as alamat_lengkap
from pelanggan pl
left join profil sp                        on sp.id = pl.sales_id
left join wilayah_kelurahan kel             on kel.kode = pl.kelurahan_kode
left join wilayah_kecamatan kec             on kec.kode = pl.kecamatan_kode
left join wilayah_kabupaten_kota kab        on kab.kode = pl.kabupaten_kode
left join wilayah_provinsi prov             on prov.kode = pl.provinsi_kode
where pl.aktif;

grant select on v_pelanggan_ringkas to authenticated;
