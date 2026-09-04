-- =====================================================================
-- 0015  Tandai akun agregat marketplace, sembunyikan dari daftar Pelanggan
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  4 akun SHOPEE/TIKTOK/TOKPED/WA-UMUM (dari seed 0009) bukan pelanggan
--  individual -- itu akun generik dipakai otomatis untuk pesanan online
--  (Sales Order/Faktur kanal online), nama pembeli asli dicatat terpisah
--  di kolom nama_penerima. User minta ini disembunyikan dari daftar
--  Pelanggan (tampilan saja) karena bikin bingung tercampur pelanggan
--  individual -- TAPI datanya harus tetap ada, masih dipakai alur
--  transaksi online. Solusinya: tandai lewat kolom baru `akun_agregat`
--  (bukan hardcode daftar kode di query/view -- supaya kalau nanti ada
--  kanal online baru, tinggal set flag ini, tidak perlu ubah kode lagi),
--  lalu filter di v_pelanggan_ringkas (yang cuma dipakai daftar
--  Pelanggan). Pencarian pelanggan di form transaksi lain (Combobox SO/
--  Faktur dst.) TIDAK disentuh -- itu query langsung ke tabel pelanggan,
--  4 akun ini harus tetap bisa dipilih di sana.
-- =====================================================================

alter table pelanggan add column if not exists akun_agregat boolean not null default false;

update pelanggan set akun_agregat = true
where kode in ('SHOPEE', 'TIKTOK', 'TOKPED', 'WA-UMUM') and not akun_agregat;

create or replace view v_pelanggan_ringkas with (security_invoker = true) as
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
left join profil sp                  on sp.id = pl.sales_id
left join wilayah_kelurahan kel      on kel.kode = pl.kelurahan_kode
left join wilayah_kecamatan kec      on kec.kode = pl.kecamatan_kode
left join wilayah_kabupaten_kota kab on kab.kode = pl.kabupaten_kode
left join wilayah_provinsi prov      on prov.kode = pl.provinsi_kode
where pl.aktif and not pl.akun_agregat;

grant select on v_pelanggan_ringkas to authenticated;
