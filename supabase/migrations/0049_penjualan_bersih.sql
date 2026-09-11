-- =====================================================================
-- 0049  v_penjualan_harian: kurangi Retur Penjualan & balik HPP-nya
--
--  Ditemukan dari audit laporan keuangan user: v_laba_baris (sumber
--  omzet/laba_kotor di Dashboard dan laporan) sama sekali tidak
--  mengurangi Retur Penjualan. Retur yang sudah diposting
--  (status='selesai') tetap membuat omzet & laba kotor terlihat lebih
--  besar dari kenyataan. View lama juga hanya bertolak dari tanggal
--  penjualan, sehingga retur pada hari tanpa faktur baru akan hilang.
--
--  diskon_header di faktur_penjualan SENGAJA tidak ditangani di sini --
--  dikonfirmasi tidak pernah diisi lewat UI manapun (selalu 0 di
--  praktiknya, item-level discount sudah baked-in ke subtotal lewat
--  generated column), jadi bukan gap aktif.
-- =====================================================================

-- Kolom lama (tanggal, jumlah_faktur, omzet, laba_kotor) TIDAK berubah
-- posisi -- hpp, retur, penjualan_bersih ditambah di AKHIR. `omzet`
-- tetap penjualan kotor demi kompatibilitas; UI memakai
-- `penjualan_bersih`. `hpp` dan `laba_kotor` sudah NETO setelah retur.
--
-- HPP retur dibaca dari stok_mutasi, bukan HPP produk saat ini. Ini
-- mempertahankan snapshot HPP tepat saat retur diposting. Retur dengan
-- masuk_stok=false memang tidak membalik HPP: barang tidak kembali jadi
-- persediaan, sehingga biaya barangnya tetap terealisasi.
create or replace view v_penjualan_harian with (security_invoker = true) as
with penjualan as (
  select
    tanggal,
    count(distinct faktur_id) as jumlah_faktur,
    sum(omzet) as omzet,
    sum(hpp) as hpp
  from v_laba_baris
  group by tanggal
),
retur_per_dokumen as (
  select
    rp.id,
    rp.tanggal,
    sum(rpi.subtotal) as retur,
    coalesce((
      select sum(sm.qty_dasar * sm.hpp_satuan)
      from stok_mutasi sm
      where sm.ref_tabel = 'retur_penjualan'
        and sm.ref_id = rp.id
    ), 0) as hpp_dikembalikan
  from retur_penjualan rp
  join retur_penjualan_item rpi on rpi.retur_id = rp.id
  where rp.status = 'selesai'
  group by rp.id, rp.tanggal
),
retur as (
  select
    tanggal,
    sum(retur) as retur,
    sum(hpp_dikembalikan) as hpp_dikembalikan
  from retur_per_dokumen
  group by tanggal
),
tanggal_aktivitas as (
  select tanggal from penjualan
  union
  select tanggal from retur
)
select
  d.tanggal,
  coalesce(p.jumlah_faktur, 0::bigint) as jumlah_faktur,
  coalesce(p.omzet, 0) as omzet,
  (coalesce(p.omzet, 0) - coalesce(r.retur, 0))
    - (coalesce(p.hpp, 0) - coalesce(r.hpp_dikembalikan, 0)) as laba_kotor,
  coalesce(p.hpp, 0) - coalesce(r.hpp_dikembalikan, 0) as hpp,
  coalesce(r.retur, 0) as retur,
  coalesce(p.omzet, 0) - coalesce(r.retur, 0) as penjualan_bersih
from tanggal_aktivitas d
left join penjualan p on p.tanggal = d.tanggal
left join retur r on r.tanggal = d.tanggal;

grant select on v_penjualan_harian to authenticated;

-- ---------- Retur neto per produk ----------
-- View antara ini mengagregasi per dokumen+produk agar aman jika satu
-- produk muncul lebih dari sekali di rincian retur. HPP mengikuti mutasi
-- stok retur yang sama dengan perhitungan harian di atas.
create view v_retur_penjualan_produk with (security_invoker = true) as
select
  rp.id as retur_id,
  rp.faktur_id,
  rp.tanggal,
  rp.pelanggan_id,
  pl.nama as nama_pelanggan,
  rpi.produk_id,
  p.kode as kode_produk,
  p.nama as nama_produk,
  sum(rpi.qty_dasar) as qty_dasar,
  sum(rpi.subtotal) as omzet,
  coalesce((
    select sum(sm.qty_dasar * sm.hpp_satuan)
    from stok_mutasi sm
    where sm.ref_tabel = 'retur_penjualan'
      and sm.ref_id = rp.id
      and sm.produk_id = rpi.produk_id
  ), 0) as hpp
from retur_penjualan rp
join retur_penjualan_item rpi on rpi.retur_id = rp.id
join pelanggan pl on pl.id = rp.pelanggan_id
join produk p on p.id = rpi.produk_id
where rp.status = 'selesai'
group by rp.id, rp.faktur_id, rp.tanggal, rp.pelanggan_id, pl.nama,
         rpi.produk_id, p.kode, p.nama;

grant select on v_retur_penjualan_produk to authenticated;

-- Analisis per produk: faktur positif + retur negatif. Nama/kode tetap
-- diambil dari snapshot view transaksi yang sudah ada.
create or replace view v_laba_produk with (security_invoker = true) as
select
  produk_id,
  kode_produk,
  nama_produk,
  sum(qty_dasar) as qty_terjual,
  sum(omzet) as omzet,
  sum(hpp) as hpp,
  sum(omzet - hpp) as laba_kotor,
  case when sum(omzet) > 0
       then round(sum(omzet - hpp) / sum(omzet) * 100, 2)
       else 0 end as margin_persen
from (
  select produk_id, kode_produk, nama_produk, qty_dasar, omzet, hpp
  from v_laba_baris
  union all
  select produk_id, kode_produk, nama_produk, -qty_dasar, -omzet, -hpp
  from v_retur_penjualan_produk
) n
group by produk_id, kode_produk, nama_produk;

-- Analisis per pelanggan memakai prinsip neto yang sama. Retur tanpa
-- faktur asal tetap mengurangi nilai pelanggan, tetapi tidak mengurangi
-- jumlah faktur karena memang tidak ada faktur yang bisa dihitung.
create or replace view v_laba_pelanggan with (security_invoker = true) as
select
  pelanggan_id,
  nama_pelanggan,
  count(distinct faktur_id) as jumlah_faktur,
  sum(omzet) as omzet,
  sum(hpp) as hpp,
  sum(omzet - hpp) as laba_kotor,
  case when sum(omzet) > 0
       then round(sum(omzet - hpp) / sum(omzet) * 100, 2)
       else 0 end as margin_persen
from (
  select pelanggan_id, nama_pelanggan, faktur_id, omzet, hpp
  from v_laba_baris
  union all
  select pelanggan_id, nama_pelanggan, faktur_id, -omzet, -hpp
  from v_retur_penjualan_produk
) n
group by pelanggan_id, nama_pelanggan;

grant select on v_laba_produk, v_laba_pelanggan to authenticated;

-- Ringkasan semua waktu memakai laba kotor neto yang sama dengan
-- laporan harian dan analisis produk/pelanggan.
create or replace view v_ringkasan_laba_biaya with (security_invoker = true) as
select
  (select coalesce(sum(laba_kotor), 0) from v_penjualan_harian) as total_laba_kotor,
  (select coalesce(sum(p.jumlah), 0)
     from pengeluaran_kas p
     join nama_pengeluaran np on np.id = p.nama_pengeluaran_id
     join kategori_biaya kb   on kb.id = np.kategori_biaya_id
    where p.status not in ('dibatalkan', 'ditolak') and kb.operasional)     as total_biaya_operasional,
  (select coalesce(sum(laba_kotor), 0) from v_penjualan_harian)
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

grant select on v_ringkasan_laba_biaya to authenticated;
