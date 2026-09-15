-- =====================================================================
-- 0064  Laba kotor per kanal penjualan
--
-- Roadmap laporan keuangan poin #3: "Penjualan & margin per produk/
-- kanal." Per-produk sudah ada sejak lama (v_laba_produk, halaman
-- Laporan Laba Kotor). Per-kanal belum ada sama sekali walau kolom
-- `kanal` (kanal_penjualan) sudah ada di faktur_penjualan sejak awal
-- (0001/0004) justru dirancang untuk laporan ini (lihat komentar
-- migrasi 0001: "Dipakai untuk laporan omzet per kanal").
--
-- Mengikuti pola v_laba_produk/v_laba_pelanggan PERSIS (retur neto,
-- security_invoker) -- bukan logika baru, cuma dimensi group-by baru.
-- =====================================================================

-- v_laba_baris & v_retur_penjualan_produk perlu tahu kanal supaya
-- retur bisa dinetkan ke kanal SUMBER fakturnya (bukan kanal retur --
-- retur_penjualan tidak dan tidak perlu punya kolom kanal sendiri).
-- PENTING: CREATE OR REPLACE VIEW tidak boleh mengubah urutan/nama
-- kolom yang sudah ada -- `kanal` ditambahkan di AKHIR daftar kolom,
-- bukan disisipkan di posisi "alami"-nya dekat kolom faktur lain.
create or replace view v_laba_baris with (security_invoker = true) as
select
  f.id as faktur_id, f.nomor, f.tanggal,
  f.pelanggan_id, pl.nama as nama_pelanggan, pl.sales_id,
  i.produk_id, p.kode as kode_produk, p.nama as nama_produk,
  p.kategori_id,
  i.qty, i.qty_dasar, i.harga_satuan,
  i.subtotal        as omzet,
  i.hpp_total       as hpp,
  i.subtotal - i.hpp_total as laba_kotor,
  case when i.subtotal > 0
       then round((i.subtotal - i.hpp_total) / i.subtotal * 100, 2)
       else 0 end   as margin_persen,
  f.kanal
from faktur_penjualan_item i
join faktur_penjualan f on f.id = i.faktur_id
join pelanggan pl       on pl.id = f.pelanggan_id
join produk p           on p.id = i.produk_id
where f.status <> 'dibatalkan';

create or replace view v_retur_penjualan_produk with (security_invoker = true) as
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
  ), 0) as hpp,
  coalesce(fp.kanal, 'lainnya') as kanal
from retur_penjualan rp
left join faktur_penjualan fp on fp.id = rp.faktur_id
join retur_penjualan_item rpi on rpi.retur_id = rp.id
join pelanggan pl on pl.id = rp.pelanggan_id
join produk p on p.id = rpi.produk_id
where rp.status = 'selesai'
group by rp.id, rp.faktur_id, rp.tanggal, rp.pelanggan_id, pl.nama,
         rpi.produk_id, p.kode, p.nama, fp.kanal;

-- ---------- Laba per kanal (analog persis v_laba_produk) ----------
create view v_laba_kanal with (security_invoker = true) as
select
  kanal,
  count(distinct faktur_id) as jumlah_faktur,
  sum(omzet) as omzet,
  sum(hpp) as hpp,
  sum(omzet - hpp) as laba_kotor,
  case when sum(omzet) > 0
       then round(sum(omzet - hpp) / sum(omzet) * 100, 2)
       else 0 end as margin_persen
from (
  select kanal, faktur_id, omzet, hpp
  from v_laba_baris
  union all
  select kanal, faktur_id, -omzet, -hpp
  from v_retur_penjualan_produk
) n
group by kanal;

grant select on v_laba_kanal to authenticated;
